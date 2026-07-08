import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'

interface SearchResult { 
  id: string 
  title: string 
  createdAt: number 
  snippet: string 
}

interface SearchBarProps { 
  onResults: (results: SearchResult[] | null) => void 
}

export function SearchBar({ onResults }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [isMac, setIsMac] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setIsMac(navigator.userAgent.indexOf('Mac') !== -1)
  }, [])

  useEffect(() => {
    if (!query.trim()) { 
      onResults(null)
      return 
    }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      onResults(data)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, onResults])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="px-3 pb-3">
      <div className="relative">
        <Search 
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" 
          style={{ color: 'var(--fg-subtle)', pointerEvents: 'none' }} 
        />
        <input
          ref={inputRef}
          className="w-full pl-8 pr-12 h-8 text-sm rounded-lg outline-none transition-all"
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
          onFocus={e => { 
            e.currentTarget.style.border = '1px solid var(--primary)'
            e.currentTarget.style.background = 'var(--bg)' 
          }}
          onBlur={e => { 
            e.currentTarget.style.border = '1px solid transparent'
            e.currentTarget.style.background = 'var(--input-bg)' 
          }}
        />
        {!query && (
          <div 
            className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" 
            style={{ 
              fontSize: '0.625rem', 
              color: 'var(--fg-subtle)', 
              background: 'var(--bg-muted)', 
              border: '1px solid var(--border)',
              padding: '1px 4px', 
              borderRadius: '4px',
              fontWeight: 500,
              fontFamily: 'var(--font-body)',
            }}
          >
            {isMac ? '⌘K' : 'Ctrl+K'}
          </div>
        )}
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2"
            style={{ 
              color: 'var(--fg-subtle)', 
              background: 'none', 
              border: 'none', 
              cursor: 'pointer', 
              padding: 0,
              display: 'flex',
              alignItems: 'center'
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg-muted)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-subtle)')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
