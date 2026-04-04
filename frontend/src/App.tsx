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
  text: string           // full accumulated text
  reasoning: string      // full accumulated reasoning
  displayedText: string  // text revealed so far (typewriter)
  displayedReasoning: string
  logs: string[]
  done: boolean
}

export default function App() {
  const [repos, setRepos] = useState(['vercel/ai', 'crewAIInc/crewAI'])
  const [logs, setLogs] = useState<string[]>([])
  const [report, setReport] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [repoPanels, setRepoPanels] = useState<RepoPanel[]>([])
  const panelBodyRefs = useRef<Record<string, HTMLDivElement | null>>({})
  // RAF refs for typewriter effect per repo
  const textRafRefs = useRef<Record<string, number | null>>({})
  const reasoningRafRefs = useRef<Record<string, number | null>>({})
  // Full text refs (used by RAF to avoid stale closures)
  const textFullRefs = useRef<Record<string, string>>({})
  const reasoningFullRefs = useRef<Record<string, string>>({})
  const textDisplayedRefs = useRef<Record<string, number>>({})
  const reasoningDisplayedRefs = useRef<Record<string, number>>({})

  const canSubmit = !isLoading && repos.every(r => r.trim().includes('/'))

  // RAF-based typewriter reveal: gradually show chars at ~12ms/char
  const revealText = (repo: string) => {
    const full = textFullRefs.current[repo] || ''
    const displayed = textDisplayedRefs.current[repo] || 0
    if (displayed >= full.length) return

    // Reveal 2 chars per frame (~16ms), capped at full length
    const next = Math.min(displayed + 2, full.length)
    textDisplayedRefs.current[repo] = next
    setRepoPanels(prev => prev.map(p =>
      p.repo === repo ? { ...p, displayedText: full.slice(0, next) } : p
    ))

    textRafRefs.current[repo] = requestAnimationFrame(() => revealText(repo))
  }

  const revealReasoning = (repo: string) => {
    const full = reasoningFullRefs.current[repo] || ''
    const displayed = reasoningDisplayedRefs.current[repo] || 0
    if (displayed >= full.length) return

    const next = Math.min(displayed + 2, full.length)
    reasoningDisplayedRefs.current[repo] = next
    setRepoPanels(prev => prev.map(p =>
      p.repo === repo ? { ...p, displayedReasoning: full.slice(0, next) } : p
    ))

    reasoningRafRefs.current[repo] = requestAnimationFrame(() => revealReasoning(repo))
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

  const handleCompare = async () => {
    const dups = findDuplicates(repos)
    if (dups.length > 0) {
      setError(`检测到重复仓库: ${dups.join(', ')}`)
      return
    }
    setError(null)
    setIsLoading(true)
    setLogs([])
    setReport('')
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
              const newFull = (textFullRefs.current[repo] || '') + parsed.chunk
              textFullRefs.current[repo] = newFull
              // Start or continue RAF reveal
              if (!textRafRefs.current[repo]) {
                textRafRefs.current[repo] = requestAnimationFrame(() => revealText(repo))
              }
            } else if (parsed.type === 'repo_reasoning' && typeof parsed.chunk === 'string') {
              const repo = parsed.repo
              const newFull = (reasoningFullRefs.current[repo] || '') + parsed.chunk
              reasoningFullRefs.current[repo] = newFull
              if (!reasoningRafRefs.current[repo]) {
                reasoningRafRefs.current[repo] = requestAnimationFrame(() => revealReasoning(repo))
              }
            } else if (parsed.type === 'repo_done') {
              const repo = parsed.repo
              // Cancel RAFs and flush all text
              if (textRafRefs.current[repo]) {
                cancelAnimationFrame(textRafRefs.current[repo]!)
                textRafRefs.current[repo] = null
              }
              if (reasoningRafRefs.current[repo]) {
                cancelAnimationFrame(reasoningRafRefs.current[repo]!)
                reasoningRafRefs.current[repo] = null
              }
              const fullText = textFullRefs.current[repo] || ''
              const fullReasoning = reasoningFullRefs.current[repo] || ''
              setRepoPanels(prev => prev.map(p =>
                p.repo === repo
                  ? { ...p, done: true, displayedText: fullText, displayedReasoning: fullReasoning }
                  : p
              ))
            } else if (parsed.type === 'progress') {
              setLogs(prev => [...prev, parsed.msg])
            } else if (parsed.type === 'text') {
              setReport(prev => prev + parsed.chunk)
            } else if (parsed.type === 'error') {
              setLogs(prev => [...prev, `❌ 错误: ${parsed.msg}`])
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      setLogs(prev => [...prev, `❌ 请求失败: ${String(err)}`])
    } finally {
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
                {panel.displayedReasoning && (
                  <div className="reasoning-section">
                    <div className="reasoning-label">思考过程</div>
                    <div className="reasoning-text">{panel.displayedReasoning}</div>
                  </div>
                )}
                <div className="analysis-text">
                  {panel.displayedText}
                  {!panel.done && <span className="streaming-cursor" />}
                </div>
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
