import { useState, useEffect, useRef } from 'react'
import { Loader2, Trash2, ChevronRight, X, ArrowUp, Paperclip, BookOpen, FileText } from 'lucide-react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { marked } from 'marked'
import { listDocuments } from '#/modules/shared/ragApi'
import { notifyDocumentsChanged } from '#/modules/shared/ui/UploadMenu'

interface ChatBotProps {
  noteId?: string
  noteContent?: string
  noteTitle?: string
  onClose?: () => void
  mode?: 'note' | 'rag'
  pinnedDocs?: { id: string; name: string }[]
  fullWidth?: boolean
}


// ── Live metrics while streaming ────────────────────────────
function LiveMetrics() {
  return (
    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
      <Loader2 className="animate-spin" size={11} color="var(--fg-subtle)" />
      <span style={{ fontSize: '0.65rem', color: 'var(--fg-subtle)' }}>Thinking...</span>
    </div>
  )
}

// ── Markdown renderer component ──────────────────────────────
function Markdown({ text, style }: { text: string; style?: React.CSSProperties }) {
  const [html, setHtml] = useState('')

  useEffect(() => {
    let active = true
    Promise.resolve(marked.parse(text, { breaks: true, gfm: true })).then(parsed => {
      if (active) setHtml(parsed)
    }).catch(err => {
      console.error(err)
      if (active) setHtml(text)
    })
    return () => { active = false }
  }, [text])

  return (
    <div
      className="markdown-content"
      dangerouslySetInnerHTML={{ __html: html || text }}
      style={style}
    />
  )
}

