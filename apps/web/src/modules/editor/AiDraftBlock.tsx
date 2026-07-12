import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { useState, useRef, useEffect } from 'react'
import { Sparkles, Check, RefreshCw, Trash2, ArrowRight, Loader2, X, BookOpen, FileText } from 'lucide-react'
import { marked } from 'marked'
import { listDocuments } from '#/modules/shared/ragApi'

function AiDraftNodeView({ node, updateAttributes, getPos, editor }: any) {
  const { prompt, status, result, id } = node.attrs
  const [inputText, setInputText] = useState(prompt || '')
  const [refineText, setRefineText] = useState('')
  const [loading, setLoading] = useState(status === 'generating')
  const [streamedText, setStreamedText] = useState(result || '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const refineRef = useRef<HTMLInputElement>(null)

  // Auto-focus textarea when block is created
  useEffect(() => {
    if (status === 'idle' && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [status])

  // Handle auto-height for textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`
    }
  }, [inputText])

  const [ragDocs, setRagDocs] = useState<any[]>([])
  const [referencedDocs, setReferencedDocs] = useState<any[]>([])
  const [isRagMenuOpen, setIsRagMenuOpen] = useState(false)

  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState<number>(0)
  const [mentionTriggerIndex, setMentionTriggerIndex] = useState<number>(-1)

  useEffect(() => {
    listDocuments()
      .then(docs => setRagDocs(docs.filter(d => d.status === 'ready')))
      .catch(console.error)
  }, [])

  useEffect(() => {
    function handleOutsideClick() {
      setIsRagMenuOpen(false)
      setMentionQuery(null)
      setMentionTriggerIndex(-1)
    }
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [])

  const handleSelectMention = (doc: any) => {
    let newCursorPos = textareaRef.current?.selectionStart || 0
    if (mentionTriggerIndex !== -1) {
      const beforeMention = inputText.slice(0, mentionTriggerIndex)
      const afterCaret = inputText.slice(textareaRef.current?.selectionStart || 0)
      setInputText(beforeMention + afterCaret)
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
    setInputText(value)
    
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

  async function handleGenerate(customPrompt?: string) {
    const activePrompt = customPrompt || inputText
    const hasActivePrompt = activePrompt.trim().length > 0
    const hasReferences = referencedDocs.length > 0
    if (!hasActivePrompt && !hasReferences) return

    setLoading(true)
    updateAttributes({
      status: 'generating',
      prompt: activePrompt || 'Analyze documents',
      result: ''
    })
    setStreamedText('')

    let fullText = ''
    let streamError: string | null = null

    let messageToSend = activePrompt
    if (referencedDocs.length > 0) {
      const ragPrefix = referencedDocs.map(doc => 
        `[Referenced Document: "${doc.name}" (ID: "${doc.id}")]`
      ).join('\n')
      messageToSend = `${ragPrefix}\n\n${messageToSend}`
    }

    try {
      const response = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageToSend,
          session_id: editor.options.injectNonce || 'editor-ai-draft', // Fallback key
          note_title: 'Draft Generation',
          note_content: editor.getText(),
          agent: 'editor',
        })
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const reader = response.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let buffer = ''
      let pendingToolContent: string | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

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
              fullText += data.delta
              setStreamedText(fullText)
            } else if (
              data.type === 'tool-input-available' &&
              (data.toolName === 'write_notes' || data.toolName === 'update_note_direct')
            ) {
              const toolArgs = data.input || {}
              if (toolArgs.content) {
                pendingToolContent = toolArgs.content
              }
            }
          } catch (e) {}
        }
      }

      // Final compilation of Markdown to HTML
      let htmlContent = ''
      if (fullText) {
        htmlContent = await marked.parse(fullText, { breaks: true, gfm: true })
      } else if (pendingToolContent) {
        const isHtml = /^<[a-zA-Z]/.test(pendingToolContent.trimStart())
        htmlContent = isHtml
          ? pendingToolContent
          : await marked.parse(pendingToolContent, { breaks: true, gfm: true })
      }

      if (streamError && !htmlContent) {
        throw new Error(streamError)
      }

      updateAttributes({
        status: 'completed',
        result: htmlContent
      })
    } catch (err) {
      console.error(err)
      updateAttributes({
        status: 'completed',
        result: `<p style="color: var(--danger)">⚠️ Error generating draft: ${String(err)}</p>`
      })
    } finally {
      setLoading(false)
    }
  }

  function handleAccept() {
    const pos = getPos()
    if (typeof pos !== 'number') return

    editor.chain()
      .focus()
      .deleteRange({ from: pos, to: pos + 1 })
      .insertContentAt(pos, result || streamedText)
      .run()
  }

  function handleDiscard() {
    const pos = getPos()
    if (typeof pos !== 'number') return
    editor.commands.deleteRange({ from: pos, to: pos + 1 })
  }

  function handleRefine() {
    if (!refineText.trim()) return
    const newPrompt = `Berdasarkan teks draft yang sudah kamu tulis: "${streamedText || result}", tolong lakukan instruksi ini: "${refineText}"`
    setRefineText('')
    handleGenerate(newPrompt)
  }

  return (
    <NodeViewWrapper className="ai-draft-block my-6" style={{ pointerEvents: 'auto' }}>
      <div
        style={{
          border: '1.5px solid var(--primary)',
          borderRadius: '12px',
          background: 'var(--bg-app)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
          overflow: 'hidden',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          transition: 'all 0.2s ease',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)' }}>
            <Sparkles size={16} className={loading ? 'animate-pulse' : ''} />
            <span>AI Draft Assistant</span>
          </div>
          <button
            onClick={handleDiscard}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--fg-subtle)',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <X size={14} />
          </button>
        </div>

        {/* Input State (Idle) */}
        {status === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative' }}>
            {/* Mention Suggestions Popup */}
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
                        left: 0,
                        right: 0,
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
                    left: 0,
                    right: 0,
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

            {/* Referenced pills */}
            {referencedDocs.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 2, padding: '0 4px' }}>
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

            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={e => handleTextareaChange(e.target.value, e.target.selectionStart)}
              onKeyDown={e => {
                const query = mentionQuery || ''
                const filtered = ragDocs.filter(doc => doc.name.toLowerCase().includes(query.toLowerCase()))
                const isMenuVisible = mentionQuery !== null || isRagMenuOpen
                if (isMenuVisible && filtered.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setMentionIndex(prev => (prev + 1) % filtered.length)
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setMentionIndex(prev => (prev - 1 + filtered.length) % filtered.length)
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSelectMention(filtered[mentionIndex])
                    setIsRagMenuOpen(false)
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setMentionQuery(null)
                    setMentionTriggerIndex(-1)
                    setIsRagMenuOpen(false)
                  }
                } else {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleGenerate()
                  }
                }
              }}
              placeholder="What would you like me to write? (type @ to mention PDF from RAG library)..."
              style={{
                width: '100%',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '10px',
                color: 'var(--fg)',
                fontSize: '0.85rem',
                outline: 'none',
                resize: 'none',
                minHeight: '60px',
                fontFamily: 'inherit',
                lineHeight: '1.45',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setIsRagMenuOpen(!isRagMenuOpen) }}
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
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--muted)'}
                  onMouseLeave={e => { if (!isRagMenuOpen) e.currentTarget.style.background = 'none' }}
                >
                  <BookOpen size={14} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleDiscard}
                  style={{
                    padding: '5px 12px',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    color: 'var(--fg-muted)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleGenerate()}
                  disabled={(!inputText.trim() && referencedDocs.length === 0)}
                  style={{
                    padding: '5px 14px',
                    background: 'var(--primary)',
                    color: 'var(--primary-fg)',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: (inputText.trim() || referencedDocs.length > 0) ? 'pointer' : 'not-allowed',
                    opacity: (inputText.trim() || referencedDocs.length > 0) ? 1 : 0.6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  Generate <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Generating / Completed Output Area */}
        {status !== 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Render Output */}
            <div
              className="markdown-content"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '14px',
                fontSize: '0.875rem',
                lineHeight: '1.6',
                color: 'var(--fg)',
                maxHeight: '360px',
                overflowY: 'auto',
              }}
              dangerouslySetInnerHTML={{
                __html: status === 'generating'
                  ? `<p>${streamedText.replace(/\n/g, '<br />')} <span class="dot-blink" style="display:inline-block; width:6px; height:12px; background:var(--primary)"></span></p>`
                  : result
              }}
            />

            {/* Generating Footer */}
            {status === 'generating' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--fg-subtle)' }}>
                <Loader2 size={13} className="animate-spin" />
                <span>AI is writing your draft...</span>
              </div>
            )}

            {/* Completed Toolbar */}
            {status === 'completed' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                {/* Refinement input */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    ref={refineRef}
                    type="text"
                    value={refineText}
                    onChange={e => setRefineText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRefine()
                    }}
                    placeholder="Refine draft (e.g. 'Make it shorter', 'Translate to Indonesian')..."
                    style={{
                      flex: 1,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '0.75rem',
                      color: 'var(--fg)',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleRefine}
                    disabled={!refineText.trim()}
                    style={{
                      padding: '6px 12px',
                      background: refineText.trim() ? 'var(--primary)' : 'var(--muted)',
                      color: refineText.trim() ? 'var(--primary-fg)' : 'var(--fg-subtle)',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: refineText.trim() ? 'pointer' : 'default',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ArrowRight size={13} />
                  </button>
                </div>

                {/* Primary actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handleAccept}
                      style={{
                        padding: '6px 14px',
                        background: '#22c55e',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Check size={14} /> Accept Draft
                    </button>
                    <button
                      onClick={() => handleGenerate()}
                      style={{
                        padding: '6px 12px',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        color: 'var(--fg-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <RefreshCw size={13} /> Regenerate
                    </button>
                  </div>

                  <button
                    onClick={handleDiscard}
                    style={{
                      padding: '6px 12px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      color: '#ef4444',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <Trash2 size={13} /> Discard
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}

export const AiDraftBlock = Node.create({
  name: 'aiDraft',
  group: 'block',
  selectable: true,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      prompt: { default: '' },
      status: { default: 'idle' }, // 'idle' | 'generating' | 'completed'
      result: { default: '' },
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => ({ 'data-id': attributes.id })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="ai-draft"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'ai-draft' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(AiDraftNodeView)
  },
})
