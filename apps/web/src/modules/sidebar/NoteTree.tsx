import { ChevronDown, ChevronRight, FileText, Plus, Trash2, Globe, AlertTriangle } from 'lucide-react'
import { useState, useRef, useEffect, useMemo } from 'react'
import { NoteIcon } from '../shared/ui'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../shared/ui'
import { cn } from '../shared/utils'

export interface Note {
  id: string
  title: string
  createdAt: number
  parentId?: string | null
  shareToken?: string | null
  icon?: string | null
}

interface NoteTreeNode extends Note {
  children: NoteTreeNode[]
}

interface NoteTreeProps {
  notes: Note[]
  activeNoteId: string | null
  indexedNoteIds?: Set<string>
  indexingNoteIds?: Set<string>
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onCreateChild: (parentId: string) => void
  onShare?: (id: string) => void
}

function buildNoteTree(notes: Note[]): NoteTreeNode[] {
  const map = new Map<string, NoteTreeNode>()
  const roots: NoteTreeNode[] = []

  // Initialize nodes
  for (const note of notes) {
    map.set(note.id, { ...note, children: [] })
  }

  // Build tree structure
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      const parent = map.get(node.parentId)!
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  // Sort nodes by createdAt desc
  const sortFn = (a: NoteTreeNode, b: NoteTreeNode) => b.createdAt - a.createdAt
  roots.sort(sortFn)
  for (const node of map.values()) {
    node.children.sort(sortFn)
  }

  return roots
}

