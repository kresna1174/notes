import { useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'

interface SearchResult { id: string; title: string; createdAt: number; snippet: string }
interface SearchBarProps { onResults: (results: SearchResult[] | null) => void }

export function SearchBar({ onResults }: SearchBarProps) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!query.trim()) { onResults(null); return }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      onResults(data)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className="relative px-3 pb-3">
      <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--fg-subtle)' }} />
      <input
        className="w-full pl-7 pr-7 h-8 text-sm rounded-lg outline-none transition-all"
        style={{
          background: 'var(--input-bg)',
          color: 'var(--fg)',
          border: '1px solid transparent',
          fontSize: '0.8125rem',
          fontFamily: 'var(--font-body)',
        }}
        placeholder="Search..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={e => { e.currentTarget.style.border = '1px solid var(--primary)'; e.currentTarget.style.background = 'var(--bg)' }}
        onBlur={e => { e.currentTarget.style.border = '1px solid transparent'; e.currentTarget.style.background = 'var(--input-bg)' }}
      />
      {query && (
        <button
          onClick={() => setQuery('')}
          className="absolute right-5 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--fg-subtle)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg-muted)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-subtle)')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
