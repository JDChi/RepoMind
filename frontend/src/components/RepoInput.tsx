interface Props {
  repos: string[]
  onChange: (repos: string[]) => void
  disabled: boolean
}

export function RepoInput({ repos, onChange, disabled }: Props) {
  const update = (i: number, val: string) => {
    const next = [...repos]
    next[i] = val
    onChange(next)
  }

  const add = () => {
    if (repos.length < 3) onChange([...repos, ''])
  }

  const remove = (i: number) => {
    if (repos.length > 2) onChange(repos.filter((_, idx) => idx !== i))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {repos.map((repo, i) => (
        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            value={repo}
            onChange={e => update(i, e.target.value)}
            placeholder="owner/repo (e.g. vercel/ai)"
            disabled={disabled}
            style={{ flex: 1, padding: '8px', fontSize: '14px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
          {repos.length > 2 && (
            <button onClick={() => remove(i)} disabled={disabled} style={{ padding: '8px' }}>✕</button>
          )}
        </div>
      ))}
      {repos.length < 3 && (
        <button onClick={add} disabled={disabled} style={{ alignSelf: 'flex-start', padding: '6px 12px' }}>
          + 添加仓库
        </button>
      )}
    </div>
  )
}
