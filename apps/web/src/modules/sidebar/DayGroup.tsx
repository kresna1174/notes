import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../shared/ui'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../shared/ui'
import { ChevronDown, ChevronRight, FileText, Trash2, AlertTriangle, Globe } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { NoteIcon } from '../shared/ui'
import { cn } from '../shared/utils'

interface Note { id: string; title: string; createdAt: number; shareToken?: string | null; icon?: string | null }

interface DayGroupProps {
  label: string
  notes: Note[]
  activeNoteId: string | null
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onShare?: (id: string) => void
}

export function DayGroup({ label, notes, activeNoteId, onSelect, onRename, onDelete, onShare }: DayGroupProps) {
  const [open, setOpen] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; note: Note } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  function startEdit(note: Note, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingId(note.id)
    setEditValue(note.title || '')
  }

  function commitEdit() {
    if (editingId) {
      onRename(editingId, editValue.trim() || 'Untitled')
      setEditingId(null)
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-2">
      <CollapsibleTrigger
        className="flex items-center gap-1.5 w-full px-2 py-1 rounded-md select-none transition-colors"
        style={{ color: 'var(--fg-subtle)' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-subtle)')}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {notes.map(note => (
          <div
            key={note.id}
            className={cn('flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-lg mb-0.5', activeNoteId === note.id ? 'font-medium' : '')}
            style={activeNoteId === note.id
              ? { background: 'var(--accent)', color: 'var(--primary)', cursor: 'pointer' }
              : { color: 'var(--fg)', cursor: 'pointer' }
            }
            onClick={() => { if (editingId !== note.id) onSelect(note.id) }}
            onMouseEnter={e => {
              setHoverId(note.id)
              if (activeNoteId !== note.id) e.currentTarget.style.background = 'var(--accent)'
            }}
            onMouseLeave={e => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return
              setHoverId(null)
              if (activeNoteId !== note.id) e.currentTarget.style.background = 'transparent'
            }}
            onContextMenu={e => {
              e.preventDefault()
              setContextMenu({ x: e.clientX, y: e.clientY, note })
            }}
          >
            {note.icon ? (
              <NoteIcon icon={note.icon} size={14} style={{ marginRight: '4px', flexShrink: 0 }} />
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0" style={{ color: activeNoteId === note.id ? 'var(--primary)' : 'var(--fg-subtle)' }} />
            )}
            {editingId === note.id ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitEdit()
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onClick={e => e.stopPropagation()}
                style={{
                  flex: 1, minWidth: 0,
                  background: 'var(--input-bg)',
                  border: '1px solid var(--primary)',
                  borderRadius: 4,
                  padding: '1px 5px',
                  fontSize: '0.875rem',
                  color: 'var(--fg)',
                  outline: 'none',
                }}
              />
            ) : (
              <>
                <span
                  style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  onDoubleClick={e => startEdit(note, e)}
                  title={note.title || 'Untitled'}
                >
                  {(note.title || 'Untitled').length > 20 ? (note.title || 'Untitled').slice(0, 20) + '…' : (note.title || 'Untitled')}
                </span>
                {note.shareToken && (
                  <span style={{
                    fontSize: '0.675rem',
                    fontWeight: 600,
                    padding: '1px 5px',
                    borderRadius: '10px',
                    background: 'rgba(26,115,232,0.08)',
                    color: 'var(--primary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    border: '1px solid rgba(26,115,232,0.15)',
                    flexShrink: 0,
                    marginRight: hoverId === note.id ? 4 : 0,
                  }}>
                    <Globe size={10} />
                    Public
                  </span>
                )}
                {hoverId === note.id && (
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteTarget(note) }}
                    title="Hapus note"
                    style={{
                      flexShrink: 0, width: 20, height: 20,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 4, border: 'none', cursor: 'pointer',
                      background: 'transparent', color: '#e03131', padding: 0,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(224,49,49,0.12)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </CollapsibleContent>

      {contextMenu && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'transparent', cursor: 'default' }}
          onClick={() => setContextMenu(null)}
          onContextMenu={e => { e.preventDefault(); setContextMenu(null) }}
        >
          <div
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              padding: '4px 0',
              minWidth: 130,
              display: 'flex',
              flexDirection: 'column',
              zIndex: 10000,
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setContextMenu(null)
                onSelect(contextMenu.note.id)
                onShare?.(contextMenu.note.id)
              }}
              style={{
                border: 'none', background: 'transparent', color: 'var(--fg)',
                padding: '7px 12px', fontSize: '0.75rem', fontWeight: 500,
                textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-body)',
                width: '100%',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Bagikan (Share)
            </button>
            <button
              onClick={e => {
                setContextMenu(null)
                startEdit(contextMenu.note, e as any)
              }}
              style={{
                border: 'none', background: 'transparent', color: 'var(--fg)',
                padding: '7px 12px', fontSize: '0.75rem', fontWeight: 500,
                textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-body)',
                width: '100%',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Ubah Nama
            </button>
            <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />
            <button
              onClick={() => {
                setContextMenu(null)
                setDeleteTarget(contextMenu.note)
              }}
              style={{
                border: 'none', background: 'transparent', color: '#e03131',
                padding: '7px 12px', fontSize: '0.75rem', fontWeight: 500,
                textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-body)',
                width: '100%',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(224,49,49,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Hapus
            </button>
          </div>
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null) }}>
        <DialogContent
          showCloseButton={false}
          style={{
            maxWidth: 380,
            background: 'var(--card-bg)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 14,
            padding: 24,
          }}
        >
          <DialogHeader style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(224,49,49,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={18} color="#e03131" />
              </div>
              <DialogTitle style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', color: 'var(--fg)' }}>Hapus Catatan</DialogTitle>
            </div>
          </DialogHeader>
          <DialogDescription style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--fg-muted)', marginBottom: 20 }}>
            Yakin ingin menghapus{' '}
            <strong style={{ color: 'var(--fg)' }}>"{deleteTarget?.title || 'Untitled'}"</strong>?
            {' '}Tindakan ini tidak bisa dibatalkan.
          </DialogDescription>
          <DialogFooter>
            <button
              onClick={() => setDeleteTarget(null)}
              style={{
                padding: '7px 16px', fontSize: '0.8rem', fontWeight: 500,
                border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 7,
                background: 'var(--bg)', color: 'var(--fg-muted)',
                cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--muted)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
            >
              Batal
            </button>
            <button
              onClick={() => { if (deleteTarget) { onDelete(deleteTarget.id); setDeleteTarget(null) } }}
              style={{
                padding: '7px 16px', fontSize: '0.8rem', fontWeight: 600,
                border: 'none', borderRadius: 7,
                background: '#e03131', color: '#fff',
                cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#c92a2a' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#e03131' }}
            >
              Hapus
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Collapsible>
  )
}