export function NoteTree({
  notes,
  activeNoteId,
  indexedNoteIds,
  indexingNoteIds,
  onSelect,
  onRename,
  onDelete,
  onCreateChild,
  onShare,
}: NoteTreeProps) {
  const tree = useMemo(() => buildNoteTree(notes), [notes])
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('mindspace_sidebar_expanded')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; note: Note } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem('mindspace_sidebar_expanded', JSON.stringify(expanded))
    } catch (e) {
      console.error('Failed to save sidebar expanded states:', e)
    }
  }, [expanded])

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  // Automatically expand active note parents on mount or activeNoteId change
  useEffect(() => {
    if (!activeNoteId || notes.length === 0) return
    const parentsToExpand: string[] = []
    
    let currentId = activeNoteId
    let found = true
    const visited = new Set<string>()

    while (currentId && found && !visited.has(currentId)) {
      visited.add(currentId)
      const note = notes.find(n => n.id === currentId)
      if (note && note.parentId) {
        parentsToExpand.push(note.parentId)
        currentId = note.parentId
      } else {
        found = false
      }
    }

    if (parentsToExpand.length > 0) {
      setExpanded(prev => {
        const next = { ...prev }
        let changed = false
        for (const p of parentsToExpand) {
          if (!next[p]) {
            next[p] = true
            changed = true
          }
        }
        return changed ? next : prev
      })
    }
  }, [activeNoteId, notes])

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded(prev => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  function startEdit(note: Note, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingId(note.id)
    setEditValue(note.title || '')
    setContextMenu(null)
  }

  function commitEdit() {
    if (editingId) {
      onRename(editingId, editValue.trim() || 'Untitled')
      setEditingId(null)
    }
  }

  const renderNode = (node: NoteTreeNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0
    const isExpanded = !!expanded[node.id]
    const isActive = activeNoteId === node.id
    const isIndexed = indexedNoteIds?.has(node.id) ?? false
    const isIndexing = indexingNoteIds?.has(node.id) ?? false

    return (
      <div key={node.id} className="flex flex-col">
        {/* Row element */}
        <div
          className={cn(
            'group flex items-center gap-1.5 w-full py-1.5 pr-2 rounded-lg text-sm mb-0.5 select-none relative transition-colors cursor-pointer',
            isActive ? 'font-medium' : ''
          )}
          style={{
            paddingLeft: `${Math.max(8, depth * 16)}px`,
            background: isActive ? 'var(--accent)' : 'transparent',
            color: isActive ? 'var(--primary)' : 'var(--fg)',
          }}
          onClick={() => {
            if (editingId !== node.id) {
              onSelect(node.id)
            }
          }}
          onMouseEnter={() => setHoverId(node.id)}
          onMouseLeave={() => setHoverId(null)}
          onContextMenu={e => {
            e.preventDefault()
            setContextMenu({ x: e.clientX, y: e.clientY, note: node })
          }}
        >
          {/* Collapse/Expand Toggle */}
          <button
            onClick={e => toggleExpand(node.id, e)}
            className="flex items-center justify-center w-4 h-4 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            style={{
              color: 'var(--fg-subtle)',
              opacity: hasChildren ? 1 : 0,
              pointerEvents: hasChildren ? 'auto' : 'none',
            }}
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>

          {/* Note Icon */}
          {node.icon ? (
            <NoteIcon icon={node.icon} size={14} style={{ marginRight: '2px', flexShrink: 0 }} />
          ) : (
            <FileText className="h-3.5 w-3.5 shrink-0" style={{ color: isActive ? 'var(--primary)' : 'var(--fg-subtle)' }} />
          )}

          {/* RAG indexed indicator */}
          {indexedNoteIds && (
            <span
              title={isIndexing ? 'Indexing to RAG...' : isIndexed ? 'Indexed to RAG' : 'Not indexed'}
              className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0 inline-block",
                isIndexing ? "bg-blue-500 animate-pulse" : isIndexed ? "bg-green-500" : "bg-red-500"
              )}
            />
          )}

          {/* Title / Editor */}
          {editingId === node.id ? (
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
              className="flex-1 min-w-0 bg-transparent border border-solid border-[var(--primary)] rounded px-1.5 py-0.5 text-sm text-[var(--fg)] outline-none"
              style={{
                fontFamily: 'var(--font-body)',
              }}
            />
          ) : (
            <>
              <span
                className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
                onDoubleClick={e => startEdit(node, e)}
                title={node.title || 'Untitled'}
              >
                {(node.title || 'Untitled').length > 20 ? (node.title || 'Untitled').slice(0, 20) + '…' : (node.title || 'Untitled')}
              </span>

              {/* Public Badge */}
              {node.shareToken && (
                <span
                  style={{
                    fontSize: '0.625rem',
                    fontWeight: 600,
                    padding: '1px 5px',
                    borderRadius: '10px',
                    background: 'rgba(26,115,232,0.08)',
                    color: 'var(--primary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px',
                    border: '1px solid rgba(26,115,232,0.15)',
                    flexShrink: 0,
                  }}
                >
                  <Globe size={9} />
                  Public
                </span>
              )}

              {/* Action Buttons (Visible on hover) */}
              {hoverId === node.id && (
                <div className="flex items-center gap-0.5 ml-1 flex-shrink-0">
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      onCreateChild(node.id)
                      setExpanded(prev => ({ ...prev, [node.id]: true }))
                    }}
                    title="Buat Sub-halaman"
                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/5 text-[var(--fg-muted)] hover:text-[var(--primary)]"
                  >
                    <Plus size={12} />
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      setDeleteTarget(node)
                    }}
                    title="Hapus note"
                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/10 text-red-500"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Children nodes rendering */}
        {hasChildren && isExpanded && (
          <div className="flex flex-col">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col py-1">
      {tree.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-[var(--fg-subtle)]">
          Belum ada catatan
        </div>
      ) : (
        tree.map(node => renderNode(node, 0))
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'transparent', cursor: 'default' }}
          onClick={() => setContextMenu(null)}
          onContextMenu={e => {
            e.preventDefault()
            setContextMenu(null)
          }}
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
              minWidth: 140,
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
                startEdit(contextMenu.note, e)
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
            <button
              onClick={() => {
                setContextMenu(null)
                onCreateChild(contextMenu.note.id)
                setExpanded(prev => ({ ...prev, [contextMenu.note.id]: true }))
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
              Tambah Sub-halaman
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null) }}>
        <DialogContent showCloseButton={false} style={{ maxWidth: 380 }}>
          <DialogHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(224,49,49,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={18} color="#e03131" />
              </div>
              <DialogTitle style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem' }}>Hapus Catatan</DialogTitle>
            </div>
            <DialogDescription style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', lineHeight: 1.5 }}>
              Yakin ingin menghapus{' '}
              <strong style={{ color: 'var(--fg)' }}>"{deleteTarget?.title || 'Untitled'}"</strong>?
              {' '}Tindakan ini tidak bisa dibatalkan dan semua sub-halaman di dalamnya juga akan terhapus.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter style={{ marginTop: 4 }}>
            <button
              onClick={() => setDeleteTarget(null)}
              style={{
                padding: '7px 16px', fontSize: '0.8rem', fontWeight: 500,
                border: '1px solid var(--border)', borderRadius: 7,
                background: 'var(--bg)', color: 'var(--fg-muted)',
                cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--muted)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)' }}
            >
              Batal
            </button>
            <button
              onClick={() => { if (deleteTarget) { onDelete(deleteTarget.id); setDeleteTarget(null) } }}
              style={{
                padding: '7px 16px', fontSize: '0.8rem', fontWeight: 600,
                border: 'none', borderRadius: 7,
                background: '#e03131', color: '#fff',
                cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#c92a2a' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#e03131' }}
            >
              Hapus
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
