import { useState } from 'react'
import { RepoInput } from './components/RepoInput'
import { ProgressLog } from './components/ProgressLog'
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
  logs: string[]
  done: boolean
}

export default function App() {
  const [repos, setRepos] = useState(['', ''])
  const [logs, setLogs] = useState<string[]>([])
  const [report, setReport] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [repoPanels, setRepoPanels] = useState<RepoPanel[]>([])

  const canSubmit = !isLoading && repos.every(r => r.trim().includes('/'))

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
    setRepoPanels(repos.map(repo => ({ repo: repo.trim(), text: '', reasoning: '', logs: [], done: false })))

    try {
      const res = await fetch(`${API_BASE_URL}/api/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repos: repos.map(r => r.trim()) }),
      })

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`)
      }

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
                p.repo === parsed.repo
                  ? { ...p, logs: [...p.logs, parsed.msg] }
                  : p
              ))
            } else if (parsed.type === 'repo_text' && typeof parsed.chunk === 'string') {
              setRepoPanels(prev => prev.map(p =>
                p.repo === parsed.repo
                  ? { ...p, text: p.text + parsed.chunk }
                  : p
              ))
            } else if (parsed.type === 'repo_reasoning' && typeof parsed.chunk === 'string') {
              setRepoPanels(prev => prev.map(p =>
                p.repo === parsed.repo
                  ? { ...p, reasoning: p.reasoning + parsed.chunk }
                  : p
              ))
            } else if (parsed.type === 'repo_done') {
              setRepoPanels(prev => prev.map(p =>
                p.repo === parsed.repo ? { ...p, done: true } : p
              ))
            } else if (parsed.type === 'progress') {
              setLogs(prev => [...prev, parsed.msg])
            } else if (parsed.type === 'text') {
              setReport(prev => prev + parsed.chunk)
            } else if (parsed.type === 'error') {
              setLogs(prev => [...prev, `❌ 错误: ${parsed.msg}`])
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      setLogs(prev => [...prev, `❌ 请求失败: ${String(err)}`])
    } finally {
      setIsLoading(false)
    }
  }

  const allReposDone = repoPanels.length > 0 && repoPanels.every(p => p.done)

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
      <h1 style={{ marginBottom: '8px' }}>🔍 RepoMind</h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>GitHub 仓库智能对比工具</p>

      <div style={{ marginBottom: '16px' }}>
        <RepoInput repos={repos} onChange={setRepos} disabled={isLoading} />
      </div>

      <button
        onClick={handleCompare}
        disabled={!canSubmit}
        style={{
          padding: '10px 24px',
          fontSize: '15px',
          background: canSubmit ? '#0070f3' : '#ccc',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          marginBottom: '24px',
        }}
      >
        {isLoading ? '分析中...' : '开始对比'}
      </button>

      {error && (
        <div style={{ marginBottom: '16px', padding: '12px', background: '#fee', border: '1px solid #f00', borderRadius: '6px', color: '#c00' }}>
          {error}
        </div>
      )}

      {repoPanels.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: repoPanels.length === 2 ? '1fr 1fr' : '1fr', gap: '16px', marginBottom: '24px' }}>
          {repoPanels.map(panel => (
            <div key={panel.repo} style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '16px', background: '#fafafa' }}>
              <div style={{ fontWeight: 600, marginBottom: '12px', fontSize: '16px' }}>
                {panel.repo}
                {panel.done ? ' ✅' : ' ⏳'}
              </div>
              {panel.logs.length > 0 && (
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                  {panel.logs.map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                </div>
              )}
              {panel.reasoning && (
                <div style={{ fontSize: '13px', color: '#888', fontStyle: 'italic', marginBottom: '8px', whiteSpace: 'pre-wrap' }}>
                  💭 {panel.reasoning}
                </div>
              )}
              <div style={{ fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                {panel.text}
                {!panel.done && <span style={{ animation: 'blink 1s infinite' }}>|</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {logs.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <ProgressLog logs={logs} />
        </div>
      )}

      {report && (
        <>
          <div style={{ marginBottom: '16px' }}>
            <ExportButton report={report} disabled={isLoading} />
          </div>
          <ReportView content={report} />
        </>
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