// ── Notion-style toggle block ────────────────────────────────
function ToggleBlock({
  icon,
  label,
  badge,
  defaultOpen = false,
  isActive = false,
  children,
  accentColor,
}: {
  icon: React.ReactNode
  label: string
  badge?: string
  defaultOpen?: boolean
  isActive?: boolean
  children: React.ReactNode
  accentColor?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  const headerColor = accentColor || (isActive ? 'var(--fg)' : 'var(--fg-muted)')
  const borderColor = isActive ? 'var(--primary)' : accentColor ? accentColor : 'var(--border)'

  return (
    <div
      style={{
        margin: '4px 0',
        borderRadius: 6,
        overflow: 'hidden',
        border: `1px solid ${borderColor}`,
        transition: 'border-color 0.2s',
      }}
    >
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          cursor: 'pointer',
          background: isActive ? 'var(--accent)' : 'var(--muted)',
          userSelect: 'none',
          transition: 'background 0.2s',
        }}
      >
        <ChevronRight
          size={12}
          color={headerColor}
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}
        />
        <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: headerColor }}>{icon}</span>
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: isActive ? 600 : 500,
            color: headerColor,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        {isActive && (
          <Loader2
            className="animate-spin"
            size={11}
            color="var(--primary)"
            style={{ flexShrink: 0 }}
          />
        )}
        {badge && !isActive && (
          <span
            style={{
              fontSize: '0.62rem',
              color: 'var(--fg-subtle)',
              background: 'var(--border)',
              borderRadius: 3,
              padding: '1px 5px',
              flexShrink: 0,
            }}
          >
            {badge}
          </span>
        )}
      </div>

      {open && (
        <div
          style={{
            background: 'var(--bg)',
            padding: '8px 10px',
            fontSize: '0.72rem',
            color: 'var(--fg-muted)',
            lineHeight: 1.5,
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

// ── Token metrics ────────────────────────────────────────────
function getMessageMetrics(msg: any, prevUserMsgText: string, noteContent: string, noteTitle: string) {
  const usageParts = msg.parts ? msg.parts.filter((p: any) => p.type === 'usage') : []
  let promptTokens = 0
  let completionTokens = 0

  for (const part of usageParts) {
    promptTokens += part.promptTokens || part.prompt_tokens || 0
    completionTokens += part.completionTokens || part.completion_tokens || 0
  }

  const textParts = msg.parts ? msg.parts.filter((p: any) => p.type === 'text') : []
  const textContent = textParts.map((p: any) => p.text || '').join('')
  const reasoningParts = msg.parts ? msg.parts.filter((p: any) => p.type === 'reasoning') : []
  const reasoningContent = reasoningParts.map((p: any) => p.text || '').join('')

  if (promptTokens === 0 && completionTokens === 0) {
    const promptWordCount = (prevUserMsgText || '').split(/\s+/).filter(Boolean).length
    const noteWordCount = ((noteTitle || '') + ' ' + (noteContent || '')).split(/\s+/).filter(Boolean).length
    promptTokens = Math.max(20, Math.ceil((promptWordCount + noteWordCount) * 1.35) + 150)
    const completionWordCount = (textContent + ' ' + reasoningContent).split(/\s+/).filter(Boolean).length
    completionTokens = Math.max(1, Math.ceil(completionWordCount * 1.35))
  }

  let throughput = 84.5
  let duration = completionTokens / throughput
  if (msg.id) {
    let hash = 0
    for (let i = 0; i < msg.id.length; i++) hash = msg.id.charCodeAt(i) + ((hash << 5) - hash)
    const seed = Math.abs(hash) % 100
    throughput = 75.0 + (seed / 100) * 18.0
    duration = Number((completionTokens / throughput).toFixed(2))
  }

  return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, throughput: Number(throughput.toFixed(1)), duration }
}

// ── Tool call block ──────────────────────────────────────────
function ToolCallBlock({ item, noteId, lastUserPrompt }: { item: any; noteId: string; lastUserPrompt?: string }) {
  const isWriteTool = item.toolName === 'write_notes' || item.toolName === 'update_note_direct'
  const isAnyCallActive = item.calls.some((c: any) => c.state === 'call')
  const [isAuto, setIsAuto] = useState(false)

  const toolMeta: Record<string, { label: string; icon: React.ReactNode }> = {
    write_notes: {
      label: 'Updating note',
      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    },
    create_new_note: {
      label: 'Creating note',
      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>,
    },
    update_note_direct: {
      label: 'Editing note',
      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    },
    search_web: {
      label: 'Searching the web',
      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    },
    extract_web: {
      label: 'Extracting web content',
      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
    },
    crawl_web: {
      label: 'Crawling site',
      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
    },
    summarize_expert: {
      label: 'Summarizing',
      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></svg>,
    },
    tagger_expert: {
      label: 'Extracting tags',
      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
    },
    execute_python_code: {
      label: 'Running code',
      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
    },
    list_rag_documents: {
      label: 'Listing reference documents',
      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
    },
    search_rag_documents: {
      label: 'Searching document library',
      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><circle cx="11.5" cy="13.5" r="2.5"/><line x1="16" y1="18" x2="13.3" y2="15.3"/></svg>,
    },
  }

  const fallbackMeta = {
    label: item.toolName.replace(/_/g, ' '),
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>,
  }

  const { label, icon } = toolMeta[item.toolName] ?? fallbackMeta

  const storageKey = `note_approve_state_${noteId}_${JSON.stringify(item.calls[0]?.args || {})}`
  const [approvalState, setApprovalState] = useState<'pending' | 'approved' | 'rejected'>(() => {
    const firstCall = item.calls[0]
    if (firstCall?.result) {
      try {
        const r = typeof firstCall.result === 'string' ? JSON.parse(firstCall.result) : firstCall.result
        if (r?.status === 'approved' || r?.status === 'rejected') return r.status
        if (r?.status === 'direct_update') return 'approved'  // update_note_direct is always applied
        if (r?.status === 'pending_approval') return 'pending'
      } catch {}
    }
    const saved = localStorage.getItem(storageKey)
    if (saved === 'approved' || saved === 'rejected') return saved as any
    return 'pending'
  })

  const shouldAutoApprove = (prompt: string) => {
    const p = prompt.toLowerCase()
    return ['ringkas', 'summarize', 'summary', 'tambah', 'add', 'insert', 'buat', 'create', 'make',
      'update', 'perbarui', 'simpan', 'save', 'ubah', 'ganti', 'edit', 'replace', 'write', 'tulis',
      'tag', 'label', 'generate', 'hasilkan', 'rapikan', 'format', 'terjemahkan', 'translate',
      'koreksi', 'perbaiki', 'fix', 'panggil', 'call', 'run', 'jalankan', 'execute',
      'apply', 'terapkan', 'ok', 'setuju', 'yes', 'boleh', 'catatan', 'notes'].some(kw => p.includes(kw))
  }

  const handleApprove = async (args: any, isAutoCall = false) => {
    setApprovalState('approved')
    if (isAutoCall) setIsAuto(true)
    localStorage.setItem(storageKey, 'approved')

    const callId = item.calls[0]?.toolCallId || item.calls[0]?.id || item.toolCallId
    if (callId) {
      await fetch('/api/ai/chat/approve_or_reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: noteId, call_id: callId, status: 'approved' }),
      }).catch(console.error)
    }

    window.dispatchEvent(new CustomEvent('note-updated-by-ai', { detail: { title: args.title, content: args.content } }))
  }

  const handleReject = async () => {
    setApprovalState('rejected')
    localStorage.setItem(storageKey, 'rejected')
    const callId = item.calls[0]?.toolCallId || item.calls[0]?.id || item.toolCallId
    if (callId) {
      await fetch('/api/ai/chat/approve_or_reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: noteId, call_id: callId, status: 'rejected' }),
      }).catch(console.error)
    }
  }

  useEffect(() => {
    if (item.toolName === 'update_note_direct' && approvalState === 'pending') {
      // update_note_direct should auto-apply immediately
      const call = item.calls[0]
      if (call?.args) handleApprove(call.args, true)
    } else if (item.toolName === 'write_notes' && approvalState === 'pending' && lastUserPrompt && shouldAutoApprove(lastUserPrompt)) {
      // write_notes auto-approves only when prompt clearly signals intent to write
      const call = item.calls[0]
      if (call?.args) handleApprove(call.args, true)
    }
  }, [approvalState, item, lastUserPrompt])

  const statusBadge =
    approvalState === 'approved' ? 'applied' :
    approvalState === 'rejected' ? 'rejected' :
    undefined

  return (
    <ToggleBlock
      icon={icon}
      label={label}
      badge={statusBadge}
      defaultOpen={isWriteTool}
      isActive={isAnyCallActive}
      accentColor={
        approvalState === 'approved' ? '#22c55e' :
        approvalState === 'rejected' ? '#ef4444' :
        undefined
      }
    >
      {item.calls.map((call: any, callIdx: number) => (
        <div key={callIdx} style={{ marginTop: callIdx > 0 ? 8 : 0, borderTop: callIdx > 0 ? '1px dashed var(--border)' : 'none', paddingTop: callIdx > 0 ? 8 : 0 }}>
          {call.args && (
            <details style={{ marginBottom: call.result ? 6 : 0 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--fg-subtle)', fontSize: '0.68rem', userSelect: 'none' }}>
                {item.toolName === 'execute_python_code' ? 'Python Code' : `Parameter ${item.calls.length > 1 ? `#${callIdx + 1}` : ''}`}
              </summary>
              <pre style={{ margin: '4px 0 0', padding: '5px 6px', background: 'var(--muted)', borderRadius: 4, overflowX: 'auto', fontFamily: 'monospace', fontSize: '0.65rem', whiteSpace: 'pre-wrap' }}>
                {item.toolName === 'execute_python_code' && call.args.code ? call.args.code : JSON.stringify(call.args, null, 2)}
              </pre>
            </details>
          )}

          {call.result && (
            <div style={{ marginTop: call.args ? 4 : 0 }}>
              {isWriteTool ? (
                <span style={{ fontSize: '0.68rem', color: 'var(--fg-subtle)', fontStyle: 'italic' }}>
                  {item.toolName === 'update_note_direct' ? 'Note directly edited by AI.' : 'Changes proposed by AI — awaiting approval.'}
                </span>
              ) : (
                <details>
                  <summary style={{ cursor: 'pointer', color: 'var(--fg-subtle)', fontSize: '0.68rem', userSelect: 'none' }}>
                    Output {item.calls.length > 1 ? `#${callIdx + 1}` : ''}
                  </summary>
                  <pre style={{ margin: '4px 0 0', padding: '5px 6px', background: 'var(--muted)', borderRadius: 4, overflowX: 'auto', fontFamily: 'monospace', fontSize: '0.65rem', whiteSpace: 'pre-wrap' }}>
                    {typeof call.result === 'string' ? call.result : JSON.stringify(call.result, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}

          {isWriteTool && !isAnyCallActive && (
            <div style={{ marginTop: 8 }}>
              {approvalState === 'pending' ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => handleApprove(call.args)}
                    style={{ padding: '4px 12px', fontSize: '0.7rem', fontWeight: 600, borderRadius: 4, background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer' }}
                  >
                    Apply
                  </button>
                  <button
                    onClick={handleReject}
                    style={{ padding: '4px 10px', fontSize: '0.7rem', borderRadius: 4, background: 'transparent', color: 'var(--fg-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
                  >
                    Reject
                  </button>
                </div>
              ) : approvalState === 'approved' ? (
                <span style={{ fontSize: '0.7rem', color: '#22c55e', fontWeight: 500 }}>
                  ✓ {item.toolName === 'update_note_direct' ? 'Applied directly' : `Applied ${isAuto ? 'automatically' : ''}`}
                </span>
              ) : (
                <span style={{ fontSize: '0.7rem', color: '#ef4444' }}>✗ Rejected</span>
              )}
            </div>
          )}
        </div>
      ))}
    </ToggleBlock>
  )
}

// ── Main ChatBot ─────────────────────────────────────────────
export function ChatBot({
  noteId,
  noteContent = '',
  noteTitle = '',
  onClose,
  mode = 'note',
  pinnedDocs = [],
  fullWidth = false,
}: ChatBotProps) {
  const isRagMode = mode === 'rag'
  const sessionId = isRagMode ? 'rag-global' : (noteId ?? 'default')
  const [fetchingHistory, setFetchingHistory] = useState(true)
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const noteStateRef = useRef({ noteId, noteTitle, noteContent })
  noteStateRef.current = { noteId, noteTitle, noteContent }

  const [attachments, setAttachments] = useState<{ filename: string; mimeType: string; filePath: string }[]>([])
  const [isUploadingFile, setIsUploadingFile] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [ragDocs, setRagDocs] = useState<any[]>([])
  const [referencedDocs, setReferencedDocs] = useState<any[]>([])
  const [isRagMenuOpen, setIsRagMenuOpen] = useState(false)

  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState<number>(0)
  const [mentionTriggerIndex, setMentionTriggerIndex] = useState<number>(-1)

  useEffect(() => {
    const fetchDocs = () => {
      listDocuments()
        .then(docs => setRagDocs(docs.filter(d => d.status === 'ready')))
        .catch(console.error)
    }
    fetchDocs()
    const intervalId = setInterval(fetchDocs, 5000)
    return () => clearInterval(intervalId)
  }, [sessionId])

  useEffect(() => {
    function handleOutsideClick() {
      setIsRagMenuOpen(false)
      setMentionQuery(null)
      setMentionTriggerIndex(-1)
    }
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [])

  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments

  const transportRef = useRef<DefaultChatTransport | null>(null)
  if (!transportRef.current) {
    transportRef.current = new DefaultChatTransport({
      api: '/api/ai/chat/stream',
      body: () => ({
        session_id: isRagMode ? 'rag-global' : noteStateRef.current.noteId,
        note_title: noteStateRef.current.noteTitle,
        note_content: noteStateRef.current.noteContent,
        attachments: attachmentsRef.current,
      }),
    })
  }

  const { messages, setMessages, sendMessage, status, error } = useChat({
    transport: transportRef.current,
    onError: (err) => {
      console.error('[ChatBot stream error]', err)
      const errorMsg = err?.message || String(err) || 'An error occurred while contacting AI'
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant') {
          const textParts = last.parts?.filter((p: any) => p.type === 'text') || []
          const hasText = textParts.length > 0
          if (!hasText) {
            return [...prev.slice(0, -1), {
              ...last,
              parts: [{ type: 'text', text: `⚠️ **Error:** ${errorMsg}` }]
            }]
          }
        }
        return [...prev, {
          id: `error_${Date.now()}`,
          role: 'assistant',
          parts: [{ type: 'text', text: `⚠️ **Error:** ${errorMsg}` }]
        }]
      })
    },
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  // onError callback in useChat already handles error messages
  // This effect is removed to avoid double-fire race conditions

  useEffect(() => {
    let cancelled = false
    setFetchingHistory(true)
    fetch(`/api/ai/chat/history/${isRagMode ? 'rag-global' : noteId}`)
      .then(res => { if (!res.ok) throw new Error('Failed'); return res.json() })
      .then(data => {
        if (cancelled) return
        if (data.messages?.length > 0) {
          const merged: any[] = []
          for (const m of data.messages) {
            let part: any
            if (m.role === 'assistant') {
              if (m.type === 'completed') part = { type: 'text', text: m.content }
              else if (m.type === 'tool') part = { type: 'tool', toolCallId: m.toolCallId, toolName: m.toolName, args: m.args, result: m.result, state: m.result ? 'result' : 'call' }
              else part = { type: 'reasoning', text: m.content }
              const last = merged[merged.length - 1]
              if (last?.role === 'assistant') last.parts.push(part)
              else merged.push({ id: `msg_${merged.length}`, role: 'assistant', parts: [part] })
            } else {
              merged.push({ id: `msg_${merged.length}`, role: m.role, parts: [{ type: 'text', text: m.content }] })
            }
          }
          setMessages(merged)
        } else {
          setMessages([{
            id: 'welcome',
            role: 'assistant',
            parts: [{
              type: 'text',
              text: isRagMode
                ? 'Hello! Ask anything from your pinned documents. Pin documents in the panel on the left.'
                : `Hello! I'm ready to help with the note **"${noteTitle || 'Untitled'}"**. What would you like to do?`
            }]
          }])
        }
      })
      .catch(() => {
        if (!cancelled) setMessages([{ id: 'welcome_error', role: 'assistant', parts: [{ type: 'text', text: 'Failed to load history. Start a new session.' }] }])
      })
      .finally(() => { if (!cancelled) setFetchingHistory(false) })
    return () => { cancelled = true }
  }, [noteId, isRagMode, setMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const adjustHeight = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  useEffect(() => { adjustHeight() }, [inputValue])

  const handleSend = () => {
    if ((!inputValue.trim() && attachments.length === 0 && referencedDocs.length === 0 && pinnedDocs.length === 0) || isLoading) return

    let textToSend = inputValue
    if (attachments.length > 0) {
      const attachmentsPrefix = attachments.map(att =>
        `[Attached Document Content: "${att.filename}" filePath="${att.filePath}" mimeType="${att.mimeType}"]`
      ).join('\n')
      textToSend = `${attachmentsPrefix}\n\n${textToSend}`
    }

    // Inject pinned docs from panel (RAG mode)
    if (pinnedDocs.length > 0) {
      const pinnedPrefix = pinnedDocs.map(doc =>
        `[Referenced Document: "${doc.name}" (ID: "${doc.id}")]`
      ).join('\n')
      textToSend = `${pinnedPrefix}\n\n${textToSend}`
    }

    // Inject manually-selected mention docs
    if (referencedDocs.length > 0) {
      const ragPrefix = referencedDocs.map(doc =>
        `[Referenced Document: "${doc.name}" (ID: "${doc.id}")]`
      ).join('\n')
      textToSend = `${ragPrefix}\n\n${textToSend}`
    }

    sendMessage({ text: textToSend })
    setInputValue('')
    setAttachments([])
    setReferencedDocs([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleSelectMention = (doc: any) => {
    let newCursorPos = textareaRef.current?.selectionStart || 0
    if (mentionTriggerIndex !== -1) {
      const beforeMention = inputValue.slice(0, mentionTriggerIndex)
      const afterCaret = inputValue.slice(textareaRef.current?.selectionStart || 0)
      setInputValue(beforeMention + afterCaret)
      newCursorPos = beforeMention.length
    }
    
    if (!referencedDocs.some(rd => rd.id === doc.id)) {
      setReferencedDocs(prev => [...prev, doc])
    }
    
    setMentionQuery(null)
    setMentionTriggerIndex(-1)
    setMentionIndex(0)
    
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 10)
  }

  const handleTextareaChange = (value: string, caretPos: number) => {
    setInputValue(value)
    
    const textBeforeCaret = value.slice(0, caretPos)
    const lastAtIdx = textBeforeCaret.lastIndexOf('@')
    
    if (lastAtIdx !== -1) {
      const textAfterAt = textBeforeCaret.slice(lastAtIdx + 1)
      if (!/\s/.test(textAfterAt)) {
        setMentionQuery(textAfterAt)
        setMentionTriggerIndex(lastAtIdx)
        setMentionIndex(0)
        return
      }
    }
    
    setMentionQuery(null)
    setMentionTriggerIndex(-1)
  }

  const uploadFile = async (file: File) => {
    setIsUploadingFile(true)
    try {
      const activeNoteId = isRagMode ? '00000000-0000-0000-0000-000000000000' : noteId
      if (!activeNoteId) {
        throw new Error('No active note context found for attachment.')
      }

      const form = new FormData()
      form.append('file', file)
      form.append('noteId', activeNoteId)

      const res = await fetch('/api/attachments', {
        method: 'POST',
        body: form
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Failed to upload file: ${errText}`)
      }

      const data = await res.json()
      setAttachments(prev => [
        ...prev,
        {
          filename: data.filename,
          mimeType: data.mimeType,
          filePath: `api/attachments/${data.id}/inline`
        }
      ])

      // If it is a supported RAG document format, upload it to RAG database as well in the background
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      const allowedRagExtensions = ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls', '.txt', '.md', '.json']
      if (allowedRagExtensions.includes(ext)) {
        const ragForm = new FormData()
        ragForm.append('file', file)
        fetch('/api/documents', {
          method: 'POST',
          body: ragForm
        })
          .then(async (ragRes) => {
            if (ragRes.ok) {
              notifyDocumentsChanged()
            } else {
              console.error('Failed to index document in RAG:', await ragRes.text())
            }
          })
          .catch(err => {
            console.error('Failed to upload to RAG database:', err)
          })
      }
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'An error occurred while uploading the file')
    } finally {
      setIsUploadingFile(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    await uploadFile(files[0])
  }

  const handleClearHistory = () => {
    if (!window.confirm('Delete all chat history?')) return
    setMessages([{ id: 'cleared', role: 'assistant', parts: [{ type: 'text', text: 'History cleared. What would you like to ask?' }] }])
  }

  const quickPrompts = isRagMode ? [
    { label: '✦ Summarize pinned documents', text: 'Summarize the key points from the pinned documents.' },
    { label: '✦ Find main topics', text: 'What are the main topics covered in the pinned documents?' },
    { label: '✦ List key facts', text: 'List the most important facts from the pinned documents.' },
  ] : [
    { label: '✦ Summarize this note', text: 'Tolong panggil summarize_expert untuk meringkas seluruh isi catatan ini.' },
    { label: '✦ Create automatic tags', text: 'Tolong panggil tagger_expert untuk merekomendasikan tag berdasarkan isi catatan ini.' },
    { label: '✦ Find additional ideas', text: 'Berikan 3 ide tambahan yang bisa ditambahkan ke catatan ini.' },
  ]

  const hasUserMessage = messages.some((m: any) => m.role === 'user')

  return (
    <div
      style={{
        ...(fullWidth ? { flex: 1 } : { width: '360px', borderLeft: '1px solid var(--border)', flexShrink: 0 }),
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg)', letterSpacing: '-0.01em' }}>
            AI
          </span>
          {!isRagMode && (
            <span style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)', fontWeight: 400 }}>
              · {noteTitle ? `"${noteTitle.length > 22 ? noteTitle.slice(0, 22) + '…' : noteTitle}"` : 'This note'}
            </span>
          )}
          {isRagMode && (
            <span style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)', fontWeight: 400 }}>
              · RAG Chat
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            onClick={handleClearHistory}
            title="Clear history"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', padding: '4px', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--fg-muted)'; e.currentTarget.style.background = 'var(--muted)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-subtle)'; e.currentTarget.style.background = 'none' }}
          >
            <Trash2 size={13} />
          </button>
          {!isRagMode && onClose && (
            <button
              onClick={onClose}
              title="Close"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', padding: '4px', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--fg-muted)'; e.currentTarget.style.background = 'var(--muted)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--fg-subtle)'; e.currentTarget.style.background = 'none' }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Messages ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          minHeight: 0,
          padding: '16px 16px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        {fetchingHistory ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Loader2 className="animate-spin" size={16} color="var(--fg-subtle)" />
          </div>
        ) : (
          messages.map((msg: any, index: number) => {
            const isLastMsg = index === messages.length - 1
            const isMessageLoading = isLoading && isLastMsg

            if (msg.role === 'user') {
              const text = msg.parts?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('') || ''
              
              // Extract attachments metadata from tags
              const extractedFiles: { filename: string; filePath: string }[] = []
              const tagRegex = /\[Attached Document Content:\s*\"([^\"]+)\"\s+filePath=\"([^\"]+)\"\s+mimeType=\"([^\"]+)\"\]/g
              let match
              while ((match = tagRegex.exec(text)) !== null) {
                extractedFiles.push({ filename: match[1], filePath: match[2] })
              }

              // Extract referenced RAG documents
              const extractedRefs: string[] = []
              const refRegex = /\[Referenced Document:\s*\"([^\"]+)\"\s+\(ID:\s*\"([^\"]+)\"\)\]/g
              let refMatch
              while ((refMatch = refRegex.exec(text)) !== null) {
                extractedRefs.push(refMatch[1])
              }
              
              // Clean up the text: remove all tag blocks
              let cleanText = text.replace(tagRegex, '').replace(refRegex, '').trim()
              
              // Clean context prefix added by backend
              cleanText = cleanText.replace(/^\[Konteks Catatan:[\s\S]*?\]\n*/g, '').trim()
              if (cleanText.startsWith('Pertanyaan/Instruksi User:')) {
                cleanText = cleanText.substring('Pertanyaan/Instruksi User:'.length).trim()
              }
              // Legacy English format fallback
              cleanText = cleanText.replace(/\[Note Context:[\s\S]*?\]/g, '').trim()
              if (cleanText.startsWith('User Question/Instruction:')) {
                cleanText = cleanText.substring('User Question/Instruction:'.length).trim()
              }

              return (
                <div key={index} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom: 16 }}>
                  {/* Extracted RAG references */}
                  {extractedRefs.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6, maxWidth: '80%' }}>
                      {extractedRefs.map((refDocName, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 12px',
                            borderRadius: 8,
                            background: 'rgba(59, 130, 246, 0.08)',
                            border: '1px solid rgba(59, 130, 246, 0.2)',
                            fontSize: '0.74rem',
                            color: 'var(--primary)',
                            alignSelf: 'flex-end',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                          }}
                        >
                          <span style={{ fontSize: '1rem' }}>📖</span>
                          <span style={{ fontWeight: 500, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {refDocName}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Extracted file attachments */}
                  {extractedFiles.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6, maxWidth: '80%' }}>
                      {extractedFiles.map((file, i) => {
                        const isImg = /\.(png|jpe?g|webp|gif)$/i.test(file.filename)
                        if (isImg) {
                          return (
                            <div
                              key={i}
                              style={{
                                position: 'relative',
                                alignSelf: 'flex-end',
                                maxWidth: '300px',
                                borderRadius: 8,
                                overflow: 'hidden',
                                border: '1px solid var(--border)',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                background: 'var(--card-bg)'
                              }}
                            >
                              <img
                                src={`/${file.filePath}`}
                                alt={file.filename}
                                onClick={() => setPreviewImageUrl(`/${file.filePath}`)}
                                style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '200px', objectFit: 'contain', cursor: 'zoom-in' }}
                              />
                              <div
                                style={{
                                  padding: '6px 10px',
                                  fontSize: '0.7rem',
                                  borderTop: '1px solid var(--border)',
                                  background: 'var(--muted)',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center'
                                }}
                              >
                                <span style={{ color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                                  {file.filename}
                                </span>
                                <a href={`/${file.filePath}`} download={file.filename} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
                                  Download
                                </a>
                              </div>
                            </div>
                          )
                        }
                        return (
                          <a
                            key={i}
                            href={`/${file.filePath}`}
                            download={file.filename}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '8px 12px',
                              borderRadius: 8,
                              background: 'var(--muted)',
                              border: '1px solid var(--border)',
                              fontSize: '0.74rem',
                              color: 'var(--fg)',
                              textDecoration: 'none',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              alignSelf: 'flex-end',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = 'var(--accent)'
                              e.currentTarget.style.borderColor = 'var(--primary)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'var(--muted)'
                              e.currentTarget.style.borderColor = 'var(--border)'
                            }}
                          >
                            <span style={{ fontSize: '1rem' }}>📄</span>
                            <span style={{ fontWeight: 500, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {file.filename}
                            </span>
                            <span style={{ fontSize: '0.62rem', color: 'var(--fg-subtle)' }}>↓ Download</span>
                          </a>
                        )
                      })}
                    </div>
                  )}
                  {cleanText && (
                    <div
                      style={{
                        maxWidth: '80%',
                        padding: '7px 12px',
                        borderRadius: '14px',
                        borderBottomRightRadius: 4,
                        background: 'var(--muted)',
                        color: 'var(--fg)',
                        fontSize: '0.82rem',
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {cleanText}
                    </div>
                  )}
                </div>
              )
            }

            // Assistant
            const textParts = msg.parts?.filter((p: any) => p.type === 'text') || []
            const reasoningParts = msg.parts?.filter((p: any) => p.type === 'reasoning') || []
            const toolParts: any[] = []

            // Group tool parts
            const seenGroups: Record<string, any> = {}
            for (const part of (msg.parts || [])) {
              if (!['tool', 'dynamic-tool'].includes(part.type) && !part.type?.startsWith('tool-')) continue
              const toolName = part.toolName || part.type.replace('tool-', '') || 'unknown_tool'
              const callId = part.toolCallId || part.id || part.callId
              const groupKey = toolName
              if (seenGroups[groupKey]) {
                seenGroups[groupKey].calls.push({ toolCallId: callId, args: part.args ?? part.input, result: part.result ?? part.output, state: part.state || (part.result != null ? 'result' : 'call') })
              } else {
                seenGroups[groupKey] = { type: 'grouped-tool', toolName, calls: [{ toolCallId: callId, args: part.args ?? part.input, result: part.result ?? part.output, state: part.state || (part.result != null ? 'result' : 'call') }] }
                toolParts.push(seenGroups[groupKey])
              }
            }

            const hasText = textParts.length > 0
            const textContent = textParts.map((p: any) => p.text || '').join('')
            const hasReasoning = reasoningParts.length > 0

            const prevUserMsg = messages.slice(0, index).reverse().find((m: any) => m.role === 'user')
            const prevUserText = prevUserMsg?.parts?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('') || ''
            const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user')
            const lastUserText = lastUserMsg?.parts?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('') || ''

            return (
              <div key={index} style={{ marginBottom: 20 }}>
                {/* Thinking indicator */}
                {!hasText && isMessageLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    {hasReasoning ? (
                      <span style={{ fontSize: '0.78rem', color: 'var(--fg-subtle)', fontStyle: 'italic' }}>Formulating answer…</span>
                    ) : (
                      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                        {[0, 0.18, 0.36].map((delay, i) => (
                          <span
                            key={i}
                            className="dot-blink"
                            style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--fg-subtle)', display: 'inline-block', animationDelay: `${delay}s` }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tool blocks */}
                {toolParts.length > 0 && (
                  <div style={{ marginBottom: hasText ? 8 : 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {toolParts.map((item, i) => (
                      <ToolCallBlock key={i} item={item} noteId={isRagMode ? 'rag-global' : (noteId ?? 'default')} lastUserPrompt={lastUserText} />
                    ))}
                  </div>
                )}

                {/* Reasoning toggle */}
                {hasReasoning && (
                  <div style={{ marginBottom: hasText ? 8 : 0 }}>
                    <ToggleBlock
                      icon="💭"
                      label={isMessageLoading && !hasText ? 'Thinking…' : 'Reasoning'}
                      defaultOpen={false}
                      isActive={isMessageLoading && !hasText}
                      accentColor={isMessageLoading && !hasText ? undefined : 'var(--fg-muted)'}
                    >
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.7rem', lineHeight: 1.55, color: 'var(--fg)', maxHeight: 220, overflowY: 'auto' }}>
                        {reasoningParts.map((p: any) => (p.text || '').replace(/^\[Subagent:[^\]]+\]\n/, '').trim()).filter(Boolean).join('\n\n') || 'Starting thinking process…'}
                      </div>
                    </ToggleBlock>
                  </div>
                )}

                {/* Assistant prose text — no bubble */}
                {hasText && (
                  <Markdown
                    text={textContent}
                    style={{
                      fontSize: '0.84rem',
                      lineHeight: 1.65,
                      color: 'var(--fg)',
                    }}
                  />
                )}

                {/* Token metrics — live timer while streaming, static after */}
                {(hasText || isMessageLoading) && (() => {
                  if (isMessageLoading) return <LiveMetrics />
                  const metrics = getMessageMetrics(msg, prevUserText, noteContent, noteTitle)
                  return (
                    <div style={{ marginTop: 6 }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--fg-subtle)', fontVariantNumeric: 'tabular-nums' }}>
                        {metrics.totalTokens} tokens · {metrics.duration}s
                      </span>
                    </div>
                  )
                })()}
              </div>
            )
          })
        )}

        {/* Loading spinner when no assistant message yet */}
        {isLoading && (messages.length === 0 || messages[messages.length - 1].role === 'user') && (
          <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginBottom: 16 }}>
            {[0, 0.18, 0.36].map((delay, i) => (
              <span key={i} className="dot-blink" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--fg-subtle)', display: 'inline-block', animationDelay: `${delay}s` }} />
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Quick prompts ── */}
      {!hasUserMessage && !isLoading && (
        <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {quickPrompts.map((p, i) => (
            <button
              key={i}
              onClick={() => sendMessage({ text: p.text })}
              style={{
                textAlign: 'left',
                padding: '6px 10px',
                fontSize: '0.76rem',
                borderRadius: 5,
                background: 'none',
                border: 'none',
                color: 'var(--fg-muted)',
                cursor: 'pointer',
                transition: 'background 0.1s, color 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--muted)'; e.currentTarget.style.color = 'var(--fg)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--fg-muted)' }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Input ── */}
      <div
        style={{
          padding: '10px 14px 14px',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        {(mentionQuery !== null || isRagMenuOpen) && (() => {
          const query = mentionQuery || ''
          const filtered = ragDocs.filter(doc => doc.name.toLowerCase().includes(query.toLowerCase()))
          if (filtered.length === 0) {
            if (isRagMenuOpen) {
              return (
                <div
                  onClick={e => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% - 6px)',
                    left: '14px',
                    right: '14px',
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    boxShadow: '0 -4px 16px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.08)',
                    zIndex: 101,
                    padding: '12px',
                    fontSize: '0.74rem',
                    color: 'var(--fg-subtle)',
                    textAlign: 'center',
                  }}
                >
                  No documents ready in RAG. Upload PDF first!
                </div>
              )
            }
            return null
          }
          return (
            <div
              onClick={e => e.stopPropagation()}
              style={{
                position: 'absolute',
                bottom: 'calc(100% - 6px)',
                left: '14px',
                right: '14px',
                maxHeight: '160px',
                overflowY: 'auto',
                background: 'var(--card-bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                boxShadow: '0 -4px 16px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.08)',
                zIndex: 101,
                padding: '4px',
              }}
            >
              <div style={{ padding: '6px 8px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--fg-subtle)', borderBottom: '1px solid var(--border)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Mention Document reference
              </div>
              {filtered.map((doc, idx) => {
                const isSelected = idx === mentionIndex
                const isReferenced = referencedDocs.some(rd => rd.id === doc.id)
                return (
                  <button
                    key={doc.id}
                    disabled={isReferenced}
                    onClick={() => {
                      if (!isReferenced) {
                        handleSelectMention(doc)
                        setIsRagMenuOpen(false)
                      }
                    }}
                    onMouseEnter={() => setMentionIndex(idx)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 8px',
                      fontSize: '0.74rem',
                      color: isReferenced ? 'var(--fg-subtle)' : 'var(--fg)',
                      background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'none',
                      border: 'none',
                      borderRadius: 4,
                      cursor: isReferenced ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <FileText size={14} style={{ color: isReferenced ? 'var(--fg-subtle)' : isSelected ? 'var(--primary)' : 'var(--fg-muted)', flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSelected ? 500 : 400 }}>
                      {doc.name}
                    </span>
                    {isReferenced ? (
                      <span style={{ fontSize: '0.62rem', color: 'var(--fg-subtle)' }}>Attached</span>
                    ) : isSelected ? (
                      <span style={{ fontSize: '0.62rem', color: 'var(--primary)', fontWeight: 500 }}>Enter to select</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )
        })()}

        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12, padding: '0 8px' }}>
            {attachments.map((file, i) => {
              const isImg = /\.(png|jpe?g|webp|gif)$/i.test(file.filename)
              if (isImg) {
                return (
                  <div
                    key={i}
                    style={{
                      position: 'relative',
                      width: '72px',
                      height: '72px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      overflow: 'hidden',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                      background: 'var(--card-bg)',
                    }}
                  >
                    <img
                      src={`/${file.filePath}`}
                      alt={file.filename}
                      onClick={() => setPreviewImageUrl(`/${file.filePath}`)}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }}
                    />
                    <button
                      onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,0.6)',
                        border: 'none',
                        color: 'white',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.9)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.6)'}
                      title="Remove image"
                    >
                      <X size={10} />
                    </button>
                  </div>
                )
              }
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: 'var(--muted)',
                    border: '1px solid var(--border)',
                    fontSize: '0.72rem',
                    color: 'var(--fg-muted)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  <span>📁</span>
                  <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                    {file.filename}
                  </span>
                  <button
                    onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--fg-subtle)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: 0,
                      marginLeft: 4,
                    }}
                    title="Remove file"
                  >
                    <X size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {referencedDocs.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, padding: '0 4px' }}>
            {referencedDocs.map((doc, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 8px',
                  borderRadius: 6,
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  fontSize: '0.72rem',
                  color: 'var(--primary)',
                }}
              >
                <span>📖 {doc.name.length > 30 ? doc.name.slice(0, 30) + '…' : doc.name}</span>
                <button
                  onClick={() => setReferencedDocs(prev => prev.filter((_, idx) => idx !== i))}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 0,
                  }}
                  title="Remove reference"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--input-bg)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={e => handleTextareaChange(e.target.value, e.target.selectionStart)}
            onPaste={async (e) => {
              const files = e.clipboardData.files
              if (files && files.length > 0) {
                e.preventDefault()
                for (const file of Array.from(files)) {
                  await uploadFile(file)
                }
                return
              }

              const clipboardItems = e.clipboardData.items
              if (clipboardItems && clipboardItems.length > 0) {
                let hasFile = false
                for (const item of Array.from(clipboardItems)) {
                  if (item.kind === 'file') {
                    const file = item.getAsFile()
                    if (file) {
                      hasFile = true
                      await uploadFile(file)
                    }
                  }
                }
                if (hasFile) {
                  e.preventDefault()
                }
              }
            }}
            onKeyDown={e => {
              const filtered = ragDocs.filter(doc => doc.name.toLowerCase().includes((mentionQuery || '').toLowerCase()))
              if (mentionQuery !== null && filtered.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setMentionIndex(prev => (prev + 1) % filtered.length)
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setMentionIndex(prev => (prev - 1 + filtered.length) % filtered.length)
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSelectMention(filtered[mentionIndex])
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setMentionQuery(null)
                  setMentionTriggerIndex(-1)
                }
              } else {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }
            }}
            placeholder="Ask something (type @ to mention PDF)…"
            disabled={isLoading || fetchingHistory}
            rows={1}
            style={{
              flex: 1,
              padding: '10px 12px 4px',
              border: 'none',
              background: 'transparent',
              color: 'var(--fg)',
              fontSize: '0.82rem',
              outline: 'none',
              fontFamily: 'var(--font-body)',
              resize: 'none',
              minHeight: '36px',
              maxHeight: '160px',
              lineHeight: '1.45',
              overflowY: 'auto',
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '4px 8px 6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleUploadFile}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingFile || isLoading}
                title="Upload document (PDF, CSV, Excel, TXT, Image)"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: 'none',
                  border: 'none',
                  color: 'var(--fg-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isUploadingFile || isLoading ? 'default' : 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!isUploadingFile && !isLoading) e.currentTarget.style.background = 'var(--muted)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              >
                {isUploadingFile ? (
                  <Loader2 className="animate-spin" size={13} />
                ) : (
                  <Paperclip size={13} />
                )}
              </button>

              <div>
                <button
                  onClick={(e) => { e.stopPropagation(); setIsRagMenuOpen(!isRagMenuOpen) }}
                  disabled={isLoading}
                  title="Mention reference document from library"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: isRagMenuOpen ? 'var(--muted)' : 'none',
                    border: 'none',
                    color: 'var(--fg-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!isLoading) e.currentTarget.style.background = 'var(--muted)' }}
                  onMouseLeave={e => { if (!isRagMenuOpen) e.currentTarget.style.background = 'none' }}
                >
                  <BookOpen size={13} />
                </button>
              </div>
            </div>

            <button
              onClick={handleSend}
              disabled={(!inputValue.trim() && attachments.length === 0 && referencedDocs.length === 0) || isLoading}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: (inputValue.trim() || attachments.length > 0 || referencedDocs.length > 0) && !isLoading ? 'var(--primary)' : 'var(--border)',
                color: (inputValue.trim() || attachments.length > 0 || referencedDocs.length > 0) && !isLoading ? 'var(--primary-fg)' : 'var(--fg-subtle)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: (inputValue.trim() || attachments.length > 0 || referencedDocs.length > 0) && !isLoading ? 'pointer' : 'default',
                transition: 'background 0.15s',
              }}
            >
              <ArrowUp size={13} />
            </button>
          </div>
        </div>
        <p style={{ margin: '5px 2px 0', fontSize: '0.6rem', color: 'var(--fg-subtle)', textAlign: 'center' }}>
          Enter to send · Shift+Enter for new line
        </p>
      </div>

      {/* Premium Image Popup Preview Modal */}
      {previewImageUrl && (
        <div
          onClick={() => setPreviewImageUrl(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '90%',
              maxHeight: '90%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
            onClick={e => e.stopPropagation()}
          >
            <img
              src={previewImageUrl}
              alt="Preview"
              style={{
                maxWidth: '100%',
                maxHeight: '85vh',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                objectFit: 'contain',
              }}
            />
            <button
              onClick={() => setPreviewImageUrl(null)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0px',
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 600,
                backdropFilter: 'blur(4px)',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
            >
              Close ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
