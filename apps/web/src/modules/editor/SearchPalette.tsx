import { useState, useEffect, useRef } from 'react'
import { Search, FileText, CornerDownLeft } from 'lucide-react'
import { NoteIcon } from '../shared/ui'

interface SearchResult {
  id: string
  title: string
  createdAt?: number
  updatedAt?: number
  snippet?: string
  icon?: string | null
}

interface SearchPaletteProps {
  onClose: () => void
  onSelectNote: (id: string) => void
}

export function SearchPalette({ onClose, onSelectNote }: SearchPaletteProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [recentNotes, setRecentNotes] = useState<SearchResult[]>([])
  
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch recent notes on mount
  useEffect(() => {
    async function loadRecent() {
      try {
        const res = await fetch('/api/notes?scope=mine')
        if (res.ok) {
          const data = await res.json()
          setRecentNotes(data.slice(0, 5))
        }
      } catch (err) {
        console.error('Failed to load recent notes:', err)
      }
    }
    loadRecent()
    inputRef.current?.focus()
  }, [])

  // Search logic
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
        if (res.ok) {
          const data = await res.json()
          setResults(data)
          setActiveIndex(0)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [query])

  // Handle keyboard navigation
  useEffect(() => {
    const items = query.trim() ? results : recentNotes
    
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex(prev => (prev + 1) % Math.max(1, items.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex(prev => (prev - 1 + items.length) % Math.max(1, items.length))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (items[activeIndex]) {
          onSelectNote(items[activeIndex].id)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [results, recentNotes, activeIndex, query, onSelectNote, onClose])

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const itemsToShow = query.trim() ? results : recentNotes

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: '600px',
          maxWidth: '90%',
          background: 'rgba(30, 30, 50, 0.85)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'var(--font-body)',
          height: 'fit-content',
          maxHeight: '70vh',
        }}
      >
        {/* Search Input Area */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <Search size={18} style={{ color: 'var(--fg-muted)', marginRight: 12 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search notes..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#ffffff',
              fontSize: '1.05rem',
            }}
          />
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 4 }}>
            ESC
          </div>
        </div>

        {/* Results / Recent Notes Area */}
        <div style={{ overflowY: 'auto', padding: '8px' }}>
          {itemsToShow.length > 0 ? (
            <>
              {!query.trim() && (
                <div style={{ padding: '8px 12px 4px 12px', fontSize: '0.725rem', fontWeight: 600, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Recent Notes
                </div>
              )}
              
              {itemsToShow.map((item, idx) => {
                const isActive = idx === activeIndex
                return (
                  <div
                    key={item.id}
                    onClick={() => onSelectNote(item.id)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      background: isActive ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
                      border: isActive ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid transparent',
                      transition: 'all 0.15s ease',
                      marginBottom: 4,
                    }}
                  >
                    <div style={{ marginRight: 12, display: 'flex', alignItems: 'center', width: 16, height: 16, justifyContent: 'center' }}>
                      {item.icon ? <NoteIcon icon={item.icon} size={16} /> : <FileText size={16} style={{ color: isActive ? '#c084fc' : 'var(--fg-muted)' }} />}
                    </div>
                    
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, color: isActive ? '#ffffff' : 'rgba(255,255,255,0.9)', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title || 'Untitled'}
                      </div>
                      {item.snippet && (
                        <div style={{ fontSize: '0.75rem', color: isActive ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.4)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.snippet}
                        </div>
                      )}
                    </div>

                    {isActive && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#c084fc', fontSize: '0.7rem' }}>
                        <CornerDownLeft size={10} />
                        <span>Open</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          ) : (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>
              {loading ? 'Searching...' : 'No results found.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
