import { useState, useEffect } from 'react'
import { Clock, RotateCcw, Eye, X, Plus, AlertTriangle } from 'lucide-react'
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
  currentContent: string
  onClose: () => void
  onRestore: (version: VersionRecord) => void
}

export function VersionHistory({ noteId, currentContent, onClose, onRestore }: VersionHistoryProps) {
  const [history, setHistory] = useState<VersionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [snapshotName, setSnapshotName] = useState('')
  const [savingSnapshot, setSavingSnapshot] = useState(false)
  const [previewVersion, setPreviewVersion] = useState<VersionRecord | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<VersionRecord | null>(null)
  const [restoring, setRestoring] = useState(false)

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
    setRestoring(true)
    try {
      const res = await fetch(`/api/notes/${noteId}/history/restore/${version.id}`, {
        method: 'POST'
      })
      if (res.ok) {
        const updatedNote = await res.json()
        setConfirmRestore(null)
        onRestore(updatedNote)
      }
    } catch (err) {
      console.error('Failed to restore version:', err)
    } finally {
      setRestoring(false)
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
                          onClick={() => setConfirmRestore(item)}
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

      {/* Restore Confirmation Modal */}
      {confirmRestore && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(4px)',
            animation: 'fadeIn 0.15s ease',
          }}
          onClick={() => !restoring && setConfirmRestore(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: '28px 28px 24px',
              width: 360,
              maxWidth: 'calc(100vw - 48px)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              fontFamily: 'var(--font-body)',
              animation: 'slideUp 0.18s ease',
            }}
          >
            {/* Icon + Title */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: 'color-mix(in srgb, #f59e0b 15%, var(--card-bg))',
                border: '1px solid color-mix(in srgb, #f59e0b 30%, var(--border))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <AlertTriangle size={22} style={{ color: '#f59e0b' }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--fg)', marginBottom: 4 }}>
                  Pulihkan versi ini?
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                  Catatan saat ini akan digantikan dengan versi{' '}
                  <strong style={{ color: 'var(--fg)' }}>
                    &ldquo;{confirmRestore.versionName || 'Penyimpanan Otomatis'}&rdquo;
                  </strong>.
                  Tindakan ini tidak dapat dibatalkan.
                </div>
              </div>
            </div>

            {/* Meta info chip */}
            <div style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: '0.75rem',
              color: 'var(--fg-muted)',
              display: 'flex',
              gap: 16,
            }}>
              <span>🕐 {new Date(confirmRestore.createdAt).toLocaleString('id-ID', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })}</span>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmRestore(null)}
                disabled={restoring}
                style={{
                  padding: '8px 18px', fontSize: '0.85rem', fontWeight: 500,
                  borderRadius: 8, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--fg-muted)',
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = 'var(--fg)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-muted)' }}
              >
                Batal
              </button>
              <button
                onClick={() => handleRestore(confirmRestore)}
                disabled={restoring}
                style={{
                  padding: '8px 20px', fontSize: '0.85rem', fontWeight: 700,
                  borderRadius: 8, border: 'none',
                  background: restoring ? 'var(--fg-muted)' : 'var(--primary)',
                  color: 'var(--primary-fg)',
                  cursor: restoring ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-body)',
                  display: 'flex', alignItems: 'center', gap: 7,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!restoring) e.currentTarget.style.opacity = '0.88' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >
                {restoring ? (
                  <>
                    <div style={{
                      width: 14, height: 14,
                      border: '2px solid var(--primary-fg)',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 0.7s linear infinite',
                    }} />
                    Memulihkan...
                  </>
                ) : (
                  <>
                    <RotateCcw size={14} />
                    Ya, Pulihkan
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Dialog */}
      {previewVersion && (
        <VersionPreviewDialog
          version={previewVersion}
          currentContent={currentContent}
          onClose={() => setPreviewVersion(null)}
          onRestore={() => {
            const v = previewVersion
            setPreviewVersion(null)
            setConfirmRestore(v)
          }}
        />
      )}
    </div>
  )
}

