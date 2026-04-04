import { Hono } from 'hono'
import { cors } from 'hono/cors'
import compareRouter from './routes/compare'

type Env = {
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
  AI_MODEL_NAME: string
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors())
app.route('/', compareRouter)

app.get('/', (c) => {
  return c.json({ status: 'ok', message: 'RepoMind Worker is running', version: 3 })
})

app.get('/test', async (c) => {
  try {
    const baseUrl = c.env.OPENAI_BASE_URL || 'https://api.minimaxi.com/v1'
    const model = c.env.AI_MODEL_NAME || 'MiniMax-M2.7'
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'say hello in 3 words' }],
        max_tokens: 50
      })
    })
    const text = await res.text()
    return c.json({ ok: true, status: res.status, model, body: text.slice(0, 300) })
  } catch (e) {
    return c.json({ ok: false, error: String(e) })
  }
})

app.get('/test2', async (c) => {
  try {
    const { generateText } = await import('ai')
    const { createMinimaxOpenAI } = await import('vercel-minimax-ai-provider')
    const minimax = createMinimaxOpenAI({
      apiKey: c.env.OPENAI_API_KEY,
      baseURL: c.env.OPENAI_BASE_URL
    })
    const model = minimax(c.env.AI_MODEL_NAME || 'MiniMax-M2.7')
    const result = await generateText({
      model,
      prompt: 'say hello in 3 words',
      maxTokens: 50
    })
    return c.json({ ok: true, text: result.text })
  } catch (e) {
    return c.json({ ok: false, error: String(e) })
  }
})

export default app
