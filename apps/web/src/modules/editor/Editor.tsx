import { useEditor, EditorContent } from '@tiptap/react'
import Link from '@tiptap/extension-link'
import StarterKit from '@tiptap/starter-kit'
import Heading from '@tiptap/extension-heading'
import { Collaboration } from '@tiptap/extension-collaboration'
import { CollaborationCaret } from '@tiptap/extension-collaboration-caret'
import * as Y from 'yjs'
import { prosemirrorJSONToYXmlFragment } from 'y-prosemirror'
import { WebsocketProvider } from 'y-websocket'
import { useAuth } from '../shared/auth'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Image } from '@tiptap/extension-image'
import Youtube from '@tiptap/extension-youtube'
import { HorizontalRule } from '@tiptap/extension-horizontal-rule'
import { Placeholder } from '@tiptap/extension-placeholder'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import { SlashCommandExtension } from './SlashCommand'
import { DiagramBlock, EditDiagramDialog } from './DiagramBlock'
import { AttachmentBlockExtension, pendingFiles } from './AttachmentBlock'
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
import { AiDraftBlock } from './AiDraftBlock'
import { DragHandle } from './DragHandle'
import { NoteIcon } from '../shared/ui'
import { ClarifyFlow, parseClarifyBlocks } from '../shared/ui/ClarifyFlow'
import { useEffect, useRef, useState, useMemo } from 'react'
import { Eye, EyeOff, Lock, LockOpen, Share2, FileUp, Paperclip, Sparkles, Smile, Image as ImageIcon, Clock, Download, Loader2 } from 'lucide-react'
import { ExportModal } from './ExportModal'
// import { WikiIngestButton } from '../wiki' // hidden — feature on hold
import { marked } from 'marked'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'

import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'


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



