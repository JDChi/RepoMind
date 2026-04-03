import { Hono } from 'hono'
import { cors } from 'hono/cors'
import compareRouter from './routes/compare'

type Env = {
  MINIMAX_API_KEY: string
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors())
app.route('/', compareRouter)

export default app
