interface Props {
  logs: string[]
}

export function ProgressLog({ logs }: Props) {
  if (logs.length === 0) return null
  return (
    <div style={{ background: '#f5f5f5', borderRadius: '4px', padding: '12px', fontFamily: 'monospace', fontSize: '13px' }}>
      {logs.map((log, i) => (
        <div key={i} style={{ marginBottom: '4px' }}>{log}</div>
      ))}
    </div>
  )
}
