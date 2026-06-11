import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../lib/utils'

interface Note {
  id: string
  title: string
  createdAt: number
}

interface DayGroupProps {
  label: string
  notes: Note[]
  activeNoteId: string | null
  onSelect: (id: string) => void
}

export function DayGroup({ label, notes, activeNoteId, onSelect }: DayGroupProps) {
  const [open, setOpen] = useState(true)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 w-full px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground select-none">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent>
        {notes.map(note => (
          <button
            key={note.id}
            onClick={() => onSelect(note.id)}
            className={cn(
              'flex items-center gap-2 w-full px-4 py-1.5 text-sm text-left truncate hover:bg-accent rounded-sm',
              activeNoteId === note.id && 'bg-accent font-medium'
            )}
          >
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{note.title || 'Untitled'}</span>
          </button>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}
