import { Hono } from 'hono'
import { createRepoAgent } from '../agents/repo-agent'
import { streamSummary } from '../agents/summarizer-agent'

type Env = {
  MINIMAX_API_KEY: string
}

const app = new Hono<{ Bindings: Env }>()

async function sseEvent(writer: WritableStreamDefaultWriter<Uint8Array>, data: unknown) {
  const encoder = new TextEncoder()
  await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
}

const REPO_REGEX = /^[a-zA-Z0-9._/-]+$/

app.post('/api/compare', async (c) => {
  const { repos } = await c.req.json<{ repos: string[] }>()

  if (!repos || repos.length < 2 || repos.length > 3) {
    return c.json({ error: 'Provide 2-3 repos' }, 400)
  }

  // Validate repo format
  for (const repo of repos) {
    if (!REPO_REGEX.test(repo.trim())) {
      return c.json({ error: `Invalid repo format: "${repo}". Use "owner/repo" or GitHub URL.` }, 400)
    }
  }

  const minimaxApiKey = c.env.MINIMAX_API_KEY
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()

  ;(async () => {
    try {
      // Phase 1: parallel repo analysis
      const analyses = await Promise.all(
        repos.map(async (repo) => {
          await sseEvent(writer, { type: 'progress', msg: `正在分析 ${repo}...` })
          const analysis = await createRepoAgent(repo, minimaxApiKey)
          await sseEvent(writer, { type: 'progress', msg: `✅ ${repo} 分析完成` })
          return { repo, analysis }
        })
      )

      // Phase 2: streaming summary
      await sseEvent(writer, { type: 'progress', msg: '正在生成对比报告...' })
      for await (const chunk of streamSummary(analyses, minimaxApiKey)) {
        await sseEvent(writer, { type: 'text', chunk })
      }
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
