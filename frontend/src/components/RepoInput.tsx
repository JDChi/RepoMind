import { useState, useRef, useEffect } from 'react'

interface Props {
  repos: string[]
  onChange: (repos: string[]) => void
  disabled: boolean
}

interface Suggestion {
  owner: string
  repo: string
  description: string
}

export function RepoInput({ repos, onChange, disabled }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [focusedInput, setFocusedInput] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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

  const searchRepos = (query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length < 1 || /\s/.test(query) || /["'<>]/.test(query)) {
      setSuggestions([])
      setActiveIndex(-1)
      return
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=5`, {
          headers: { 'User-Agent': 'RepoMind' },
        })
        if (!res.ok) return
        const data = await res.json()
        setSuggestions(data.items?.map((item: any) => ({
          owner: item.owner.login,
          repo: item.name,
          description: item.description || '',
        })) || [])
        setActiveIndex(-1)
      } catch {
        setSuggestions([])
      }
    }, 300)
  }

  const selectSuggestion = (i: number, sug: Suggestion) => {
    update(i, `${sug.owner}/${sug.repo}`)
    setSuggestions([])
    setActiveIndex(-1)
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSuggestions([])
        setFocusedInput(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current)
    }
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(prev => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(prev => Math.max(prev - 1, -1))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      selectSuggestion(i, suggestions[activeIndex])
    } else if (e.key === 'Escape') {
      setSuggestions([])
    }
  }

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {repos.map((repo, i) => (
        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', position: 'relative' }}>
          <input
            type="text"
            value={repo}
            onChange={e => {
              update(i, e.target.value)
              searchRepos(e.target.value)
            }}
            onFocus={() => {
              if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current)
              setFocusedInput(i)
              if (repo) searchRepos(repo)
            }}
            onBlur={() => {
              blurTimeoutRef.current = setTimeout(() => setFocusedInput(null), 200)
            }}
            onKeyDown={e => handleKeyDown(e, i)}
            placeholder="owner/repo (e.g. vercel/ai)"
            disabled={disabled}
            style={{ flex: 1, padding: '8px', fontSize: '14px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
          {repos.length > 2 && (
            <button onClick={() => remove(i)} disabled={disabled} style={{ padding: '8px' }}>✕</button>
          )}
          {focusedInput === i && suggestions.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: repos.length > 2 ? '48px' : 0,
              background: 'white',
              border: '1px solid #ccc',
              borderRadius: '4px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              zIndex: 100,
              maxHeight: '200px',
              overflow: 'auto',
            }}>
              {suggestions.map((sug, idx) => (
                <div
                  key={`${sug.owner}/${sug.repo}`}
                  onClick={() => selectSuggestion(i, sug)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    background: idx === activeIndex ? '#f0f0f0' : 'white',
                    borderBottom: idx < suggestions.length - 1 ? '1px solid #eee' : 'none',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{sug.owner}/{sug.repo}</div>
                  <div style={{ fontSize: '12px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {sug.description}
                  </div>
                </div>
              ))}
            </div>
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
