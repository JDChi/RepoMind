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
  return c.json({ status: 'ok', message: 'RepoMind Worker is running' })
})

export default app
