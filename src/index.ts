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
    const res = await fetch('https://api.minimaxi.com/v1/models', {
      headers: { 'Authorization': `Bearer ${c.env.OPENAI_API_KEY}` }
    })
    const text = await res.text()
    return c.json({ ok: true, status: res.status, body: text.slice(0, 200) })
  } catch (e) {
    return c.json({ ok: false, error: String(e) })
  }
})

export default app
