export interface ButtonEventPayload {
  eventName: 'compare_click' | 'add_repo_click' | 'remove_repo_click' | 'export_markdown_click' | 'export_html_click'
  buttonLabel: string
  repoInputs: string[]
  metadata?: Record<string, unknown>
}

interface TrackButtonClickOptions extends ButtonEventPayload {
  apiBaseUrl: string
}

const ANONYMOUS_ID_KEY = 'repomind_anonymous_id'
const SESSION_ID_KEY = 'repomind_session_id'

let fallbackAnonymousId: string | null = null
let fallbackSessionId: string | null = null

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id_${Math.random().toString(36).slice(2)}_${Date.now()}`
}

function isStorageLike(value: unknown): value is Pick<Storage, 'getItem' | 'setItem'> {
  return !!value
    && typeof value === 'object'
    && typeof (value as Storage).getItem === 'function'
    && typeof (value as Storage).setItem === 'function'
}

function getStoredId(kind: 'anonymous' | 'session') {
  const key = kind === 'anonymous' ? ANONYMOUS_ID_KEY : SESSION_ID_KEY
  const candidate = kind === 'anonymous' ? globalThis.localStorage : globalThis.sessionStorage

  if (isStorageLike(candidate)) {
    const storage = candidate
    const existing = storage.getItem(key)
    if (existing) return existing
    const created = createId()
    storage.setItem(key, created)
    return created
  }

  if (kind === 'anonymous') {
    fallbackAnonymousId ||= createId()
    return fallbackAnonymousId
  }

  fallbackSessionId ||= createId()
  return fallbackSessionId
}

export function buildButtonEvent(payload: ButtonEventPayload) {
  return {
    eventName: payload.eventName,
    page: typeof window === 'undefined' ? '/' : window.location.pathname || '/',
    repoInputs: payload.repoInputs,
    repoCount: payload.repoInputs.length,
    buttonLabel: payload.buttonLabel,
    anonymousId: getStoredId('anonymous'),
    sessionId: getStoredId('session'),
    metadata: payload.metadata ?? {},
    clientTs: new Date().toISOString(),
  }
}

export async function trackButtonClick({ apiBaseUrl, ...payload }: TrackButtonClickOptions) {
  try {
    await fetch(`${apiBaseUrl}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildButtonEvent(payload)),
      keepalive: true,
    })
  } catch {
    // Analytics failures must never block the primary UI action.
  }
}
