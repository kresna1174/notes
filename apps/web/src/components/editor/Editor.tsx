import { useEditor, EditorContent } from '@tiptap/react'
import Link from '@tiptap/extension-link'
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
import { DiagramBlock, EditDiagramDialog } from './DiagramBlock'
import { AttachmentBlockExtension } from './AttachmentBlock'
import { BubbleToolbar } from './BubbleToolbar'
import { PreviewPanel } from './PreviewPanel'
import { PinLockModal } from './PinLockModal'
import { ShareModal } from './ShareModal'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { CalloutBlock } from './CalloutBlock'
import { TableOfContentsBlock } from './TableOfContentsBlock'
import { WebBookmarkBlock } from './WebBookmarkBlock'
import { ToggleBlock } from './ToggleBlock'
import { DragHandle } from './DragHandle'
import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Lock, LockOpen, Share2, FileUp, Paperclip, Sparkles } from 'lucide-react'
import { marked } from 'marked'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

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
  organizationId?: string | null
  coverImage?: string | null
  icon?: string | null
}

const CollabCursorKey = new PluginKey('collabCursor')

export const CollabCursor = Extension.create({
  name: 'collabCursor',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: CollabCursorKey,
        state: {
          init() {
            return DecorationSet.empty
          },
          apply(tr, set) {
            // Check if we received a metadata update with new typing users
            const nextTypingUsers = tr.getMeta(CollabCursorKey) as { username: string; pos: number }[] | undefined
            
            if (nextTypingUsers !== undefined) {
              const decos: Decoration[] = []
              const docSize = tr.doc.content.size

              for (const user of nextTypingUsers) {
                const username = user.username
                let pos = user.pos

                if (pos === undefined || pos < 0) continue
                if (pos > docSize) pos = docSize

                const initial = username.slice(0, 2).toUpperCase()

                const widget = Decoration.widget(pos, () => {
                  const span = document.createElement('span')
                  span.className = 'collab-cursor-widget'
                  span.style.position = 'relative'
                  span.style.display = 'inline-flex'
                  span.style.alignItems = 'center'
                  span.style.verticalAlign = 'middle'
                  span.style.margin = '0 2px'
                  span.style.pointerEvents = 'none'
                  span.style.userSelect = 'none'

                  // Blinking caret
                  const caret = document.createElement('span')
                  caret.style.display = 'inline-block'
                  caret.style.width = '2px'
                  caret.style.height = '1.2em'
                  caret.style.background = '#2f9e44'
                  caret.style.animation = 'collabCaretBlink 1s infinite'
                  span.appendChild(caret)

                  // Rounded Avatar (just initial name) floating above the caret
                  const avatar = document.createElement('span')
                  avatar.style.position = 'absolute'
                  avatar.style.bottom = '100%'
                  avatar.style.left = '50%'
                  avatar.style.transform = 'translate(-50%, -2px)'
                  avatar.style.width = '20px'
                  avatar.style.height = '20px'
                  avatar.style.borderRadius = '50%'
                  avatar.style.background = '#2f9e44'
                  avatar.style.color = '#fff'
                  avatar.style.fontSize = '0.65rem'
                  avatar.style.fontWeight = '700'
                  avatar.style.display = 'flex'
                  avatar.style.alignItems = 'center'
                  avatar.style.justifyContent = 'center'
                  avatar.style.boxShadow = '0 1px 4px rgba(0,0,0,0.15)'
                  avatar.style.whiteSpace = 'nowrap'
                  avatar.style.zIndex = '50'
                  avatar.innerText = initial
                  span.appendChild(avatar)

                  // Blinking typing dots inline next to caret - ONLY IF TYPING
                  if (user.isTyping) {
                    const dots = document.createElement('span')
                    dots.style.display = 'inline-flex'
                    dots.style.alignItems = 'center'
                    dots.style.gap = '2px'
                    dots.style.marginLeft = '4px'
                    dots.style.background = 'rgba(47, 158, 68, 0.1)'
                    dots.style.border = '1px solid rgba(47, 158, 68, 0.2)'
                    dots.style.padding = '2px 4px'
                    dots.style.borderRadius = '4px'
                    dots.style.height = '14px'

                    dots.innerHTML = `
                      <span style="width: 3px; height: 3px; border-radius: 50%; background: #2f9e44; display: inline-block; animation: dot-blink 1.4s infinite both;"></span>
                      <span style="width: 3px; height: 3px; border-radius: 50%; background: #2f9e44; display: inline-block; animation: dot-blink 1.4s infinite both; animation-delay: 0.2s;"></span>
                      <span style="width: 3px; height: 3px; border-radius: 50%; background: #2f9e44; display: inline-block; animation: dot-blink 1.4s infinite both; animation-delay: 0.4s;"></span>
                    `
                    span.appendChild(dots)
                  }

                  return span
                }, { side: 1, key: username })

                decos.push(widget)
              }

              return DecorationSet.create(tr.doc, decos)
            }

            return set.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations(state) {
            return CollabCursorKey.getState(state)
          }
        }
      })
    ]
  }
})

