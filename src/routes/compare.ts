import { Hono } from 'hono'
import { createRepoAgent } from '../agents/repo-agent'
import { streamSummary } from '../agents/summarizer-agent'

type Env = {
  MINIMAX_API_KEY: string
}

const app = new Hono<{ Bindings: Env }>()

function sseEvent(writer: WritableStreamDefaultWriter<Uint8Array>, data: unknown) {
  const encoder = new TextEncoder()
  writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
}

app.post('/api/compare', async (c) => {
  const { repos } = await c.req.json<{ repos: string[] }>()

  if (!repos || repos.length < 2 || repos.length > 3) {
    return c.json({ error: 'Provide 2-3 repos' }, 400)
  }

  const minimaxApiKey = c.env.MINIMAX_API_KEY
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()

  ;(async () => {
    try {
      // Phase 1: parallel repo analysis
      const analyses = await Promise.all(
        repos.map(async (repo) => {
          sseEvent(writer, { type: 'progress', msg: `正在分析 ${repo}...` })
          const analysis = await createRepoAgent(repo, minimaxApiKey)
          sseEvent(writer, { type: 'progress', msg: `✅ ${repo} 分析完成` })
          return { repo, analysis }
        })
      )

      // Phase 2: streaming summary
      sseEvent(writer, { type: 'progress', msg: '正在生成对比报告...' })
      for await (const chunk of streamSummary(analyses, minimaxApiKey)) {
        sseEvent(writer, { type: 'text', chunk })
      }
      sseEvent(writer, { type: 'done' })
    } catch (err) {
      sseEvent(writer, { type: 'error', msg: String(err) })
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
