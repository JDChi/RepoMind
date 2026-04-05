import { useState, useRef, useEffect } from 'react'
import { RepoInput } from './components/RepoInput'
import { ReportView } from './components/ReportView'
import { ExportButton } from './components/ExportButton'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

function normalizeRepo(input: string): string {
  const trimmed = input.trim()
  const match = trimmed.match(/github\.com\/([^/]+)\/([^/?#]+)/)
  if (match) return `${match[1]}/${match[2]}`
  return trimmed
}

function findDuplicates(repos: string[]): string[] {
  const normalized = repos.map(normalizeRepo).filter(r => r.includes('/'))
  const seen = new Set<string>()
  const duplicates: string[] = []
  for (const repo of normalized) {
    if (seen.has(repo)) duplicates.push(repo)
    else seen.add(repo)
  }
  return duplicates
}

interface RepoPanel {
  repo: string
  text: string
  reasoning: string
  displayedText: string
  displayedReasoning: string
  logs: string[]
  done: boolean
}

export default function App() {
  const [repos, setRepos] = useState(['vercel/ai', 'crewAIInc/crewAI'])
  const [report, setReport] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [repoPanels, setRepoPanels] = useState<RepoPanel[]>([])
  const panelBodyRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const textElRefs = useRef<Record<string, HTMLElement | null>>({})
  const reasoningElRefs = useRef<Record<string, HTMLElement | null>>({})
  const repoKeysRef = useRef(repos.map((_, i) => `k${i}`))
  // Accumulated text (written directly to DOM, not React state during stream)
  const textAccRefs = useRef<Record<string, string>>({})
  const reasoningAccRefs = useRef<Record<string, string>>({})
  // Typewriter: track how many chars have been displayed so far
  const textDisplayedRefs = useRef<Record<string, number>>({})
  const reasoningDisplayedRefs = useRef<Record<string, number>>({})
  const textIntervalRefs = useRef<Record<string, ReturnType<typeof setInterval> | null>>({})
  const reasoningIntervalRefs = useRef<Record<string, ReturnType<typeof setInterval> | null>>({})
  // Report typewriter
  const reportAccRef = useRef('')
  const reportDisplayedRef = useRef(0)
  const reportIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const canSubmit = !isLoading && repos.every(r => r.trim().includes('/'))

  // Typewriter: advance display pointer by N chars per tick (30ms)
  // Normally 3 chars/tick = ~100 chars/sec; if lag > 150 chars, speed up to catch up
  const startTextWriter = (repo: string) => {
    if (textIntervalRefs.current[repo]) return
    textIntervalRefs.current[repo] = setInterval(() => {
      const acc = textAccRefs.current[repo] || ''
      const displayed = textDisplayedRefs.current[repo] ?? 0
      if (displayed >= acc.length) return
      const lag = acc.length - displayed
      const step = lag > 150 ? 15 : 3
      const next = Math.min(displayed + step, acc.length)
      textDisplayedRefs.current[repo] = next
      const el = textElRefs.current[repo]
      if (el) {
        el.innerHTML = escapeHtml(acc.slice(0, next)).replace(/\n/g, '<br>') + '<span class="streaming-cursor"></span>'
        const panel = panelBodyRefs.current[repo]
        if (panel) panel.scrollTop = panel.scrollHeight
      }
    }, 30)
  }

  const startReasoningWriter = (repo: string) => {
    if (reasoningIntervalRefs.current[repo]) return
    reasoningIntervalRefs.current[repo] = setInterval(() => {
      const acc = reasoningAccRefs.current[repo] || ''
      const displayed = reasoningDisplayedRefs.current[repo] ?? 0
      if (displayed >= acc.length) return
      const lag = acc.length - displayed
      const step = lag > 150 ? 15 : 3
      const next = Math.min(displayed + step, acc.length)
      reasoningDisplayedRefs.current[repo] = next
      const el = reasoningElRefs.current[repo]
      if (el) {
        el.innerHTML = escapeHtml(acc.slice(0, next)).replace(/\n/g, '<br>')
        const panel = panelBodyRefs.current[repo]
        if (panel) panel.scrollTop = panel.scrollHeight
      }
    }, 30)
  }

  const startReportWriter = () => {
    if (reportIntervalRef.current) return
    reportIntervalRef.current = setInterval(() => {
      const acc = reportAccRef.current
      const displayed = reportDisplayedRef.current
      if (displayed >= acc.length) return
      const lag = acc.length - displayed
      const step = lag > 150 ? 15 : 3
      const next = Math.min(displayed + step, acc.length)
      reportDisplayedRef.current = next
      setReport(acc.slice(0, next))
    }, 30)
  }

  // Auto-scroll panel to bottom when content streams
  useEffect(() => {
    if (!isLoading) return
    Object.values(panelBodyRefs.current).forEach(el => {
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [repoPanels, isLoading])

  // Auto-scroll report section when content streams
  useEffect(() => {
    if (!report) return
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }, [report])

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(textIntervalRefs.current).forEach(id => id && clearInterval(id))
      Object.values(reasoningIntervalRefs.current).forEach(id => id && clearInterval(id))
      if (reportIntervalRef.current) clearInterval(reportIntervalRef.current)
    }
  }, [])

  // Stable repo keys when repos change
  useEffect(() => {
    repoKeysRef.current = repos.map((_, i) => `k${i}`)
  }, [repos])

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  const handleCompare = async () => {
    const dups = findDuplicates(repos)
    if (dups.length > 0) {
      setError(`检测到重复仓库: ${dups.join(', ')}`)
      return
    }
    setError(null)
    setIsLoading(true)
    setReport('')
    // Reset typewriter state
    textAccRefs.current = {}
    reasoningAccRefs.current = {}
    textDisplayedRefs.current = {}
    reasoningDisplayedRefs.current = {}
    // Reset report typewriter
    reportAccRef.current = ''
    reportDisplayedRef.current = 0
    if (reportIntervalRef.current) {
      clearInterval(reportIntervalRef.current)
      reportIntervalRef.current = null
    }
    setRepoPanels(repos.map(repo => ({
      repo: repo.trim(),
      text: '',
      reasoning: '',
      displayedText: '',
      displayedReasoning: '',
      logs: [],
      done: false,
    })))

    try {
      const res = await fetch(`${API_BASE_URL}/api/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repos: repos.map(r => r.trim()) }),
      })

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const event of events) {
          const line = event.split('\n').find(l => l.startsWith('data: '))
          if (!line) continue
          try {
            const parsed = JSON.parse(line.slice(6))
            if (parsed.type === 'repo_progress') {
              setRepoPanels(prev => prev.map(p =>
                p.repo === parsed.repo ? { ...p, logs: [...p.logs, parsed.msg] } : p
              ))
            } else if (parsed.type === 'repo_text' && typeof parsed.chunk === 'string') {
              const repo = parsed.repo
              textAccRefs.current[repo] = (textAccRefs.current[repo] || '') + parsed.chunk
              startTextWriter(repo)
            } else if (parsed.type === 'repo_reasoning' && typeof parsed.chunk === 'string') {
              const repo = parsed.repo
              reasoningAccRefs.current[repo] = (reasoningAccRefs.current[repo] || '') + parsed.chunk
              startReasoningWriter(repo)
            } else if (parsed.type === 'repo_done') {
              const repo = parsed.repo
              // Stop intervals
              if (textIntervalRefs.current[repo]) {
                clearInterval(textIntervalRefs.current[repo]!)
                textIntervalRefs.current[repo] = null
              }
              if (reasoningIntervalRefs.current[repo]) {
                clearInterval(reasoningIntervalRefs.current[repo]!)
                reasoningIntervalRefs.current[repo] = null
              }
              // Final DOM update (no cursor)
              const finalText = textAccRefs.current[repo] || ''
              const finalReasoning = reasoningAccRefs.current[repo] || ''
              const textEl = textElRefs.current[repo]
              const reasoningEl = reasoningElRefs.current[repo]
              if (textEl) textEl.innerHTML = escapeHtml(finalText).replace(/\n/g, '<br>')
              if (reasoningEl) reasoningEl.innerHTML = escapeHtml(finalReasoning).replace(/\n/g, '<br>')
              // Update React state
              setRepoPanels(prev => prev.map(p =>
                p.repo === repo
                  ? { ...p, done: true, displayedText: finalText, displayedReasoning: finalReasoning }
                  : p
              ))
            } else if (parsed.type === 'progress') {
              // progress message - ignored for logs
            } else if (parsed.type === 'text') {
              reportAccRef.current += parsed.chunk
              startReportWriter()
            } else if (parsed.type === 'error') {
              // error message - ignored
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      // request failed - error is already set via error event
    } finally {
      // Flush remaining report text immediately
      if (reportIntervalRef.current) {
        clearInterval(reportIntervalRef.current)
        reportIntervalRef.current = null
      }
      setReport(reportAccRef.current)
      setIsLoading(false)
    }
  }

  return (
    <div className="page">
      <header className="header">
        <div className="logo-row">
          <div className="logo-icon">🔍</div>
          <span className="logo-text">RepoMind</span>
        </div>
        <p className="header-subtitle">GitHub 仓库智能对比工具</p>
      </header>

      <div className="input-section">
        <RepoInput repos={repos} onChange={setRepos} disabled={isLoading} />
      </div>

      <button
        className="compare-btn"
        onClick={handleCompare}
        disabled={!canSubmit}
      >
        {isLoading ? (
          <>
            <div className="spinner" />
            分析中...
          </>
        ) : '开始对比'}
      </button>

      {error && (
        <div className="error-msg">
          <span>⚠️</span> {error}
        </div>
      )}

      {repoPanels.length > 0 && (
        <div className={`analysis-grid ${repoPanels.length === 2 ? 'cols-2' : 'cols-3'}`}>
          {repoPanels.map(panel => (
            <div key={panel.repo} className="analysis-panel">
              <div className="panel-header">
                <a
                  className="panel-repo"
                  href={`https://github.com/${panel.repo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  {panel.repo}
                </a>
                <span className={`panel-badge ${panel.done ? 'done' : 'loading'}`}>
                  {!panel.done && <span className="dot" />}
                  {panel.done ? '✅ 完成' : '⏳ 分析中'}
                </span>
              </div>
              <div
                className="panel-body"
                ref={el => { panelBodyRefs.current[panel.repo] = el }}
              >
                {panel.logs.length > 0 && (
                  <div className="logs-section">
                    {panel.logs.map((log, i) => (
                      <div key={i} className="log-item">{log}</div>
                    ))}
                  </div>
                )}
                <div className="reasoning-section">
                  <div className="reasoning-label">思考过程</div>
                  <div
                    className="reasoning-text"
                    ref={el => { reasoningElRefs.current[panel.repo] = el }}
                  />
                </div>
                <div
                  className="analysis-text"
                  ref={el => { textElRefs.current[panel.repo] = el }}
                />
              </div>
            </div>
          ))}
        </div>
      )}


      {report && (
        <div className="report-section">
          <div className="report-header">
            <h2 className="report-title">
              📋 对比报告
              {isLoading && <span className="summary-badge">生成中...</span>}
            </h2>
            <ExportButton report={report} disabled={isLoading} />
          </div>
          <div className="report-content">
            <ReportView content={report} />
          </div>
        </div>
      )}
    </div>
  )
}