export const DragDropPlugin = Extension.create({
  name: 'dragDropPlugin',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDrop(view, event) {
            const dragStartPos = (window as any).__dragStartPos
            const draggedNode = (window as any).__draggedNode
            if (dragStartPos === undefined || !draggedNode) {
              return false
            }

            // Clear globals immediately
            delete (window as any).__dragStartPos
            delete (window as any).__draggedNode

            // Get drop position in editor coords
            const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY })
            if (!coordinates) return false

            const dropPos = coordinates.pos
            const tr = view.state.tr

            if (dragStartPos === dropPos) {
              return true
            }

            if (dragStartPos < dropPos) {
              // Dragging down: delete original node first
              tr.delete(dragStartPos, dragStartPos + draggedNode.nodeSize)
              // Calculate target position in modified document
              const targetPos = Math.min(tr.doc.content.size, Math.max(0, dropPos - draggedNode.nodeSize))
              tr.insert(targetPos, draggedNode)
            } else {
              // Dragging up: insert first
              tr.insert(dropPos, draggedNode)
              // Calculate target position in modified document (shifted by nodeSize)
              const targetStart = dragStartPos + draggedNode.nodeSize
              tr.delete(targetStart, targetStart + draggedNode.nodeSize)
            }

            view.dispatch(tr)
            return true
          }
        }
      })
    ]
  }
})

interface EditorProps {
  note: Note
  onUpdate: (fields: { title?: string; content?: string }) => Promise<void>
  onSaveStatusChange?: (status: 'saved' | 'saving' | 'unsaved') => void
  onLockChange?: (isLocked: boolean) => void
  shareTrigger?: number
  chatOpen?: boolean
  onToggleChat?: () => void
  activeUsers?: { userId: string; username: string }[]
  typingUsers?: { username: string; pos: number }[]
  remoteUpdate?: { updatedBy: string; content: string; title: string } | null
  onClearRemoteUpdate?: () => void
}

