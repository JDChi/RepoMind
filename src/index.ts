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

app.use('*', (c, next) =>
  cors({ origin: c.env.ALLOWED_ORIGIN || 'http://localhost:5173' })(c, next)
)
app.route('/', compareRouter)

app.get('/', (c) => {
  return c.json({ status: 'ok', message: 'RepoMind Worker is running', version: 3 })
})

export default app
