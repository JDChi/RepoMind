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

  const add = () => { if (repos.length < 3) onChange([...repos, '']) }
  const remove = (i: number) => { if (repos.length > 2) onChange(repos.filter((_, idx) => idx !== i)) }

  const searchRepos = (query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length < 1 || /\s/.test(query) || /["'<>]/.test(query)) {
      setSuggestions([])
      setActiveIndex(-1)
      return
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=5`,
          { headers: { 'User-Agent': 'RepoMind' } }
        )
        if (!res.ok) return
        const data = await res.json()
        setSuggestions(data.items?.map((item: any) => ({
          owner: item.owner.login,
          repo: item.name,
          description: item.description || '',
        })) || [])
        setActiveIndex(-1)
      } catch { setSuggestions([]) }
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
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(prev => Math.min(prev + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(prev => Math.max(prev - 1, -1)) }
    else if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); selectSuggestion(i, suggestions[activeIndex]) }
    else if (e.key === 'Escape') { setSuggestions([]) }
  }

  return (
    <div ref={containerRef}>
      <div className="repo-inputs">
        {repos.map((repo, i) => (
          <div key={i} className="repo-input-wrap">
            <input
              type="text"
              className="repo-input"
              value={repo}
              onChange={e => { update(i, e.target.value); searchRepos(e.target.value) }}
              onFocus={() => {
                if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current)
                setFocusedInput(i)
                if (repo) searchRepos(repo)
              }}
              onBlur={() => { blurTimeoutRef.current = setTimeout(() => setFocusedInput(null), 200) }}
              onKeyDown={e => handleKeyDown(e, i)}
              placeholder="owner/repo (e.g. vercel/ai)"
              disabled={disabled}
            />
            {repos.length > 2 && (
              <button className="remove-btn" onClick={() => remove(i)} disabled={disabled}>✕</button>
            )}
            {focusedInput === i && suggestions.length > 0 && (
              <div className="suggestions">
                {suggestions.map((sug, idx) => (
                  <div
                    key={`${sug.owner}/${sug.repo}`}
                    className={`suggestion-item ${idx === activeIndex ? 'active' : ''}`}
                    onClick={() => selectSuggestion(i, sug)}
                  >
                    <div className="sg-name">{sug.owner}/{sug.repo}</div>
                    <div className="sg-desc">{sug.description}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {repos.length < 3 && (
        <button className="add-btn" onClick={add} disabled={disabled}>+ 添加仓库</button>
      )}
    </div>
  )
}