function fmt(ts: number) {
  const d = new Date(ts)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

type SaveStatus = 'saved' | 'saving' | 'unsaved'

const COVER_GRADIENTS = [
  'linear-gradient(to right, #ff7e5f, #feb47b)',
  'linear-gradient(to right, #2b5876, #4e4376)',
  'linear-gradient(to right, #a1c4fd, #c2e9fb)',
  'linear-gradient(to right, #11998e, #38ef7d)',
  'linear-gradient(to right, #fc466b, #3f5efb)',
  'linear-gradient(to right, #f83600, #f9d423)',
  'linear-gradient(to right, #0f2027, #203a43, #2c5364)',
  'linear-gradient(to right, #d4fc79, #96e6a1)',
]

const COVER_IMAGES = [
  '/cover_landscape.jpg',
  '/cover_workspace.jpg',
  '/cover_dark_abstract.jpg'
]

const EMOJI_OPTIONS = [
  '📝', '💡', '📌', '🚀', '⭐', '🔥', '🎨', '🎯', '✅', '📚', '💼', '💻', 
  '🏠', '✈️', '🍀', '🍎', '🍕', '⚽', '🎸', '🐱', '🐶', '🦊', '🌍', '❤️'
]

function EmojiSelector({ currentIcon, onSelect, onRemove }: { currentIcon: string; onSelect: (emoji: string) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          fontSize: '3.5rem',
          lineHeight: '1',
          background: 'var(--card-bg)',
          border: '3px solid var(--border)',
          borderRadius: '16px',
          cursor: 'pointer',
          padding: '2px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '78px',
          height: '78px',
        }}
      >
        {currentIcon}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 999,
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
            padding: '12px',
            width: '240px',
            marginTop: '8px',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px', marginBottom: '10px' }}>
            {EMOJI_OPTIONS.map(e => (
              <button
                key={e}
                onClick={() => {
                  onSelect(e)
                  setOpen(false)
                }}
                style={{
                  fontSize: '1.25rem',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '6px',
                  textAlign: 'center',
                }}
                onMouseEnter={el => (el.currentTarget.style.backgroundColor = 'var(--accent)')}
                onMouseLeave={el => (el.currentTarget.style.backgroundColor = 'transparent')}
              >
                {e}
              </button>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                onRemove()
                setOpen(false)
              }}
              style={{
                padding: '4px 8px',
                background: 'transparent',
                border: 'none',
                color: '#e03131',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Hapus Ikon
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CoverSelector({ onSelect }: { onSelect: (gradient: string) => void }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: '4px 10px',
          background: 'rgba(0,0,0,0.65)',
          color: '#ffffff',
          border: 'none',
          borderRadius: '4px',
          fontSize: '0.725rem',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Ubah Cover
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            zIndex: 999,
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
            padding: '12px',
            width: '280px',
            marginBottom: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--fg-muted)', marginBottom: '8px' }}>Gradasi Warna</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {COVER_GRADIENTS.map((g, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    onSelect(g)
                    setOpen(false)
                  }}
                  style={{
                    height: '30px',
                    background: g,
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--fg-muted)', marginBottom: '8px' }}>Gambar Ilustrasi</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {COVER_IMAGES.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    onSelect(img)
                    setOpen(false)
                  }}
                  style={{
                    height: '45px',
                    backgroundImage: `url(${img})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function Editor({ note, onUpdate, onSaveStatusChange, onLockChange, shareTrigger, chatOpen, onToggleChat, activeUsers = [], typingUsers = [], remoteUpdate = null, onClearRemoteUpdate }: EditorProps) {
  const [title, setTitle] = useState(note.title)
  const titleValRef = useRef(title)
  titleValRef.current = title

  const [coverImage, setCoverImage] = useState<string | null>(note.coverImage ?? null)
  const [icon, setIcon] = useState<string | null>(note.icon ?? null)

  const [isMobile, setIsMobile] = useState(false)

  async function updatePageDecorator(fields: { coverImage?: string | null; icon?: string | null }) {
    if (fields.coverImage !== undefined) setCoverImage(fields.coverImage)
    if (fields.icon !== undefined) setIcon(fields.icon)
    setStatus('saving')
    try {
      await onUpdate(fields)
      setUpdatedAt(Date.now())
      setStatus('saved')
    } catch {
      setStatus('unsaved')
    }
  }

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])



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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const attachInputRef = useRef<HTMLInputElement>(null)

  const lastTypingSent = useRef<number>(0)
  const lastPosSent = useRef<number>(-1)
  function triggerTyping(pos?: number) {
    const currentPos = pos ?? editor?.state.selection.head ?? 0
    const now = Date.now()
    if (now - lastTypingSent.current > 2000 || currentPos !== lastPosSent.current) {
      lastTypingSent.current = now
      lastPosSent.current = currentPos
      fetch(`/api/notes/${note.id}/typing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pos: currentPos })
      }).catch(() => {})
    }
  }

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
      Placeholder.configure({ placeholder: "Ketik '/' untuk memanggil perintah…" }),
      TextStyle,
      Color,
      Underline,
      Highlight.configure({ multicolor: false }),
      SlashCommandExtension,
      DiagramBlock,
      AttachmentBlockExtension,
      Link.configure({ autolink: true, openOnClick: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
      CollabCursor,
      TaskList,
      TaskItem.configure({ nested: true }),
      CalloutBlock,
      TableOfContentsBlock,
      WebBookmarkBlock,
      ToggleBlock,
      DragDropPlugin,
    ],
    content: (() => {
      try { return JSON.parse(note.content) } catch { return {} }
    })(),
    onUpdate: ({ editor }) => {
      triggerTyping(editor.state.selection.head)
      Promise.resolve().then(() => setStatus('unsaved'))
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        setStatus('saving')

        const currentTitle = titleValRef.current
        const isUntitled = !currentTitle || currentTitle.trim() === '' || currentTitle.trim() === 'Untitled' || currentTitle.trim() === 'Catatan Tanpa Judul'

        let newTitle = currentTitle
        if (isUntitled) {
          const text = editor.getText().trim()
          const firstLine = text.split('\n')[0]?.trim() || ''
          if (firstLine && firstLine.length > 0) {
            newTitle = firstLine.length > 50 ? firstLine.slice(0, 50) + '...' : firstLine
            setTitle(newTitle)
          }
        }

        onUpdate({ content: JSON.stringify(editor.getJSON()), title: newTitle })
          .then(() => { setUpdatedAt(Date.now()); setStatus('saved') })
      }, 1000)
    },
    onSelectionUpdate: ({ editor }) => {
      triggerTyping(editor.state.selection.head)
    }
  })

  const [editDiagramData, setEditDiagramData] = useState<{ id: string; initialData: string } | null>(null)

  useEffect(() => {
    if (editor && editor.storage.diagram) {
      editor.storage.diagram.openEditor = (id: string, initialData: string) => {
        setEditDiagramData({ id, initialData })
      }
    }
    return () => {
      if (editor && editor.storage.diagram) {
        editor.storage.diagram.openEditor = null
      }
    }
  }, [editor])

  const [aiPromptActive, setAiPromptActive] = useState(false)
  const [aiPromptText, setAiPromptText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPromptCoords, setAiPromptCoords] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    function handleOpenAi() {
      if (!editor) return
      setAiPromptActive(true)

      // Calculate cursor coordinates to position the popover inline
      try {
        const { view } = editor
        const { from } = view.state.selection
        const coords = view.coordsAtPos(from)

        // Make sure it fits on screen (assuming width ~400px)
        const left = Math.min(window.innerWidth - 420, Math.max(16, coords.left))
        // Show 8px below the cursor line
        const top = Math.min(window.innerHeight - 180, coords.bottom + 8)

        setAiPromptCoords({ top, left })
      } catch (err) {
        // Fallback to center if coords cannot be calculated
        setAiPromptCoords({
          top: window.innerHeight / 2 - 100,
          left: window.innerWidth / 2 - 200
        })
      }
    }
    window.addEventListener('open-ai-prompt-bar', handleOpenAi)
    return () => window.removeEventListener('open-ai-prompt-bar', handleOpenAi)
  }, [editor])

  async function handleAiGenerate() {
    if (!aiPromptText.trim() || !editor) return
    setAiLoading(true)
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: aiPromptText,
          session_id: note.id
        })
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const data = await response.json()
      const text = data.response || ''
      
      if (text) {
        // Compile markdown to HTML so TipTap parses lists, bold, headings, etc. correctly
        const html = await marked.parse(text, { breaks: true, gfm: true })
        editor.chain().focus().insertContent(html).run()
      }
      setAiPromptText('')
      setAiPromptActive(false)
    } catch (err) {
      console.error(err)
      alert('Gagal membuat teks dengan AI: ' + String(err))
    } finally {
      setAiLoading(false)
    }
  }

  useEffect(() => { return () => clearTimeout(saveTimer.current) }, [])

  useEffect(() => {
    if (editor) {
      (window as any).editor = editor
    }
    return () => {
      delete (window as any).editor
    }
  }, [editor])

  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.view.dispatch(editor.state.tr.setMeta(CollabCursorKey, typingUsers))
    }
  }, [typingUsers, editor])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        clearTimeout(saveTimer.current)
        if (!editor) return
        setStatus('saving')

        const currentTitle = titleValRef.current
        const isUntitled = !currentTitle || currentTitle.trim() === '' || currentTitle.trim() === 'Untitled' || currentTitle.trim() === 'Catatan Tanpa Judul'

        let newTitle = currentTitle
        if (isUntitled) {
          const text = editor.getText().trim()
          const firstLine = text.split('\n')[0]?.trim() || ''
          if (firstLine && firstLine.length > 0) {
            newTitle = firstLine.length > 50 ? firstLine.slice(0, 50) + '...' : firstLine
            setTitle(newTitle)
          }
        }

        onUpdate({ content: JSON.stringify(editor.getJSON()), title: newTitle })
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
  }, [editor])

  useEffect(() => {
    if (editor) (editor.storage as any).noteId = note.id
  }, [editor, note.id])

  useEffect(() => {
    if (remoteUpdate && editor) {
      const isUserEditing = editor.isFocused || document.activeElement === titleRef.current
      if (!isUserEditing) {
        try {
          editor.commands.setContent(JSON.parse(remoteUpdate.content))
          setTitle(remoteUpdate.title)
          if ((remoteUpdate as any).coverImage !== undefined) setCoverImage((remoteUpdate as any).coverImage)
          if ((remoteUpdate as any).icon !== undefined) setIcon((remoteUpdate as any).icon)
          setUpdatedAt(Date.now())
          onClearRemoteUpdate?.()
        } catch (e) {
          console.error('Failed to parse remote update:', e)
        }
      }
    }
  }, [remoteUpdate, editor, onClearRemoteUpdate])

  useEffect(() => {
    function handleAiUpdate(e: Event) {
      const customEvent = e as CustomEvent<{ title?: string; content?: string }>
      const { title: newTitle, content: newContent } = customEvent.detail
      
      let finalTitle = titleValRef.current
      if (newTitle !== undefined) {
        setTitle(newTitle)
        finalTitle = newTitle
      }

      let parsedContent: any = null
      if (newContent !== undefined && editor) {
        try {
          parsedContent = JSON.parse(newContent)
          editor.commands.setContent(parsedContent)
        } catch {
          editor.commands.setContent(newContent)
          parsedContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: newContent }] }] }
        }
      }

      setStatus('saving')
      const finalContent = parsedContent ? JSON.stringify(parsedContent) : JSON.stringify(editor?.getJSON() || {})
      
      onUpdate({ title: finalTitle, content: finalContent })
        .then(() => {
          setUpdatedAt(Date.now())
          setStatus('saved')
        })
    }

    window.addEventListener('note-updated-by-ai', handleAiUpdate)
    return () => window.removeEventListener('note-updated-by-ai', handleAiUpdate)
  }, [editor, onUpdate])

  useEffect(() => {
    setTitle(note.title)
    setCoverImage(note.coverImage ?? null)
    setIcon(note.icon ?? null)
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
    triggerTyping()
    setTitle(e.target.value)
    setStatus('unsaved')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setStatus('saving')
      onUpdate({ title: e.target.value })
        .then(() => { setUpdatedAt(Date.now()); setStatus('saved') })
    }, 1000)
  }

  function handleImportClick() {
    fileInputRef.current?.click()
  }

  async function handleAttachFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!editor || files.length === 0) return
    const noteId = (editor.storage as any).noteId
    for (const file of files) {
      const form = new FormData()
      form.append('file', file)
      form.append('noteId', noteId)
      const res = await fetch('/api/attachments', { method: 'POST', body: form })
      if (!res.ok) continue
      const data = await res.json()
      editor.chain().focus().insertContentAt(editor.state.doc.content.size, {
        type: 'attachment',
        attrs: { attachmentId: data.id, filename: data.filename, mimeType: data.mimeType, size: data.size },
      }).run()
    }
    setStatus('unsaved')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setStatus('saving')
      onUpdate({ content: JSON.stringify(editor.getJSON()) })
        .then(() => { setUpdatedAt(Date.now()); setStatus('saved') })
    }, 1000)
    e.target.value = ''
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !editor) return

    try {
      let html = ''

      if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer()
        const result = await mammoth.convertToHtml({ arrayBuffer })
        html = result.value
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const arrayBuffer = await file.arrayBuffer()
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const parts: string[] = []
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName]
          const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
          if (rows.length === 0) continue
          parts.push(`<h2>${sheetName}</h2>`)
          const tableRows = rows.map((row: string[]) =>
            `<tr>${row.map((cell: string) => `<td>${cell ?? ''}</td>`).join('')}</tr>`
          )
          parts.push(`<table><tbody>${tableRows.join('')}</tbody></table>`)
        }
        html = parts.join('')
      } else if (file.name.endsWith('.pptx')) {
        alert('Format PPTX belum didukung. Gunakan .docx atau .xlsx')
        e.target.value = ''
        return
      } else {
        const text = await file.text()
        if (file.name.endsWith('.json')) {
          const json = JSON.parse(text)
          editor.commands.setContent(json)
        } else if (file.name.endsWith('.md')) {
          html = await marked.parse(text, { breaks: true, gfm: true })
        } else {
          html = `<p>${text.replace(/\n/g, '</p><p>')}</p>`
        }
      }

      if (html) editor.commands.setContent(html)

      setStatus('unsaved')
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        setStatus('saving')
        onUpdate({ content: JSON.stringify(editor.getJSON()) })
          .then(() => { setUpdatedAt(Date.now()); setStatus('saved') })
      }, 1000)
    } catch (err) {
      console.error('Error importing content:', err)
      alert('Gagal mengimpor file: ' + String(err))
    }

    e.target.value = ''
  }

  return (
    <div style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0, flexDirection: 'column' }}>
      <div style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0 }}>
      {/* Editor pane */}
      {(!isMobile || !preview) && (
        <div
          style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', position: 'relative', cursor: 'text', minWidth: 0 }}
          onClick={e => { if (e.target === e.currentTarget) editor?.commands.focus('end') }}
        >
          {/* Cover Image Banner */}
          {coverImage ? (
            <div
              style={{
                width: '100%',
                height: isMobile ? '120px' : '180px',
                backgroundImage: coverImage.startsWith('linear-gradient') ? coverImage : `url(${coverImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                position: 'relative',
              }}
              className="group/cover"
            >
              {/* Cover Controls */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  right: '20px',
                  display: 'flex',
                  gap: '8px',
                }}
                className="opacity-0 group-hover/cover:opacity-100 transition-opacity duration-200"
              >
                <CoverSelector onSelect={(gradient) => updatePageDecorator({ coverImage: gradient })} />
                <button
                  onClick={() => updatePageDecorator({ coverImage: null })}
                  style={{
                    padding: '4px 10px',
                    background: 'rgba(0,0,0,0.65)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '0.725rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Hapus Cover
                </button>
              </div>
            </div>
          ) : null}

          {/* Content Wrapper */}
          <div
            style={{
              padding: isMobile ? '64px 16px 20px' : '40px 60px',
              width: '100%',
              position: 'relative',
            }}
          >
            {/* Top-right action buttons */}
            <div style={{ position: 'absolute', top: isMobile ? 12 : 20, right: isMobile ? 16 : 20, display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 8 }}>
              {/* Active Users Presence Indicator */}
              {activeUsers.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 8 }}>
                  {activeUsers.map(user => {
                    const initial = user.username.slice(0, 2).toUpperCase()
                    const isTyping = typingUsers.some(u => u.username === user.username)
                    return (
                      <div
                        key={user.userId}
                        title={`${user.username} ${isTyping ? 'sedang mengetik...' : 'sedang melihat'}`}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: isTyping ? 'var(--primary)' : 'var(--accent)',
                          border: isTyping ? '2px solid #2f9e44' : '2px solid var(--primary)',
                          color: isTyping ? 'var(--save-bg)' : 'var(--primary)',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                          position: 'relative',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {initial}
                        {isTyping && (
                          <span style={{
                            position: 'absolute',
                            bottom: -2,
                            right: -2,
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: '#2f9e44',
                            border: '2px solid var(--bg)',
                            display: 'block'
                          }} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".txt,.md,.json,.docx,.xlsx,.xls"
                style={{ display: 'none' }}
              />
              <button
                onClick={handleImportClick}
                title="Impor Konten"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32,
                  border: '1px solid var(--border)', borderRadius: '50%',
                  background: 'var(--bg)',
                  color: 'var(--fg-muted)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)' }}
              >
                <FileUp size={14} />
              </button>

              <input
                ref={attachInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={handleAttachFiles}
              />
              <button
                onClick={() => attachInputRef.current?.click()}
                title="Upload file & foto"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32,
                  border: '1px solid var(--border)', borderRadius: '50%',
                  background: 'var(--bg)',
                  color: 'var(--fg-muted)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)' }}
              >
                <Paperclip size={14} />
              </button>

              <button
                onClick={() => setShowShare(true)}
                title="Bagikan catatan"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32,
                  border: `1px solid ${shareToken ? 'var(--primary)' : 'var(--border)'}`, borderRadius: '50%',
                  background: shareToken ? 'var(--accent)' : 'var(--bg)',
                  color: shareToken ? 'var(--primary)' : 'var(--fg-muted)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!shareToken) { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' } }}
                onMouseLeave={e => { if (!shareToken) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)' } }}
              >
                <Share2 size={14} />
              </button>

              <button
                onClick={() => setPinModal(isLocked ? 'remove' : 'set')}
                title={isLocked ? 'Hapus PIN' : 'Kunci dengan PIN'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32,
                  border: `1px solid ${isLocked ? 'var(--primary)' : 'var(--border)'}`, borderRadius: '50%',
                  background: isLocked ? 'var(--accent)' : 'var(--bg)',
                  color: isLocked ? 'var(--primary)' : 'var(--fg-muted)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!isLocked) { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' } }}
                onMouseLeave={e => { if (!isLocked) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)' } }}
              >
                {isLocked ? <Lock size={14} /> : <LockOpen size={14} />}
              </button>

              <button
                onClick={() => setPreview(v => !v)}
                title={preview ? 'Hide preview' : 'Show preview'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32,
                  border: '1px solid var(--border)', borderRadius: '50%',
                  background: preview ? 'var(--accent)' : 'var(--bg)',
                  color: preview ? 'var(--primary)' : 'var(--fg-muted)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!preview) { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' } }}
                onMouseLeave={e => { if (!preview) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)' } }}
              >
                {preview ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>

              {onToggleChat && (
                <button
                  onClick={onToggleChat}
                  title={chatOpen ? 'Sembunyikan AI Assistant' : 'Tampilkan AI Assistant'}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 32, height: 32,
                    border: `1px solid ${chatOpen ? 'var(--primary)' : 'var(--border)'}`, borderRadius: '50%',
                    background: chatOpen ? 'var(--accent)' : 'var(--bg)',
                    color: chatOpen ? 'var(--primary)' : 'var(--fg-muted)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!chatOpen) { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' } }}
                  onMouseLeave={e => { if (!chatOpen) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)' } }}
                >
                  <Sparkles size={14} />
                </button>
              )}
            </div>

            {/* Page Icon (Emoji Selector) */}
            {icon ? (
              <div style={{ marginTop: coverImage ? '-75px' : '0', marginBottom: '16px', position: 'relative', zIndex: 10, display: 'inline-block' }}>
                <EmojiSelector
                  currentIcon={icon}
                  onSelect={(emoji) => updatePageDecorator({ icon: emoji })}
                  onRemove={() => updatePageDecorator({ icon: null })}
                />
              </div>
            ) : null}

            {/* Add Icon / Add Cover Quick Actions */}
            {(!coverImage || !icon) && (
              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  marginBottom: '16px',
                  fontSize: '0.8rem',
                  color: 'var(--fg-subtle)',
                }}
                className="opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200"
              >
                {!icon && (
                  <button
                    onClick={() => updatePageDecorator({ icon: '📝' })}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--fg-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    ➕ Tambah Ikon
                  </button>
                )}
                {!coverImage && (
                  <button
                    onClick={() => updatePageDecorator({ coverImage: COVER_GRADIENTS[0] })}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--fg-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    ➕ Tambah Cover
                  </button>
                )}
              </div>
            )}

            {/* metadata bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 20, fontSize: '0.75rem', color: 'var(--fg-subtle)', fontFamily: 'var(--font-body)', marginTop: isMobile ? 8 : 0 }}>
              <span>
                Dibuat <span style={{ color: 'var(--fg-muted)' }}>{fmt(note.createdAt)}</span>
                {note.createdByUsername && <> oleh <span style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>{note.createdByUsername}</span></>}
              </span>
              <span>
                Diperbarui <span style={{ color: 'var(--fg-muted)' }}>{fmt(updatedAt)}</span>
                {note.updatedByUsername && <> oleh <span style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>{note.updatedByUsername}</span></>}
              </span>
            </div>

            {/* Remote Update Notification Banner */}
            {remoteUpdate && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                marginBottom: 16,
                background: 'var(--accent)',
                border: '1px solid var(--primary)',
                borderRadius: 8,
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
                color: 'var(--primary)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
              }}>
                <span style={{ fontWeight: 500 }}>
                  Catatan diperbarui oleh <span style={{ textDecoration: 'underline' }}>{remoteUpdate.updatedBy}</span>.
                </span>
                <button
                  onClick={() => {
                    if (editor) {
                      try {
                        editor.commands.setContent(JSON.parse(remoteUpdate.content))
                        setTitle(remoteUpdate.title)
                        setUpdatedAt(Date.now())
                        onClearRemoteUpdate?.()
                      } catch (e) {
                        console.error(e)
                      }
                    }
                  }}
                  style={{
                    padding: '4px 12px',
                    background: 'var(--primary)',
                    color: 'var(--save-bg)',
                    border: 'none',
                    borderRadius: 20,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    transition: 'opacity 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  Sinkronkan
                </button>
              </div>
            )}

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
            <div className="editor-content-wrapper" style={{ position: 'relative' }}>
              <DragHandle editor={editor} />
              <EditorContent
                editor={editor}
                style={{ outline: 'none' }}
                className="max-w-none [&_.ProseMirror]:outline-none"
              />
            </div>
            <div
              style={{ minHeight: '35vh', cursor: 'text' }}
              onClick={() => editor?.commands.focus('end')}
            />
            <div style={{ borderBottom: '1px solid var(--border)', opacity: 0.5 }} />
          </div>
        </div>
      )}

      {/* Preview pane */}
      {preview && (
        <PreviewPanel
          editor={editor}
          title={title}
          isMobile={isMobile}
          onCloseMobile={() => setPreview(false)}
        />
      )}
      </div>

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
          isTeamNote={note.organizationId !== null && note.organizationId !== ''}
        />
      )}

      {editDiagramData && (
        <EditDiagramDialog
          editor={editor}
          data={editDiagramData}
          onClose={() => setEditDiagramData(null)}
        />
      )}

      {/* AI Prompt Modal (Inline Tooltip style) */}
      {aiPromptActive && aiPromptCoords && (
        <>
          {/* Transparent Backdrop to close when clicking outside */}
          <div
            onClick={() => setAiPromptActive(false)}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              zIndex: 998,
              background: 'transparent',
              pointerEvents: 'auto'
            }}
          />
          {/* Floating Tooltip Container */}
          <div style={{
            position: 'fixed',
            top: `${aiPromptCoords.top}px`,
            left: `${aiPromptCoords.left}px`,
            zIndex: 999,
            fontFamily: 'var(--font-body)',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            width: '400px',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            pointerEvents: 'auto'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)' }}>
              <Sparkles size={14} />
              Tulis dengan AI
            </div>
            
            {aiLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '12px 0' }}>
                <div className="dot-blink" style={{ display: 'flex', gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)' }} />
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', animationDelay: '0.2s' }} />
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', animationDelay: '0.4s' }} />
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--fg-muted)' }}>AI sedang menulis...</span>
              </div>
            ) : (
              <>
                <textarea
                  autoFocus
                  placeholder="Tanyakan ke AI (Enter untuk kirim, Esc untuk batal)..."
                  value={aiPromptText}
                  onChange={e => setAiPromptText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleAiGenerate()
                    }
                    if (e.key === 'Escape') {
                      setAiPromptActive(false)
                    }
                  }}
                  style={{
                    width: '100%',
                    height: 54,
                    padding: 8,
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-app)',
                    color: 'var(--fg)',
                    fontSize: '0.85rem',
                    outline: 'none',
                    resize: 'none',
                    fontFamily: 'inherit'
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                  <button
                    onClick={() => setAiPromptActive(false)}
                    style={{
                      padding: '4px 10px',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      color: 'var(--fg-muted)',
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleAiGenerate}
                    disabled={!aiPromptText.trim()}
                    style={{
                      padding: '4px 12px',
                      background: 'var(--primary)',
                      border: 'none',
                      borderRadius: 4,
                      color: '#ffffff',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      cursor: aiPromptText.trim() ? 'pointer' : 'not-allowed',
                      opacity: aiPromptText.trim() ? 1 : 0.6
                    }}
                  >
                    Hasilkan
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
