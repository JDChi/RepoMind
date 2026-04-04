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
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: c.env.AI_MODEL_NAME || 'MiniMax-M2.7',
        messages: [{ role: 'user', content: 'hi' }]
      })
    })
    const text = await res.text()
    return c.json({ ok: true, status: res.status, body: text.slice(0, 300) })
  } catch (e) {
    return c.json({ ok: false, error: String(e) })
  }
})

export default app
