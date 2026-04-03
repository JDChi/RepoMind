import { useState } from 'react'
import { RepoInput } from './components/RepoInput'
import { ProgressLog } from './components/ProgressLog'
import { ReportView } from './components/ReportView'
import { ExportButton } from './components/ExportButton'

export default function App() {
  const [repos, setRepos] = useState(['', ''])
  const [logs, setLogs] = useState<string[]>([])
  const [report, setReport] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const canSubmit = !isLoading && repos.every(r => r.trim().includes('/'))

  const handleCompare = async () => {
    setIsLoading(true)
    setLogs([])
    setReport('')

    try {
      const res = await fetch('/api/compare', {
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
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'progress') {
              setLogs(prev => [...prev, event.msg])
            } else if (event.type === 'text') {
              setReport(prev => prev + event.chunk)
            } else if (event.type === 'error') {
              setLogs(prev => [...prev, `❌ 错误: ${event.msg}`])
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

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 20px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
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
    </div>
  )
}
