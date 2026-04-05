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

app.use('*', cors({
  origin: (origin, c) => {
    const allowed = ((c.env.ALLOWED_ORIGIN as string | undefined) || 'http://localhost:5173')
      .split(',')
      .map(o => o.trim())
    return allowed.includes(origin) ? origin : ''
  },
  credentials: true,
}))

app.route('/', compareRouter)

app.get('/', (c) => {
  return c.json({ status: 'ok', message: 'RepoMind Worker is running', version: 3 })
})

export default app
