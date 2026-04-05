import { Hono } from 'hono'
import { cors } from 'hono/cors'
import compareRouter from './routes/compare'

type Env = {
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
  AI_MODEL_NAME: string
  ALLOWED_ORIGIN?: string
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', async (c, next) => {
  const allowedOrigins = (c.env.ALLOWED_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map(o => o.trim())
  const origin = c.req.header('Origin') || ''
  const isAllowed = allowedOrigins.includes(origin)
  if (isAllowed) {
    c.header('Access-Control-Allow-Origin', origin)
  } else if (allowedOrigins.includes('*')) {
    c.header('Access-Control-Allow-Origin', '*')
  }
  if (isAllowed || allowedOrigins.includes('*')) {
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    c.header('Access-Control-Allow-Headers', 'Content-Type')
    c.header('Access-Control-Allow-Credentials', 'true')
    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204)
    }
  }
  await next()
})

app.route('/', compareRouter)

app.get('/', (c) => {
  return c.json({ status: 'ok', message: 'RepoMind Worker is running', version: 3 })
})

export default app