export const DragDropPlugin = Extension.create({
  name: 'dragDropPlugin',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDrop(view, event) {
            // First check if it is an external file drop
            const files = event.dataTransfer ? Array.from(event.dataTransfer.files) : []
            if (files.length > 0) {
              event.preventDefault()
              
              // Calculate drop position
              const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY })
              const dropPos = coordinates ? coordinates.pos : view.state.selection.to

              for (const file of files) {
                const uploadId = 'upload_' + Math.random().toString(36).substring(2, 9)
                pendingFiles.set(uploadId, file)

                const node = view.state.schema.nodes.attachment.create({
                  attachmentId: null,
                  uploadId,
                  filename: file.name,
                  mimeType: file.type,
                  size: file.size
                })
                const tr = view.state.tr.insert(dropPos, node)
                view.dispatch(tr)
              }
              return true
            }

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

            // Resolve target block depth
            const $pos = view.state.doc.resolve(dropPos)
            if ($pos.depth === 0) return false

            let targetDepth = $pos.depth
            while (targetDepth > 0) {
              const nodeType = $pos.node(targetDepth).type.name
              if (
                nodeType === 'listItem' ||
                nodeType === 'taskItem' ||
                nodeType === 'callout' ||
                nodeType === 'diagram' ||
                nodeType === 'toggleBlock' ||
                nodeType === 'bookmark'
              ) {
                break
              }
              if (targetDepth === 1) {
                break
              }
              targetDepth--
            }

            const targetBlockStart = $pos.before(targetDepth)
            const targetBlockNode = $pos.node(targetDepth)
            const targetBlockEnd = targetBlockStart + targetBlockNode.nodeSize

            // Determine drop position (before or after target block)
            // By default, drop before target block
            let dropAt = targetBlockStart

            // Use target element's DOM bounding rect to check if mouse is on upper or lower half
            const targetElement = event.target as HTMLElement
            let current: HTMLElement | null = targetElement
            let targetBlockDom: HTMLElement | null = null
            const editorDom = view.dom
            while (current && current.parentElement) {
              if (current.parentElement === editorDom) {
                targetBlockDom = current
                break
              }
              if (
                current.tagName === 'LI' ||
                current.getAttribute('data-type') === 'callout' ||
                current.getAttribute('data-type') === 'diagram' ||
                current.getAttribute('data-type') === 'toggle-block' ||
                current.getAttribute('data-type') === 'bookmark'
              ) {
                targetBlockDom = current
                break
              }
              current = current.parentElement
            }

            if (targetBlockDom) {
              const rect = targetBlockDom.getBoundingClientRect()
              const relativeY = event.clientY - rect.top
              if (relativeY > rect.height / 2) {
                dropAt = targetBlockEnd
              }
            } else {
              // Fallback: if mouse is in the bottom half of the block, drop after
              const blockLength = targetBlockNode.textContent.length
              const offsetInsideBlock = $pos.parentOffset
              if (offsetInsideBlock > blockLength / 2) {
                dropAt = targetBlockEnd
              }
            }

            if (dragStartPos === dropAt) {
              return true
            }

            if (dragStartPos < dropAt) {
              // Dragging down: delete original node first
              tr.delete(dragStartPos, dragStartPos + draggedNode.nodeSize)
              // Calculate target position in modified document
              const targetPos = Math.min(tr.doc.content.size, Math.max(0, dropAt - draggedNode.nodeSize))
              tr.insert(targetPos, draggedNode)
            } else {
              // Dragging up: insert first
              tr.insert(dropAt, draggedNode)
              // Calculate target position in modified document (shifted by nodeSize)
              const targetStart = dragStartPos + draggedNode.nodeSize
              tr.delete(targetStart, targetStart + draggedNode.nodeSize)
            }

            view.dispatch(tr)
            return true
          },
          handlePaste(view, event) {
            const files = event.clipboardData ? Array.from(event.clipboardData.files) : []
            if (files.length > 0) {
              event.preventDefault()

              // Determine insert position (current cursor position)
              const dropPos = view.state.selection.to

              for (const file of files) {
                const uploadId = 'upload_' + Math.random().toString(36).substring(2, 9)
                pendingFiles.set(uploadId, file)

                const node = view.state.schema.nodes.attachment.create({
                  attachmentId: null,
                  uploadId,
                  filename: file.name,
                  mimeType: file.type,
                  size: file.size
                })
                const tr = view.state.tr.insert(dropPos, node)
                view.dispatch(tr)
              }
              return true
            }
            return false
          }
        }
      })
    ]
  }
})

interface EditorProps {
  note: Note
  onUpdate: (fields: { title?: string; content?: string; coverImage?: string | null; icon?: string | null }) => Promise<void>
  onSaveStatusChange?: (status: 'saved' | 'saving' | 'unsaved' | 'generating') => void
  onLockChange?: (isLocked: boolean) => void
  shareTrigger?: number
  chatOpen?: boolean
  onToggleChat?: () => void
  historyOpen?: boolean
  onToggleHistory?: () => void
}

function fmt(ts: number) {
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'generating'

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

function EmojiSelector({ currentIcon, onSelect, onRemove, onOpenChange }: { currentIcon: string; onSelect: (emoji: string) => void; onRemove: () => void; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])

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
        <NoteIcon icon={currentIcon} size={48} />
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
              Remove Icon
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
        Change Cover
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
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--fg-muted)', marginBottom: '8px' }}>Color Gradient</div>
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
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--fg-muted)', marginBottom: '8px' }}>Illustration Image</div>
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

