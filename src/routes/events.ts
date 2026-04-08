import { Hono } from 'hono'
import { z } from 'zod'

const eventSchema = z.object({
  eventName: z.string().min(1),
  page: z.string().min(1),
  repoInputs: z.array(z.string()),
  repoCount: z.number().int().nonnegative(),
  buttonLabel: z.string().min(1),
  anonymousId: z.string().min(1),
  sessionId: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  clientTs: z.string().min(1).optional(),
})

type Env = {
  DB: D1Database
}

async function sha256Hex(input: string) {
  const encoded = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

const app = new Hono<{ Bindings: Env }>()

app.post('/api/events', async (c) => {
  let body: unknown

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const parsed = eventSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid event payload' }, 400)
  }

  if (parsed.data.repoCount !== parsed.data.repoInputs.length) {
    return c.json({ error: 'repoCount does not match repoInputs length' }, 400)
  }

  const userAgent = c.req.header('User-Agent') || null
  const clientIp = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null
  const ipHash = clientIp ? await sha256Hex(clientIp) : null

  try {
    await c.env.DB
      .prepare(`
        INSERT INTO button_events (
          event_name,
          page,
          repo_inputs_json,
          repo_count,
          button_label,
          anonymous_id,
          session_id,
          client_ts,
          user_agent,
          ip_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        parsed.data.eventName,
        parsed.data.page,
        JSON.stringify(parsed.data.repoInputs),
        parsed.data.repoCount,
        parsed.data.buttonLabel,
        parsed.data.anonymousId,
        parsed.data.sessionId,
        parsed.data.clientTs || null,
        userAgent,
        ipHash,
      )
      .run()
  } catch {
    return c.json({ error: 'Failed to store event' }, 500)
  }

  return c.body(null, 204)
})

export default app
