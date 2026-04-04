interface Props {
  logs: string[]
}

export function ProgressLog({ logs }: Props) {
  if (logs.length === 0) return null
  return (
    <div>
      {logs.map((log, i) => (
        <div key={i} className="log-entry">{log}</div>
      ))}
    </div>
  )
}
