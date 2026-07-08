import { useState, useEffect } from 'react'
import { Clock, RotateCcw, Eye, X, Plus, FileText } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Heading from '@tiptap/extension-heading'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Image } from '@tiptap/extension-image'
import Youtube from '@tiptap/extension-youtube'
import { HorizontalRule } from '@tiptap/extension-horizontal-rule'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import { NoteIcon } from '../ui/NoteIcon'

interface VersionRecord {
  id: string
  noteId: string
  title: string
  content: string
  coverImage: string | null
  icon: string | null
  createdById: string | null
  createdAt: number
  versionName: string | null
}

interface VersionHistoryProps {
  noteId: string
  onClose: () => void
  onRestore: (version: VersionRecord) => void
}

export function VersionHistory({ noteId, onClose, onRestore }: VersionHistoryProps) {
  const [history, setHistory] = useState<VersionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [snapshotName, setSnapshotName] = useState('')
  const [savingSnapshot, setSavingSnapshot] = useState(false)
  const [previewVersion, setPreviewVersion] = useState<VersionRecord | null>(null)

  const fetchHistory = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/notes/${noteId}/history`)
      if (res.ok) {
        const data = await res.json()
        setHistory(data)
      }
    } catch (err) {
      console.error('Failed to load version history:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [noteId])

  const handleSaveSnapshot = async () => {
    if (savingSnapshot) return
    setSavingSnapshot(true)
    try {
      const res = await fetch(`/api/notes/${noteId}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionName: snapshotName || 'Snapshot Manual' })
      })
      if (res.ok) {
        setSnapshotName('')
        setShowSaveDialog(false)
        await fetchHistory()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSavingSnapshot(false)
    }
  }

  const handleRestore = async (version: VersionRecord) => {
    if (!confirm(`Apakah Anda yakin ingin memulihkan catatan ini ke versi "${version.versionName || 'Penyimpanan Otomatis'}"?`)) {
      return
    }
    try {
      const res = await fetch(`/api/notes/${noteId}/history/restore/${version.id}`, {
        method: 'POST'
      })
      if (res.ok) {
        const updatedNote = await res.json()
        onRestore(updatedNote)
      }
    } catch (err) {
      console.error('Failed to restore version:', err)
      alert('Gagal memulihkan versi catatan.')
    }
  }

  const fmtDate = (timestamp: number) => {
    const d = new Date(timestamp)
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div
      style={{
        width: '350px',
        borderLeft: '1px solid var(--border)',
        background: 'var(--card-bg)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* Sidebar Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: '0.9rem', color: 'var(--fg)' }}>
          <Clock size={16} style={{ color: 'var(--primary)' }} />
          <span>Riwayat Versi</span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--fg-muted)',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <X size={16} />
        </button>
      </div>

      {/* Action Area */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        {showSaveDialog ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              autoFocus
              value={snapshotName}
              onChange={e => setSnapshotName(e.target.value)}
              placeholder="Nama versi (e.g. Versi Draf Awal)"
              style={{
                width: '100%',
                padding: '6px 10px',
                fontSize: '0.8rem',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--fg)',
                outline: 'none',
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveSnapshot()
                if (e.key === 'Escape') setShowSaveDialog(false)
              }}
            />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSaveDialog(false)}
                style={{
                  padding: '4px 10px', fontSize: '0.75rem', borderRadius: 4,
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--fg-muted)', cursor: 'pointer'
                }}
              >
                Batal
              </button>
              <button
                onClick={handleSaveSnapshot}
                disabled={savingSnapshot}
                style={{
                  padding: '4px 12px', fontSize: '0.75rem', borderRadius: 4,
                  border: 'none', background: 'var(--primary)',
                  color: 'var(--primary-fg)', cursor: 'pointer', fontWeight: 600
                }}
              >
                {savingSnapshot ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowSaveDialog(true)}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--primary)',
              background: 'var(--accent)',
              border: '1px solid var(--primary)',
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <Plus size={14} />
            <span>Simpan Snapshot Baru</span>
          </button>
        )}
      </div>

      {/* Git Tree History */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: '24px 0', fontSize: '0.8rem' }}>
            <div style={{
              width: 28, height: 28, border: '2px solid var(--primary)',
              borderTopColor: 'transparent', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite', margin: '0 auto 10px',
            }} />
            Memuat riwayat...
          </div>
        ) : history.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: '32px 16px', fontSize: '0.8rem' }}>
            <Clock size={24} style={{ margin: '0 auto 12px', opacity: 0.3, display: 'block' }} />
            Belum ada riwayat versi.<br />Versi otomatis disimpan setiap 10 menit.
          </div>
        ) : (() => {
          // Group by day label
          const groups: { label: string; items: typeof history }[] = []
          history.forEach(item => {
            const d = new Date(item.createdAt)
            const today = new Date()
            const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
            let label: string
            if (d.toDateString() === today.toDateString()) label = 'Hari ini'
            else if (d.toDateString() === yesterday.toDateString()) label = 'Kemarin'
            else label = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
            const existing = groups.find(g => g.label === label)
            if (existing) existing.items.push(item)
            else groups.push({ label, items: [item] })
          })

          return groups.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 8 }}>
              {/* Day label */}
              <div style={{
                fontSize: '0.7rem', fontWeight: 700, color: 'var(--fg-muted)',
                textTransform: 'uppercase', letterSpacing: '0.08em',
                padding: '0 0 8px 34px', marginBottom: 0,
              }}>
                {group.label}
              </div>

              {/* Items in this group */}
              {group.items.map((item, idx) => {
                const isLast = gi === groups.length - 1 && idx === group.items.length - 1
                const isSnapshot = !!item.versionName
                return (
                  <div key={item.id} style={{ display: 'flex', gap: 0, position: 'relative' }}>
                    {/* Git line + dot column */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32, flexShrink: 0 }}>
                      {/* Vertical line above dot */}
                      <div style={{
                        width: 2,
                        height: 14,
                        background: isSnapshot ? 'var(--primary)' : 'var(--border)',
                        flexShrink: 0,
                      }} />
                      {/* Commit dot */}
                      <div style={{
                        width: isSnapshot ? 14 : 10,
                        height: isSnapshot ? 14 : 10,
                        borderRadius: '50%',
                        background: isSnapshot ? 'var(--primary)' : 'var(--card-bg)',
                        border: `2px solid ${isSnapshot ? 'var(--primary)' : 'var(--border)'}`,
                        boxShadow: isSnapshot ? '0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent)' : 'none',
                        flexShrink: 0,
                        zIndex: 1,
                        transition: 'all 0.15s',
                      }} />
                      {/* Vertical line below dot */}
                      {!isLast && (
                        <div style={{
                          width: 2,
                          flex: 1,
                          minHeight: 20,
                          background: 'var(--border)',
                        }} />
                      )}
                    </div>

                    {/* Content card */}
                    <div
                      style={{
                        flex: 1,
                        marginLeft: 8,
                        marginBottom: 6,
                        padding: '9px 12px',
                        borderRadius: 9,
                        border: `1px solid ${isSnapshot ? 'color-mix(in srgb, var(--primary) 35%, var(--border))' : 'var(--border)'}`,
                        background: isSnapshot ? 'color-mix(in srgb, var(--primary) 6%, var(--card-bg))' : 'var(--card-bg)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--primary)'
                        ;(e.currentTarget as HTMLDivElement).style.background = 'color-mix(in srgb, var(--primary) 10%, var(--card-bg))'
                      }}
                      onMouseLeave={e => {
                        ;(e.currentTarget as HTMLDivElement).style.borderColor = isSnapshot ? 'color-mix(in srgb, var(--primary) 35%, var(--border))' : 'var(--border)'
                        ;(e.currentTarget as HTMLDivElement).style.background = isSnapshot ? 'color-mix(in srgb, var(--primary) 6%, var(--card-bg))' : 'var(--card-bg)'
                      }}
                      onClick={() => setPreviewVersion(item)}
                    >
                      {/* Top row: name + time */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          {isSnapshot && (
                            <span style={{
                              fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px',
                              background: 'var(--primary)', color: 'var(--primary-fg)',
                              borderRadius: 4, letterSpacing: '0.05em', textTransform: 'uppercase',
                            }}>
                              Snapshot
                            </span>
                          )}
                          <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--fg)', wordBreak: 'break-word' }}>
                            {item.versionName || 'Penyimpanan Otomatis'}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.68rem', color: 'var(--fg-muted)', whiteSpace: 'nowrap', marginTop: 1 }}>
                          {new Date(item.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Action row */}
                      <div style={{ display: 'flex', gap: 5 }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setPreviewVersion(item)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 3,
                            padding: '2px 8px', fontSize: '0.7rem',
                            border: '1px solid var(--border)', borderRadius: 4,
                            background: 'var(--bg)', color: 'var(--fg-muted)',
                            cursor: 'pointer', fontFamily: 'var(--font-body)',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)' }}
                        >
                          <Eye size={10} />
                          <span>Lihat</span>
                        </button>
                        <button
                          onClick={() => handleRestore(item)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 3,
                            padding: '2px 8px', fontSize: '0.7rem',
                            border: 'none', borderRadius: 4,
                            background: 'var(--primary)', color: 'var(--primary-fg)',
                            cursor: 'pointer', fontFamily: 'var(--font-body)',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                        >
                          <RotateCcw size={10} />
                          <span>Pulihkan</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        })()}
      </div>

      {/* Preview Dialog */}
      {previewVersion && (
        <VersionPreviewDialog
          version={previewVersion}
          onClose={() => setPreviewVersion(null)}
          onRestore={() => {
            const v = previewVersion
            setPreviewVersion(null)
            handleRestore(v)
          }}
        />
      )}
    </div>
  )
}

