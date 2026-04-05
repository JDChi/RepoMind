import { Hono } from 'hono'
import { streamRepoAgent } from '../agents/repo-agent'
import { streamSummary } from '../agents/summarizer-agent'
import { validateAndParseRepo } from '../utils/repo'

type Env = {
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
  AI_MODEL_NAME: string
  GITHUB_TOKEN?: string
}

const app = new Hono<{ Bindings: Env }>()

async function sseEvent(writer: WritableStreamDefaultWriter<Uint8Array>, data: unknown) {
  const encoder = new TextEncoder()
  await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
}

app.post('/api/compare', async (c) => {
  const { repos } = await c.req.json<{ repos: string[] }>()

  if (!repos || repos.length < 2 || repos.length > 3) {
    return c.json({ error: 'Provide 2-3 repos' }, 400)
  }

  // Validate and parse repo format (supports both "owner/repo" and GitHub URLs)
  for (const repo of repos) {
    try {
      validateAndParseRepo(repo)
    } catch {
      return c.json({ error: `Invalid repo format: "${repo}". Use "owner/repo" or GitHub URL.` }, 400)
    }
  }

  const signal = c.req.raw.signal
  const apiKey = c.env.OPENAI_API_KEY
  const baseURL = c.env.OPENAI_BASE_URL
  const modelName = c.env.AI_MODEL_NAME
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()

  ;(async () => {
    const startTime = Date.now()
    try {
      // Phase 1: parallel repo analysis (streaming each repo's output)
      const analyses: Array<{ repo: string; analysis: string }> = []
      const repoStats: Array<{ repo: string; promptTokens: number; completionTokens: number; totalTokens: number }> = []

      await Promise.all(
        repos.map(async (repo) => {
          await sseEvent(writer, { type: 'progress', msg: `🚀 开始分析 ${repo}...` })

          let analysisText = ''
          let repoTokens = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
          for await (const event of streamRepoAgent(repo, apiKey, baseURL, modelName, c.env.GITHUB_TOKEN, signal)) {
            if (event.type === 'progress') {
              await sseEvent(writer, { type: 'repo_progress', repo, msg: event.msg })
            } else if (event.type === 'text') {
              analysisText += event.chunk
              await sseEvent(writer, { type: 'repo_text', repo, chunk: event.chunk })
            } else if (event.type === 'reasoning') {
              analysisText += event.chunk
              await sseEvent(writer, { type: 'repo_reasoning', repo, chunk: event.chunk })
            } else if (event.type === 'usage') {
              repoTokens = { promptTokens: event.promptTokens, completionTokens: event.completionTokens, totalTokens: event.totalTokens }
            }
          }

          await sseEvent(writer, { type: 'repo_done', repo })
          analyses.push({ repo, analysis: analysisText })
          repoStats.push({ repo, ...repoTokens })
        })
      )

      // Phase 2: streaming summary
      await sseEvent(writer, { type: 'progress', msg: '正在生成对比报告...' })
      const summaryUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      for await (const chunk of streamSummary(analyses, apiKey, baseURL, modelName, summaryUsage, signal)) {
        await sseEvent(writer, { type: 'text', chunk })
      }

      // Emit stats as text chunk appended to report
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      const totalTokens = repoStats.reduce((s, r) => s + r.totalTokens, 0) + summaryUsage.totalTokens
      const statsText = `\n\n---\n\n**📊 统计信息** | 耗时: ${elapsed}s | 💰 共消耗 ${totalTokens} tokens\n`
      await sseEvent(writer, { type: 'text', chunk: statsText })
      await sseEvent(writer, { type: 'done' })
    } catch (err) {
      // Don't expose internal errors to client
      const message = err instanceof Error ? err.message : 'Internal error'
      await sseEvent(writer, { type: 'error', msg: message })
    } finally {
      writer.close()
    }
  })()

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
})

export default app
