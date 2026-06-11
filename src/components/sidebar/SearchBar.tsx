import { useState, useEffect } from 'react'
import { Input } from '../ui/input'
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
  }, [query])

  return (
    <div className="relative px-3 py-2">
      <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        className="pl-8 pr-8 h-8 text-sm"
        placeholder="Search notes..."
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {query && (
        <button
          onClick={() => setQuery('')}
          className="absolute right-5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