function VersionPreviewDialog({ version, onClose, onRestore }: { version: VersionRecord; onClose: () => void; onRestore: () => void }) {
  const parsedContent = (() => {
    try {
      return JSON.parse(version.content)
    } catch {
      return version.content || ''
    }
  })()

  const previewEditor = useEditor({
    editable: false,
    content: parsedContent,
    extensions: [
      StarterKit,
      Heading.configure({ levels: [1, 2, 3] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Image,
      Youtube.configure({
        HTMLAttributes: {
          class: 'rounded-lg max-w-full my-4 mx-auto aspect-video',
        },
      }),
      HorizontalRule,
      TextStyle,
      Color,
      Underline,
      Highlight.configure({ multicolor: false }),
    ]
  })

  // Format date
  const fmtDate = (timestamp: number) => {
    const d = new Date(timestamp)
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <Dialog open={true} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent
        aria-describedby={undefined}
        style={{
          maxWidth: '85vw', width: '85vw', height: '85vh',
          display: 'flex', flexDirection: 'column',
          padding: 0, gap: 0, overflow: 'hidden',
          background: 'var(--bg)', color: 'var(--fg)',
          borderRadius: 16, border: '1px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
        }}
      >
        {/* Banner Alert */}
        <div
          style={{
            background: 'rgba(168, 85, 247, 0.1)',
            borderBottom: '1px solid rgba(168, 85, 247, 0.2)',
            padding: '10px 20px',
            fontSize: '0.8125rem',
            color: '#c084fc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            fontFamily: 'var(--font-body)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={14} />
            <span>
              Pratinjau Versi: <strong>{version.versionName || 'Penyimpanan Otomatis'}</strong> ({fmtDate(version.createdAt)})
            </span>
          </div>
          <button
            onClick={onRestore}
            style={{
              padding: '4px 12px',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: '#a855f7',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Pulihkan Versi Ini
          </button>
        </div>

        {/* Note Preview Body (similar to Note Page layout) */}
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', position: 'relative' }}>
          {/* Cover image */}
          {version.coverImage ? (
            <div
              style={{
                width: '100%',
                height: '140px',
                backgroundImage: version.coverImage.startsWith('linear-gradient') ? version.coverImage : `url(${version.coverImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                position: 'relative',
              }}
            />
          ) : null}

          {/* Content Wrapper */}
          <div style={{ padding: '32px 60px', width: '100%', position: 'relative' }}>
            {/* Page Icon */}
            {version.icon ? (
              <div style={{ marginTop: version.coverImage ? '-65px' : '0', marginBottom: '16px', display: 'inline-block' }}>
                <NoteIcon icon={version.icon} size={48} />
              </div>
            ) : null}

            {/* Note Title */}
            <h1
              style={{
                fontSize: '2rem',
                fontWeight: 700,
                color: 'var(--fg)',
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
                fontFamily: 'var(--font-heading)',
                marginBottom: '24px',
                marginTop: 0,
              }}
            >
              {version.title || 'Untitled'}
            </h1>

            {/* Editor Content */}
            <div className="editor-content-wrapper prose max-w-none">
              <EditorContent editor={previewEditor} />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--card-bg)' }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px', fontSize: '0.875rem',
              fontFamily: 'var(--font-body)',
              border: '1px solid var(--border)', borderRadius: 6,
              background: 'var(--bg)', cursor: 'pointer', color: 'var(--fg-muted)',
            }}
          >
            Tutup
          </button>
          <button
            onClick={onRestore}
            style={{
              padding: '6px 16px', fontSize: '0.875rem',
              fontFamily: 'var(--font-body)',
              border: 'none', borderRadius: 6,
              background: 'var(--primary)', cursor: 'pointer',
              color: 'var(--primary-fg)', fontWeight: 500,
            }}
          >
            Pulihkan Versi Ini
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