export function Editor({ note, onUpdate, onSaveStatusChange, onLockChange, shareTrigger, chatOpen, onToggleChat, historyOpen, onToggleHistory }: EditorProps) {
  const [title, setTitle] = useState(note.title)
  const titleValRef = useRef(title)
  titleValRef.current = title

  const [coverImage, setCoverImage] = useState<string | null>(note.coverImage ?? null)
  const [icon, setIcon] = useState<string | null>(note.icon ?? null)

  const [isMobile, setIsMobile] = useState(false)
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false)

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
  const [showExport, setShowExport] = useState(false)
  function setStatus(s: SaveStatus) { onSaveStatusChange?.(s) }
  const titleRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const attachInputRef = useRef<HTMLInputElement>(null)

  const { user: currentUser } = useAuth()
  const [activeUsers, setActiveUsers] = useState<{ userId: string; username: string; isTyping: boolean; color: string }[]>([])

  const { ydoc, provider } = useMemo(() => {
    const ydoc = new Y.Doc()
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const provider = new WebsocketProvider(
      `${protocol}//${window.location.host}/api/notes/${note.id}/collaboration`,
      note.id,
      ydoc,
      { connect: false }
    )
    return { ydoc, provider }
  }, [note.id])

  useEffect(() => {
    provider.connect()
    return () => {
      provider.disconnect()
      ydoc.destroy()
    }
  }, [provider, ydoc])

  useEffect(() => {
    if (currentUser) {
      const colors = ['#f783ac', '#da77f2', '#94d82d', '#ffd43b', '#ff922b', '#20c997', '#22b8cf', '#4d638d']
      const color = colors[(currentUser.userId || '').charCodeAt(0) % colors.length]
      provider.awareness.setLocalStateField('user', {
        name: currentUser.username,
        color: color,
      })
    }
  }, [currentUser, provider])

  useEffect(() => {
    const handleAwarenessUpdate = () => {
      const states = Array.from(provider.awareness.getStates().entries())
      const usersList = states.map(([clientId, state]: [number, any]) => {
        const user = state.user
        if (!user) return null
        return {
          userId: String(clientId),
          username: user.name || 'Anonymous',
          isTyping: !!state.isTyping,
          color: user.color || '#2f9e44',
        }
      }).filter(Boolean) as { userId: string; username: string; isTyping: boolean; color: string }[]

      const uniqueUsers = usersList.filter((val, index, self) =>
        self.findIndex(t => t.username === val.username) === index
      )
      setActiveUsers(uniqueUsers)
    }

    provider.awareness.on('update', handleAwarenessUpdate)
    handleAwarenessUpdate()

    return () => {
      provider.awareness.off('update', handleAwarenessUpdate)
    }
  }, [provider])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, horizontalRule: false }),
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
      Placeholder.configure({ placeholder: "Type '/' to invoke commands..." }),
      TextStyle,
      Color,
      Underline,
      Highlight.configure({ multicolor: false }),
      SlashCommandExtension,
      DiagramBlock,
      AttachmentBlockExtension,
      Link.configure({ autolink: true, openOnClick: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
      Collaboration.configure({
        document: ydoc,
      }),
      CollaborationCaret.configure({
        provider: provider,
        user: {
          name: currentUser?.username || 'Anonymous',
          color: '#2f9e44',
        }
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CalloutBlock,
      TableOfContentsBlock,
      WebBookmarkBlock,
      ToggleBlock,
      AiDraftBlock,
      DragDropPlugin,
    ],
    onUpdate: ({ editor, transaction }) => {
      const isRemote = transaction.getMeta('y-sync$') !== undefined
      if (!isRemote && currentUser && provider) {
        provider.awareness.setLocalStateField('isTyping', true)
        clearTimeout(typingTimer.current)
        typingTimer.current = setTimeout(() => {
          provider.awareness.setLocalStateField('isTyping', false)
        }, 3000)
      }
      if (isRemote) return

      Promise.resolve().then(() => setStatus('unsaved'))
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        setStatus('saving')

        const currentTitle = titleValRef.current
        const isUntitled = !currentTitle || currentTitle.trim() === '' || currentTitle.trim() === 'Untitled' || currentTitle.trim() === 'Untitled Note'

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
    }
  }, [ydoc, provider, currentUser])

  useEffect(() => {
    if (!editor || !note.content) return

    function injectContent() {
      const fragment = ydoc.getXmlFragment('default')
      if (fragment.length > 0) return
      try {
        const json = JSON.parse(note.content)
        prosemirrorJSONToYXmlFragment(editor!.schema, json, fragment)
      } catch (e) {
        console.error('Failed to parse initial content', e)
      }
    }

    // Inject immediately without waiting for WS sync
    injectContent()

    // Also handle case where WS syncs after inject (server doc may overwrite)
    const handleSync = (isSynced: boolean) => {
      if (isSynced) injectContent()
    }
    provider.on('sync', handleSync)
    return () => { provider.off('sync', handleSync) }
  }, [editor, provider, ydoc, note.content])

  const [editDiagramData, setEditDiagramData] = useState<{ id: string; initialData: string } | null>(null)

  useEffect(() => {
    if (editor && (editor.storage as any).diagram) {
      (editor.storage as any).diagram.openEditor = (id: string, initialData: string) => {
        setEditDiagramData({ id, initialData })
      }
    }
    return () => {
      if (editor && (editor.storage as any).diagram) {
        (editor.storage as any).diagram.openEditor = null
      }
    }
  }, [editor])

  const [aiPromptActive, setAiPromptActive] = useState(false)
  const [aiPromptText, setAiPromptText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPromptCoords, setAiPromptCoords] = useState<{ top: number; left: number } | null>(null)
  const [aiClarifyBlocks, setAiClarifyBlocks] = useState<ReturnType<typeof parseClarifyBlocks>>([])
  const aiPendingActionRef = useRef<{ prompt: string; action?: string; from?: number; to?: number; agentKey?: string } | null>(null)

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

  useEffect(() => {
    function handleTriggerAi(e: Event) {
      const customEvent = e as CustomEvent<{ prompt: string; action?: 'replace' | 'insert_below' | 'append_to_end'; from?: number; to?: number; agentKey?: string }>
      const { prompt, action, from, to, agentKey } = customEvent.detail
      handleAiGenerate(prompt, action, from, to, agentKey)
    }
    window.addEventListener('trigger-ai-action', handleTriggerAi)
    return () => window.removeEventListener('trigger-ai-action', handleTriggerAi)
  }, [editor, aiPromptText])

  async function handleAiGenerate(
    overridePrompt?: string,
    action?: 'replace' | 'insert_below' | 'append_to_end',
    from?: number,
    to?: number,
    agentKey?: string
  ) {
    const prompt = overridePrompt || aiPromptText
    if (!prompt.trim() || !editor) return
    setAiLoading(true)
    setStatus('generating')
    
    let startPos = editor.state.selection.from
    let endPos = editor.state.selection.to

    if (from !== undefined && to !== undefined) {
      startPos = from
      endPos = to
    }

    if (action === 'replace') {
      editor.chain().focus().deleteRange({ from: startPos, to: endPos }).run()
      editor.commands.setTextSelection(startPos)
    } else if (action === 'insert_below') {
      editor.commands.setTextSelection(endPos)
      editor.chain().focus().insertContent('\n').run()
      startPos = editor.state.selection.from
    } else if (action === 'append_to_end') {
      const docEnd = editor.state.doc.content.size
      editor.commands.setTextSelection(docEnd)
      editor.chain().focus().insertContent([
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Summary' }] },
        { type: 'paragraph' }
      ]).run()
      startPos = editor.state.selection.from
    }

    let fullText = ''
    let promptBarClosed = false
    let streamError: string | null = null

    const cursorChar = ' ▋'
    let hasCursor = false

    const insertDeltaWithCursor = (delta: string) => {
      if (hasCursor) {
        const cur = editor.state.selection.from
        editor.chain().focus().deleteRange({ from: cur - cursorChar.length, to: cur }).run()
      }
      editor.chain().focus().insertContent(delta + cursorChar).run()
      hasCursor = true
    }

    const removeCursor = () => {
      if (hasCursor) {
        const cur = editor.state.selection.from
        editor.chain().focus().deleteRange({ from: cur - cursorChar.length, to: cur }).run()
        hasCursor = false
      }
    }

    try {
      const response = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: prompt,
          session_id: note.id,
          note_title: note.title,
          note_content: editor.getText(),
          // Signal to backend which agent to use
          agent: agentKey || 'editor',
        })
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const reader = response.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let buffer = ''

      // Track if AI used a note-tool instead of streaming text
      let pendingToolContent: string | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        if (!promptBarClosed) {
          setAiPromptActive(false)
          promptBarClosed = true
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const cleanLine = line.trim()
          if (!cleanLine.startsWith('data: ')) continue
          
          const jsonStr = cleanLine.substring(6)
          if (jsonStr === '[DONE]') continue
          
          try {
            const data = JSON.parse(jsonStr)
            if (data.type === 'error' && data.errorText) {
              streamError = data.errorText
            } else if (data.type === 'text-delta' && data.delta) {
              const delta = data.delta
              fullText += delta
              insertDeltaWithCursor(delta)
            } else if (
              data.type === 'tool-input-available' &&
              (data.toolName === 'write_notes' || data.toolName === 'update_note_direct')
            ) {
              // AI chose to call a note tool — capture its content to insert directly
              const toolArgs = data.input || {}
              if (toolArgs.content) {
                pendingToolContent = toolArgs.content
              }
            }
          } catch (e) {
            // Ignore JSON parsing errors for partial or non-json lines
          }
        }
      }

      // Handle any remaining buffer content
      if (buffer.trim().startsWith('data: ')) {
        try {
          const jsonStr = buffer.trim().substring(6)
          if (jsonStr !== '[DONE]') {
            const data = JSON.parse(jsonStr)
            if (data.type === 'error' && data.errorText) {
              streamError = data.errorText
            } else if (data.type === 'text-delta' && data.delta) {
              const delta = data.delta
              fullText += delta
              insertDeltaWithCursor(delta)
            } else if (
              data.type === 'tool-input-available' &&
              (data.toolName === 'write_notes' || data.toolName === 'update_note_direct')
            ) {
              const toolArgs = data.input || {}
              if (toolArgs.content) pendingToolContent = toolArgs.content
            }
          }
        } catch (e) {}
      }

      // Remove the inline cursor before final compilation
      removeCursor()

      // If stream error occurred and no text was generated, show error
      if (streamError && !fullText && !pendingToolContent) {
        throw new Error(streamError)
      }

      // Check if streamed text is a clarify question — intercept before inserting
      const detectedClarify = parseClarifyBlocks(fullText)
      if (detectedClarify.length > 0 && !pendingToolContent) {
        // Undo the streamed text that was inserted into the doc
        if (fullText) {
          const end = editor.state.selection.from
          editor.chain().focus().deleteRange({ from: startPos, to: end }).run()
        }
        aiPendingActionRef.current = { prompt, action, from, to, agentKey }
        setAiClarifyBlocks(detectedClarify)
        setAiLoading(false)
        setAiPromptActive(true)
        return
      }

      // Case 1: AI streamed text directly — replace the streamed chars with parsed HTML
      if (fullText) {
        if (!promptBarClosed) {
          setAiPromptActive(false)
          promptBarClosed = true
        }
        const endPos = editor.state.selection.from
        const html = await marked.parse(fullText, { breaks: true, gfm: true })
        editor.chain().focus().deleteRange({ from: startPos, to: endPos }).insertContent(html).run()
      }

      // Case 2: AI called a note tool (write_notes / update_note_direct) — insert its content directly
      if (!fullText && pendingToolContent) {
        if (!promptBarClosed) {
          setAiPromptActive(false)
          promptBarClosed = true
        }
        // pendingToolContent may be raw HTML (from format_as_tiptap) or markdown
        const isHtml = /^<[a-zA-Z]/.test(pendingToolContent.trimStart())
        const htmlToInsert = isHtml
          ? pendingToolContent
          : await marked.parse(pendingToolContent, { breaks: true, gfm: true })
        const endPos = editor.state.selection.from
        editor.chain().focus().deleteRange({ from: startPos, to: endPos }).insertContent(htmlToInsert).run()
      }

      setAiPromptText('')
    } catch (err) {
      removeCursor()
      console.error(err)
      alert('Failed to generate text with AI: ' + String(err))
    } finally {
      removeCursor()
      setAiLoading(false)
      setAiPromptActive(false)
      setStatus('saved')
    }
  }

  useEffect(() => {
    return () => {
      clearTimeout(saveTimer.current)
      clearTimeout(typingTimer.current)
    }
  }, [])

  useEffect(() => {
    if (editor) {
      (window as any).editor = editor
    }
    return () => {
      delete (window as any).editor
    }
  }, [editor])



  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        clearTimeout(saveTimer.current)
        if (!editor) return
        setStatus('saving')

        const currentTitle = titleValRef.current
        const isUntitled = !currentTitle || currentTitle.trim() === '' || currentTitle.trim() === 'Untitled' || currentTitle.trim() === 'Untitled Note'

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
          parsedContent = editor.getJSON()
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
    if (currentUser && provider) {
      provider.awareness.setLocalStateField('isTyping', true)
      clearTimeout(typingTimer.current)
      typingTimer.current = setTimeout(() => {
        provider.awareness.setLocalStateField('isTyping', false)
      }, 3000)
    }
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
        alert('PPTX format is not supported yet. Use .docx or .xlsx')
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
      alert('Failed to import file: ' + String(err))
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
                  Remove Cover
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
            {/* Top-right action buttons (Sticky Action Bar) */}
            <div style={{ 
              position: 'sticky', 
              top: 0, 
              display: 'flex', 
              justifyContent: 'flex-end', 
              alignItems: 'center', 
              gap: isMobile ? 6 : 8,
              zIndex: 30,
              background: 'var(--bg)',
              padding: isMobile ? '12px 16px' : '16px 60px',
              margin: isMobile ? '-64px -16px 24px' : '-40px -60px 32px',
              borderBottom: '1px solid var(--border)',
            }}>
              {/* Add Icon (if not present) */}
              {!icon && (
                <button
                  onClick={() => updatePageDecorator({ icon: '📝' })}
                  title="Add Icon"
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
                  <Smile size={14} />
                </button>
              )}

              {/* Add Cover (if not present) */}
              {!coverImage && (
                <button
                  onClick={() => updatePageDecorator({ coverImage: COVER_GRADIENTS[0] })}
                  title="Add Cover"
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
                  <ImageIcon size={14} />
                </button>
              )}
              {/* Active Users Presence Indicator */}
              {activeUsers.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 8 }}>
                  {activeUsers.map(user => {
                    const initial = user.username.slice(0, 2).toUpperCase()
                    const isTyping = user.isTyping
                    const userColor = user.color || 'var(--primary)'
                    return (
                      <div
                        key={user.userId}
                        title={`${user.username} ${isTyping ? 'is typing...' : 'is viewing'}`}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: isTyping ? userColor : 'var(--accent)',
                          border: `2px solid ${userColor}`,
                          color: isTyping ? '#ffffff' : userColor,
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
                title="Import Content"
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

              <button
                onClick={() => setShowExport(true)}
                title="Export Note (PDF/Markdown)"
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
                <Download size={14} />
              </button>

              {/* WikiIngestButton hidden — feature on hold */}

              <input
                ref={attachInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={handleAttachFiles}
              />
              <button
                onClick={() => attachInputRef.current?.click()}
                title="Upload file & photo"
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
                title="Share note"
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
                title={isLocked ? 'Remove PIN' : 'Lock with PIN'}
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
                  title={chatOpen ? 'Hide AI Assistant' : 'Show AI Assistant'}
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

              {onToggleHistory && (
                <button
                  onClick={onToggleHistory}
                  title={historyOpen ? 'Hide Version History' : 'Show Version History'}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 32, height: 32,
                    border: `1px solid ${historyOpen ? 'var(--primary)' : 'var(--border)'}`, borderRadius: '50%',
                    background: historyOpen ? 'var(--accent)' : 'var(--bg)',
                    color: historyOpen ? 'var(--primary)' : 'var(--fg-muted)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!historyOpen) { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' } }}
                  onMouseLeave={e => { if (!historyOpen) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)' } }}
                >
                  <Clock size={14} />
                </button>
              )}
            </div>

            {/* Page Icon (Emoji Selector) */}
            {icon ? (
              <div 
                style={coverImage ? {
                  position: 'absolute',
                  top: isMobile ? '-50px' : '-60px',
                  left: isMobile ? '16px' : '60px',
                  zIndex: isEmojiPickerOpen ? 200 : 10,
                  display: 'inline-block'
                } : {
                  marginTop: '16px',
                  marginBottom: '16px',
                  position: 'relative',
                  zIndex: isEmojiPickerOpen ? 200 : 10,
                  display: 'inline-block'
                }}
              >
                <EmojiSelector
                  currentIcon={icon}
                  onSelect={(emoji) => updatePageDecorator({ icon: emoji })}
                  onRemove={() => updatePageDecorator({ icon: null })}
                  onOpenChange={setIsEmojiPickerOpen}
                />
              </div>
            ) : null}

            {/* Add Icon / Add Cover Quick Actions (moved to header) */}

            {/* metadata bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 20, fontSize: '0.75rem', color: 'var(--fg-subtle)', fontFamily: 'var(--font-body)', marginTop: isMobile ? 8 : 0 }}>
              <span>
                Created <span style={{ color: 'var(--fg-muted)' }}>{fmt(note.createdAt)}</span>
                {note.createdByUsername && <> by <span style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>{note.createdByUsername}</span></>}
              </span>
              <span>
                Updated <span style={{ color: 'var(--fg-muted)' }}>{fmt(updatedAt)}</span>
                {note.updatedByUsername && <> by <span style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>{note.updatedByUsername}</span></>}
              </span>
            </div>

            {/* Remote Update Notification Banner */}


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
              {aiLoading && (
                <div className="absolute -bottom-10 left-0 flex items-center gap-2 px-3 py-1.5 rounded-md bg-neutral-500/10 border border-neutral-500/20 text-neutral-600 dark:text-neutral-400 text-[0.75rem] font-medium pointer-events-none z-20">
                  <Loader2 size={12} className="animate-spin" />
                  <span>Thinking...</span>
                </div>
              )}
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

      {showExport && (
        <ExportModal
          note={{
            id: note.id,
            title: title || 'Untitled',
            content: note.content,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
            createdByUsername: note.createdByUsername,
            coverImage: coverImage,
            icon: icon,
          }}
          onClose={() => setShowExport(false)}
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
              Write with AI
            </div>
            
            {aiLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '16px 0' }}>
                <Loader2 className="animate-spin" size={14} color="var(--fg-subtle)" />
                <span style={{ fontSize: '0.78rem', color: 'var(--fg-subtle)' }}>Thinking...</span>
              </div>
            ) : aiClarifyBlocks.length > 0 ? (
              <ClarifyFlow
                blocks={aiClarifyBlocks}
                onComplete={answers => {
                  const details = aiClarifyBlocks
                    .map(b => `${b.question}: ${answers[b.question]}`)
                    .join('\n')
                  const pending = aiPendingActionRef.current
                  setAiClarifyBlocks([])
                  aiPendingActionRef.current = null
                  setAiPromptActive(false)
                  if (pending) {
                    handleAiGenerate(
                      `${pending.prompt}\n\n${details}`,
                      pending.action as any,
                      pending.from,
                      pending.to,
                      pending.agentKey
                    )
                  }
                }}
              />
            ) : (
              <>
                <textarea
                  autoFocus
                  placeholder="Ask AI (Enter to send, Esc to cancel)..."
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
                    Cancel
                  </button>
                  <button
                    onClick={() => handleAiGenerate()}
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
                    Generate
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
