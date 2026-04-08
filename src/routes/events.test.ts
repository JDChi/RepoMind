import { describe, expect, it, vi } from 'vitest'
import app from './events'

describe('POST /api/events', () => {
  function createDbMock() {
    const run = vi.fn().mockResolvedValue({ success: true })
    const bind = vi.fn().mockReturnValue({ run })
    const prepare = vi.fn().mockReturnValue({ bind })
    return {
      db: { prepare } as unknown as D1Database,
      prepare,
      bind,
      run,
    }
  }

  it('accepts a valid button event', async () => {
    const { db, bind, run } = createDbMock()
    const res = await app.request('/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Vitest',
        'CF-Connecting-IP': '127.0.0.1',
      },
      body: JSON.stringify({
        eventName: 'compare_click',
        page: '/',
        repoInputs: ['vercel/ai', 'crewAIInc/crewAI'],
        repoCount: 2,
        buttonLabel: '开始对比',
        anonymousId: 'anon-1',
        sessionId: 'session-1',
        metadata: {},
        clientTs: new Date().toISOString(),
      }),
    }, { DB: db })

    expect(res.status).toBe(204)
    expect(bind).toHaveBeenCalledWith(
      'compare_click',
      '/',
      JSON.stringify(['vercel/ai', 'crewAIInc/crewAI']),
      2,
      '开始对比',
      'anon-1',
      'session-1',
      expect.any(String),
      'Vitest',
      expect.stringMatching(/^[a-f0-9]{64}$/),
    )
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('rejects a mismatched repoCount', async () => {
    const { db } = createDbMock()
    const res = await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName: 'compare_click',
        page: '/',
        repoInputs: ['vercel/ai', 'crewAIInc/crewAI'],
        repoCount: 1,
        buttonLabel: '开始对比',
        anonymousId: 'anon-1',
        sessionId: 'session-1',
      }),
    }, { DB: db })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'repoCount does not match repoInputs length',
    })
  })

  it('rejects malformed payloads', async () => {
    const { db } = createDbMock()
    const res = await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: '/',
        repoInputs: 'vercel/ai',
      }),
    }, { DB: db })

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'Invalid event payload',
    })
  })

  it('returns 500 when the database write fails', async () => {
    const run = vi.fn().mockRejectedValue(new Error('db unavailable'))
    const bind = vi.fn().mockReturnValue({ run })
    const prepare = vi.fn().mockReturnValue({ bind })
    const db = { prepare } as unknown as D1Database

    const res = await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName: 'compare_click',
        page: '/',
        repoInputs: ['vercel/ai', 'crewAIInc/crewAI'],
        repoCount: 2,
        buttonLabel: '开始对比',
        anonymousId: 'anon-1',
        sessionId: 'session-1',
      }),
    }, { DB: db })

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      error: 'Failed to store event',
    })
  })
})
