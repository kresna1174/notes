import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ScrollArea } from '../ui/scroll-area'
import { Button } from '../ui/button'
import { Separator } from '../ui/separator'
import { DayGroup } from './DayGroup'
import { SearchBar } from './SearchBar'
import { Plus } from 'lucide-react'

interface Note {
  id: string
  title: string
  createdAt: number
}

interface SearchResult {
  id: string
  title: string
  createdAt: number
  snippet: string
}

interface SidebarProps {
  activeNoteId: string | null
}

function getDayLabel(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function groupByDay(notes: Note[]): { label: string; notes: Note[] }[] {
  const map = new Map<string, Note[]>()
  for (const note of notes) {
    const label = getDayLabel(note.createdAt)
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(note)
  }
  return Array.from(map.entries()).map(([label, notes]) => ({ label, notes }))
}

export function Sidebar({ activeNoteId }: SidebarProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const navigate = useNavigate()

  async function loadNotes() {
    const res = await fetch('/api/notes')
    setNotes(await res.json())
  }

  useEffect(() => { loadNotes() }, [activeNoteId])

  async function createNote() {
    const res = await fetch('/api/notes', { method: 'POST' })
    const note = await res.json()
    await loadNotes()
    navigate({ to: '/notes/$id', params: { id: note.id } })
  }

  const groups = groupByDay(notes)

  return (
    <div className="w-[280px] shrink-0 border-r flex flex-col h-screen">
      <div className="p-3">
        <Button onClick={createNote} className="w-full justify-start gap-2" variant="ghost" size="sm">
          <Plus className="h-4 w-4" />
          New Note
        </Button>
      </div>
      <Separator />
      <SearchBar onResults={setSearchResults} />
      <ScrollArea className="flex-1">
        {searchResults ? (
          <div className="py-1">
            <p className="px-3 py-1 text-xs text-muted-foreground">{searchResults.length} results</p>
            {searchResults.map(r => (
              <button
                key={r.id}
                onClick={() => navigate({ to: '/notes/$id', params: { id: r.id } })}
                className="flex flex-col w-full px-4 py-2 text-left hover:bg-accent rounded-sm"
              >
                <span className="text-sm font-medium truncate">{r.title || 'Untitled'}</span>
                <span
                  className="text-xs text-muted-foreground line-clamp-2"
                  dangerouslySetInnerHTML={{ __html: r.snippet }}
                />
              </button>
            ))}
          </div>
        ) : (
          <div className="py-1">
            {groups.map(g => (
              <DayGroup
                key={g.label}
                label={g.label}
                notes={g.notes}
                activeNoteId={activeNoteId}
                onSelect={id => navigate({ to: '/notes/$id', params: { id } })}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
