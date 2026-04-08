import { describe, expect, it, vi, afterEach } from 'vitest'
import { buildButtonEvent, trackButtonClick } from './analytics'

describe('buildButtonEvent', () => {
  it('builds a button event with repo context', () => {
    const event = buildButtonEvent({
      eventName: 'compare_click',
      buttonLabel: '开始对比',
      repoInputs: ['vercel/ai', 'crewAIInc/crewAI'],
      metadata: { source: 'hero' },
    })

    expect(event.eventName).toBe('compare_click')
    expect(event.page).toBe('/')
    expect(event.repoInputs).toEqual(['vercel/ai', 'crewAIInc/crewAI'])
    expect(event.repoCount).toBe(2)
    expect(event.buttonLabel).toBe('开始对比')
    expect(event.anonymousId).toMatch(/^id_|^[0-9a-f-]{36}$/)
    expect(event.sessionId).toMatch(/^id_|^[0-9a-f-]{36}$/)
    expect(event.metadata).toEqual({ source: 'hero' })
    expect(event.clientTs).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('reuses anonymous and session ids across events in the same runtime', () => {
    const first = buildButtonEvent({
      eventName: 'compare_click',
      buttonLabel: '开始对比',
      repoInputs: ['vercel/ai'],
    })

    const second = buildButtonEvent({
      eventName: 'add_repo_click',
      buttonLabel: '+ 添加仓库',
      repoInputs: ['vercel/ai', ''],
    })

    expect(second.anonymousId).toBe(first.anonymousId)
    expect(second.sessionId).toBe(first.sessionId)
  })
})

describe('trackButtonClick', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('posts analytics payload to the worker endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await trackButtonClick({
      apiBaseUrl: 'http://localhost:8787',
      eventName: 'export_markdown_click',
      buttonLabel: 'Markdown',
      repoInputs: ['vercel/ai'],
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8787/api/events',
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  })

  it('swallows network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))

    await expect(trackButtonClick({
      apiBaseUrl: '',
      eventName: 'add_repo_click',
      buttonLabel: '+ 添加仓库',
      repoInputs: ['vercel/ai'],
    })).resolves.toBeUndefined()
  })
})
