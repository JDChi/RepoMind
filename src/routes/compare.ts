import { Hono } from 'hono'
import { streamRepoAgent } from '../agents/repo-agent'
import { streamSummary } from '../agents/summarizer-agent'
import { validateAndParseRepo } from '../utils/repo'

type Env = {
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
  AI_MODEL_NAME: string
  GITHUB_TOKEN?: string
  ALLOWED_ORIGIN?: string
  NODE_ENV?: string
}

const app = new Hono<{ Bindings: Env }>()

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
    const isLocal = c.env.NODE_ENV === 'local'
    try {
      // Phase 1: repo analysis
      const analyses: Array<{ repo: string; analysis: string }> = []
      const repoStats: Array<{ repo: string; promptTokens: number; completionTokens: number; totalTokens: number }> = []

      const processRepo = async (repo: string) => {
        await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'repo_progress', repo, msg: `🚀 开始分析 ${repo}...` })}\n\n`))

        let analysisText = ''
        let repoTokens = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        for await (const event of streamRepoAgent(repo, apiKey, baseURL, modelName, c.env.GITHUB_TOKEN, signal)) {
          if (event.type === 'progress') {
            await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'repo_progress', repo, msg: event.msg })}\n\n`))
          } else if (event.type === 'text') {
            analysisText += event.chunk
            await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'repo_text', repo, chunk: event.chunk })}\n\n`))
          } else if (event.type === 'reasoning') {
            analysisText += event.chunk
            await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'repo_reasoning', repo, chunk: event.chunk })}\n\n`))
          } else if (event.type === 'usage') {
            repoTokens = { promptTokens: event.promptTokens, completionTokens: event.completionTokens, totalTokens: event.totalTokens }
          }
        }

        await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'repo_done', repo })}\n\n`))
        analyses.push({ repo, analysis: analysisText })
        repoStats.push({ repo, ...repoTokens })
      }

      // Run in parallel locally (no subrequest limit), sequentially in production
      if (isLocal) {
        await Promise.all(repos.map(processRepo))
      } else {
        for (const repo of repos) await processRepo(repo)
      }

      // Phase 2: streaming summary
      await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'progress', msg: '正在生成对比报告...' })}\n\n`))
      const summaryUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      for await (const chunk of streamSummary(analyses, apiKey, baseURL, modelName, summaryUsage, signal)) {
        await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text', chunk })}\n\n`))
      }

      // Emit stats as text chunk appended to report
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      const totalTokens = repoStats.reduce((s, r) => s + r.totalTokens, 0) + summaryUsage.totalTokens
      const statsText = `\n\n---\n\n**📊 统计信息** | 耗时: ${elapsed}s | 💰 共消耗 ${totalTokens} tokens\n`
      await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text', chunk: statsText })}\n\n`))
      await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error'
      await writer.write(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'error', msg: message })}\n\n`))
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
