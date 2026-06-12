import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Heading from '@tiptap/extension-heading'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Image } from '@tiptap/extension-image'
import { HorizontalRule } from '@tiptap/extension-horizontal-rule'
import { Placeholder } from '@tiptap/extension-placeholder'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import { SlashCommandExtension } from './SlashCommand'
import { DiagramBlock } from './DiagramBlock'
import { AttachmentBlockExtension } from './AttachmentBlock'
import { BubbleToolbar } from './BubbleToolbar'
import { ActiveLineExtension } from './ActiveLine'
import { PreviewPanel } from './PreviewPanel'
import { PinLockModal } from './PinLockModal'
import { ShareModal } from './ShareModal'
import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Lock, LockOpen, Share2 } from 'lucide-react'

interface Note {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
  isLocked?: boolean
  shareToken?: string | null
  hasPinProtection?: boolean
  createdByUsername?: string | null
  updatedByUsername?: string | null
}

interface EditorProps {
  note: Note
  onUpdate: (fields: { title?: string; content?: string }) => Promise<void>
  onSaveStatusChange?: (status: 'saved' | 'saving' | 'unsaved') => void
  onLockChange?: (isLocked: boolean) => void
  shareTrigger?: number
}

function fmt(ts: number) {
  const d = new Date(ts)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

type SaveStatus = 'saved' | 'saving' | 'unsaved'

export function Editor({ note, onUpdate, onSaveStatusChange, onLockChange, shareTrigger }: EditorProps) {
  const [title, setTitle] = useState(note.title)
  const [updatedAt, setUpdatedAt] = useState(note.updatedAt)
  const [preview, setPreview] = useState(false)
  const [isLocked, setIsLocked] = useState(note.isLocked ?? false)
  const [pinModal, setPinModal] = useState<'unlock' | 'set' | 'remove' | null>(null)
  const [shareToken, setShareToken] = useState<string | null>(note.shareToken ?? null)
  const [hasPinProtection, setHasPinProtection] = useState(note.hasPinProtection ?? false)
  const [showShare, setShowShare] = useState(false)
  function setStatus(s: SaveStatus) { onSaveStatusChange?.(s) }
  const titleRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, horizontalRule: false }),
      Heading.configure({ levels: [1, 2, 3] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Image,
      HorizontalRule,
      Placeholder.configure({ placeholder: "Type '/' for commands…" }),
      TextStyle,
      Color,
      Underline,
      Highlight.configure({ multicolor: false }),
      SlashCommandExtension,
      DiagramBlock,
      AttachmentBlockExtension,
      ActiveLineExtension,
    ],
    content: (() => {
      try { return JSON.parse(note.content) } catch { return {} }
    })(),
    onUpdate: ({ editor }) => {
      setStatus('unsaved')
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        setStatus('saving')
        onUpdate({ content: JSON.stringify(editor.getJSON()) })
          .then(() => { setUpdatedAt(Date.now()); setStatus('saved') })
      }, 1000)
    },
  })

  useEffect(() => { return () => clearTimeout(saveTimer.current) }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        clearTimeout(saveTimer.current)
        if (!editor) return
        setStatus('saving')
        onUpdate({ content: JSON.stringify(editor.getJSON()), title })
          .then(() => { setUpdatedAt(Date.now()); setStatus('saved') })
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        if (!editor?.isFocused) return
        e.preventDefault()
        editor.commands.selectAll()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editor, title])

  useEffect(() => {
    if (editor) (editor.storage as any).noteId = note.id
  }, [editor, note.id])

  useEffect(() => {
    setTitle(note.title)
    setUpdatedAt(note.updatedAt)
    setIsLocked(note.isLocked ?? false)
    setShareToken(note.shareToken ?? null)
    setHasPinProtection(note.hasPinProtection ?? false)
    if (editor && note.content) {
      try { editor.commands.setContent(JSON.parse(note.content)) } catch {}
    }
  }, [note.id])

  useEffect(() => {
    if (shareTrigger && shareTrigger > 0) {
      setShowShare(true)
    }
  }, [shareTrigger])

  async function handlePinSubmit(pin: string): Promise<boolean> {
    if (pinModal === 'set') {
      const r = await fetch(`/api/notes/${note.id}/pin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      if (!r.ok) return false
      setIsLocked(true)
      onLockChange?.(true)
      setPinModal(null)
      return true
    }
    if (pinModal === 'remove') {
      const r = await fetch(`/api/notes/${note.id}/pin`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      if (!r.ok) return false
      setIsLocked(false)
      onLockChange?.(false)
      setPinModal(null)
      return true
    }
    if (pinModal === 'unlock') {
      const r = await fetch(`/api/notes/${note.id}/pin/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      if (!r.ok) return false
      setPinModal(null)
      return true
    }
    return false
  }

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value)
    setStatus('unsaved')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setStatus('saving')
      onUpdate({ title: e.target.value })
        .then(() => { setUpdatedAt(Date.now()); setStatus('saved') })
    }, 1000)
  }

  return (
    <div style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0 }}>
      {/* Editor pane */}
      <div
        style={{ flex: 1, overflowY: 'auto', padding: '40px 40px', background: 'var(--bg)', position: 'relative', cursor: 'text', minWidth: 0 }}
        onClick={e => { if (e.target === e.currentTarget) editor?.commands.focus('end') }}
      >
        {/* Top-right action buttons */}
        <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowShare(true)}
            title="Bagikan catatan"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', fontSize: '0.75rem', fontWeight: 500,
              fontFamily: 'var(--font-body)',
              border: `1px solid ${shareToken ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 20,
              background: shareToken ? 'var(--accent)' : 'var(--bg)',
              color: shareToken ? 'var(--primary)' : 'var(--fg-muted)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!shareToken) { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' } }}
            onMouseLeave={e => { if (!shareToken) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)' } }}
          >
            <Share2 size={13} />
            {shareToken ? 'Dibagikan' : 'Bagikan'}
          </button>

          <button
            onClick={() => setPinModal(isLocked ? 'remove' : 'set')}
            title={isLocked ? 'Hapus PIN' : 'Kunci dengan PIN'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', fontSize: '0.75rem', fontWeight: 500,
              fontFamily: 'var(--font-body)',
              border: `1px solid ${isLocked ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 20,
              background: isLocked ? 'var(--accent)' : 'var(--bg)',
              color: isLocked ? 'var(--primary)' : 'var(--fg-muted)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!isLocked) { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' } }}
            onMouseLeave={e => { if (!isLocked) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)' } }}
          >
            {isLocked ? <Lock size={13} /> : <LockOpen size={13} />}
            {isLocked ? 'Terkunci' : 'Kunci'}
          </button>

          <button
            onClick={() => setPreview(v => !v)}
            title={preview ? 'Hide preview' : 'Show preview'}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', fontSize: '0.75rem', fontWeight: 500,
              fontFamily: 'var(--font-body)',
              border: '1px solid var(--border)', borderRadius: 20,
              background: preview ? 'var(--accent)' : 'var(--bg)',
              color: preview ? 'var(--primary)' : 'var(--fg-muted)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!preview) { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' } }}
            onMouseLeave={e => { if (!preview) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)' } }}
          >
            {preview ? <EyeOff size={13} /> : <Eye size={13} />}
            {preview ? 'Hide Preview' : 'Preview'}
          </button>
        </div>

        {/* metadata bar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginBottom: 20, fontSize: '0.75rem', color: 'var(--fg-subtle)', fontFamily: 'var(--font-body)' }}>
          <span>
            Dibuat <span style={{ color: 'var(--fg-muted)' }}>{fmt(note.createdAt)}</span>
            {note.createdByUsername && <> oleh <span style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>{note.createdByUsername}</span></>}
          </span>
          <span>·</span>
          <span>
            Diperbarui <span style={{ color: 'var(--fg-muted)' }}>{fmt(updatedAt)}</span>
            {note.updatedByUsername && <> oleh <span style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>{note.updatedByUsername}</span></>}
          </span>
        </div>

        <input
          ref={titleRef}
          value={title}
          onChange={handleTitleChange}
          placeholder="Untitled"
          style={{
            display: 'block', width: '100%',
            outline: 'none', background: 'transparent', border: 'none',
            marginBottom: 24, fontSize: '2rem', fontWeight: 700,
            color: 'var(--fg)', letterSpacing: '-0.02em', lineHeight: 1.2,
            fontFamily: 'var(--font-heading)',
          }}
          onFocus={e => (e.currentTarget.style.caretColor = 'var(--primary)')}
        />

        <BubbleToolbar editor={editor} />
        <div className="editor-content-wrapper">
          <EditorContent
            editor={editor}
            style={{ outline: 'none' }}
            className="max-w-none [&_.ProseMirror]:outline-none"
          />
        </div>
        <div
          style={{ minHeight: '50vh', cursor: 'text' }}
          onClick={() => editor?.commands.focus('end')}
        />
        <div style={{ borderBottom: '1px solid var(--border)', opacity: 0.5 }} />
      </div>

      {/* Preview pane */}
      {preview && <PreviewPanel editor={editor} title={title} />}

      {pinModal && (
        <PinLockModal
          mode={pinModal}
          onSubmit={handlePinSubmit}
          onClose={() => setPinModal(null)}
        />
      )}

      {showShare && (
        <ShareModal
          noteId={note.id}
          initialToken={shareToken}
          initialHasPin={hasPinProtection}
          onClose={() => setShowShare(false)}
          onShareChange={(t, p) => { setShareToken(t); setHasPinProtection(p) }}
          onActionSuccess={() => window.location.reload()}
          isTeamNote={note.teamId !== null && note.teamId !== ''}
        />
      )}
    </div>
  )
}