function VersionPreviewDialog({ version, currentContent, onClose, onRestore }: {
  version: VersionRecord
  currentContent: string
  onClose: () => void
  onRestore: () => void
}) {
  const [activeTab, setActiveTab] = useState<'preview' | 'diff'>('diff')

  // ── Diff Engine ──────────────────────────────────────────────────────────
  // Convert Tiptap JSON → array of readable text lines
  const tiptapToLines = (raw: string): string[] => {
    const lines: string[] = []
    let doc: any
    try { doc = JSON.parse(raw) } catch { return raw.split('\n').filter(Boolean) }
    if (!doc?.content) return []

    const inlineText = (nodes: any[]): string =>
      (nodes || []).map((n: any) => n.text || '').join('')

    const walk = (node: any) => {
      switch (node.type) {
        case 'heading':   lines.push(`${'#'.repeat(node.attrs?.level || 1)} ${inlineText(node.content)}`); break
        case 'paragraph': { const t = inlineText(node.content); if (t) lines.push(t); break }
        case 'bulletList':  (node.content||[]).forEach((li: any) => lines.push(`• ${inlineText(li.content?.[0]?.content)}`)); break
        case 'orderedList': (node.content||[]).forEach((li: any, i: number) => lines.push(`${i+1}. ${inlineText(li.content?.[0]?.content)}`)); break
        case 'codeBlock':   lines.push('```'); lines.push(inlineText(node.content)); lines.push('```'); break
        case 'blockquote':  lines.push(`> ${inlineText(node.content?.[0]?.content)}`); break
        case 'horizontalRule': lines.push('───────────────────────'); break
        case 'callout':     lines.push(`[${node.attrs?.emoji||'💡'}] ${inlineText(node.content?.[0]?.content)}`); break
        case 'taskList':    (node.content||[]).forEach((li: any) => lines.push(`${li.attrs?.checked ? '☑' : '☐'} ${inlineText(li.content?.[0]?.content)}`)); break
        case 'table':       lines.push('[Tabel]'); break
        case 'diagram':     lines.push('[Diagram]'); break
        case 'attachment':  lines.push(`[Lampiran: ${node.attrs?.filename||''}]`); break
        default: if (node.content) node.content.forEach(walk); break
      }
    }
    doc.content.forEach(walk)
    return lines
  }

  // LCS-based diff — returns { type: 'same'|'add'|'remove', text: string }[]
  const computeDiff = (oldLines: string[], newLines: string[]) => {
    const m = oldLines.length, n = newLines.length
    // Build LCS table
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = oldLines[i-1] === newLines[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1])
    // Traceback
    const result: { type: 'same'|'add'|'remove'; text: string }[] = []
    let i = m, j = n
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i-1] === newLines[j-1]) {
        result.unshift({ type: 'same', text: oldLines[i-1] }); i--; j--
      } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
        result.unshift({ type: 'add', text: newLines[j-1] }); j--
      } else {
        result.unshift({ type: 'remove', text: oldLines[i-1] }); i--
      }
    }
    return result
  }

  const oldLines = tiptapToLines(version.content)         // historical (before)
  const newLines = tiptapToLines(currentContent)           // current   (after)
  const diffResult = computeDiff(oldLines, newLines)
  const adds    = diffResult.filter(d => d.type === 'add').length
  const removes = diffResult.filter(d => d.type === 'remove').length
  // ─────────────────────────────────────────────────────────────────────────
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
          maxWidth: '90vw', width: '90vw', height: '88vh',
          display: 'flex', flexDirection: 'column',
          padding: 0, gap: 0, overflow: 'hidden',
          background: 'var(--bg)', color: 'var(--fg)',
          borderRadius: 16, border: '1px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
          fontFamily: 'var(--font-body)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0, background: 'var(--card-bg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Clock size={15} style={{ color: 'var(--primary)' }} />
            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--fg)' }}>
              {version.versionName || 'Penyimpanan Otomatis'}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--fg-muted)' }}>
              · {fmtDate(version.createdAt)}
            </span>
          </div>
          {/* Diff stats badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {removes > 0 && (
              <span style={{
                fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace',
                color: '#f87171', background: 'rgba(248,113,113,0.12)',
                border: '1px solid rgba(248,113,113,0.25)',
                padding: '2px 8px', borderRadius: 20,
              }}>−{removes}</span>
            )}
            {adds > 0 && (
              <span style={{
                fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace',
                color: '#4ade80', background: 'rgba(74,222,128,0.12)',
                border: '1px solid rgba(74,222,128,0.25)',
                padding: '2px 8px', borderRadius: 20,
              }}>+{adds}</span>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--border)',
          background: 'var(--card-bg)', flexShrink: 0, padding: '0 20px',
        }}>
          {(['diff', 'preview'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 16px', fontSize: '0.8rem', fontWeight: activeTab === tab ? 700 : 500,
                border: 'none', background: 'none', cursor: 'pointer',
                color: activeTab === tab ? 'var(--primary)' : 'var(--fg-muted)',
                borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                marginBottom: -1, fontFamily: 'var(--font-body)',
                transition: 'all 0.15s',
              }}
            >
              {tab === 'diff' ? '📊 Perubahan' : '👁 Pratinjau'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          {activeTab === 'diff' ? (
            /* ── DIFF VIEW ── */
            <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.6 }}>
              {/* File header bar */}
              <div style={{
                padding: '8px 16px',
                background: 'var(--card-bg)',
                borderBottom: '1px solid var(--border)',
                fontSize: '0.75rem', color: 'var(--fg-muted)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  padding: '1px 8px', borderRadius: 4,
                  background: 'color-mix(in srgb, var(--primary) 12%, var(--card-bg))',
                  border: '1px solid color-mix(in srgb, var(--primary) 25%, var(--border))',
                  color: 'var(--primary)', fontWeight: 600,
                }}>
                  {version.title || 'Untitled'}
                </span>
                <span>@@ versi lama → versi saat ini @@</span>
              </div>

              {/* Diff lines */}
              {diffResult.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: '0.85rem' }}>
                  Tidak ada perubahan yang terdeteksi antara versi ini dan catatan saat ini.
                </div>
              ) : (
                diffResult.map((line, i) => {
                  const isAdd = line.type === 'add'
                  const isRem = line.type === 'remove'
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        background: isAdd
                          ? 'rgba(74,222,128,0.08)'
                          : isRem
                          ? 'rgba(248,113,113,0.08)'
                          : 'transparent',
                        borderLeft: `3px solid ${isAdd ? '#4ade80' : isRem ? '#f87171' : 'transparent'}`,
                      }}
                    >
                      {/* Gutter sign */}
                      <span style={{
                        width: 28, flexShrink: 0, textAlign: 'center',
                        color: isAdd ? '#4ade80' : isRem ? '#f87171' : 'var(--fg-muted)',
                        userSelect: 'none', paddingTop: 2,
                        fontWeight: 700, fontSize: '0.85rem',
                      }}>
                        {isAdd ? '+' : isRem ? '−' : ' '}
                      </span>
                      {/* Line number */}
                      <span style={{
                        width: 36, flexShrink: 0, textAlign: 'right', paddingRight: 10,
                        color: 'var(--fg-muted)', userSelect: 'none',
                        opacity: 0.5, paddingTop: 2, fontSize: '0.72rem',
                      }}>
                        {i + 1}
                      </span>
                      {/* Content */}
                      <span style={{
                        flex: 1, padding: '2px 12px',
                        color: isAdd ? '#86efac' : isRem ? '#fca5a5' : 'var(--fg)',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      }}>
                        {line.text || ' '}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          ) : (
            /* ── PREVIEW VIEW ── */
            <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
              {version.coverImage ? (
                <div style={{
                  width: '100%', height: '140px',
                  backgroundImage: version.coverImage.startsWith('linear-gradient') ? version.coverImage : `url(${version.coverImage})`,
                  backgroundSize: 'cover', backgroundPosition: 'center',
                }} />
              ) : null}
              <div style={{ padding: '32px 60px', width: '100%' }}>
                {version.icon ? (
                  <div style={{ marginTop: version.coverImage ? '-65px' : '0', marginBottom: '16px', display: 'inline-block' }}>
                    <NoteIcon icon={version.icon} size={48} />
                  </div>
                ) : null}
                <h1 style={{
                  fontSize: '2rem', fontWeight: 700, color: 'var(--fg)',
                  letterSpacing: '-0.02em', lineHeight: 1.2,
                  fontFamily: 'var(--font-heading)', marginBottom: '24px', marginTop: 0,
                }}>
                  {version.title || 'Untitled'}
                </h1>
                <div className="editor-content-wrapper prose max-w-none">
                  <EditorContent editor={previewEditor} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '12px 20px', borderTop: '1px solid var(--border)',
          flexShrink: 0, background: 'var(--card-bg)',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 18px', fontSize: '0.875rem',
              fontFamily: 'var(--font-body)',
              border: '1px solid var(--border)', borderRadius: 8,
              background: 'var(--bg)', cursor: 'pointer', color: 'var(--fg-muted)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)' }}
          >
            Tutup
          </button>
          <button
            onClick={onRestore}
            style={{
              padding: '7px 18px', fontSize: '0.875rem', fontWeight: 600,
              fontFamily: 'var(--font-body)', border: 'none', borderRadius: 8,
              background: 'var(--primary)', cursor: 'pointer',
              color: 'var(--primary-fg)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            <RotateCcw size={14} />
            Pulihkan Versi Ini
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
