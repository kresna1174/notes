import { useState, useEffect, useRef } from 'react'
import { Send, Loader2, Trash2, ArrowRight } from 'lucide-react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'

interface ChatBotProps {
  noteId: string
  noteContent: string
  noteTitle: string
  onClose: () => void
}

function ReasoningPanel({ typeLabel, content, isGenerating }: { typeLabel: string; content: string; isGenerating: boolean }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div
      style={{
        margin: '6px 0 10px 4px',
        padding: '8px 12px',
        fontSize: '0.8rem',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--input-bg)',
        color: 'var(--fg-muted)',
        fontFamily: 'var(--font-body)'
      }}
    >
      {/* Header */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
          color: 'var(--primary)',
          fontWeight: 600,
          gap: 8
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>🧠 Reasoning: {typeLabel}</span>
          {isGenerating ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Loader2 className="animate-spin" size={12} color="var(--primary)" />
              <span style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)', fontWeight: 400 }}>
                (sedang berpikir...)
              </span>
            </div>
          ) : (
            <span style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)', fontWeight: 400 }}>
              (selesai)
            </span>
          )}
        </div>
        <span style={{ fontSize: '0.7rem', color: 'var(--fg-subtle)' }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </div>

      {/* Content */}
      {isOpen && (
        <div
          style={{
            marginTop: '8px',
            color: 'var(--fg-muted)',
            lineHeight: '1.4',
            whiteSpace: 'pre-wrap',
            background: 'var(--bg)',
            padding: '8px 10px',
            borderRadius: '6px',
            fontSize: '0.78rem',
            maxHeight: '200px',
            overflowY: 'auto'
          }}
        >
          {content || 'Memulai proses berpikir...'}
        </div>
      )}
    </div>
  )
}

function ToolCallPanel({ item, noteId, lastUserPrompt }: { item: any; noteId: string; lastUserPrompt?: string }) {
  const [isOpen, setIsOpen] = useState(item.toolName === 'write_notes')
  const isAnyCallActive = item.calls.some((c: any) => c.state === 'call')
  const [isAuto, setIsAuto] = useState(false)

  const shouldAutoApprove = (prompt: string): boolean => {
    const p = prompt.toLowerCase();
    const keywords = [
      'ringkas', 'summarize', 'summary',
      'tambah', 'add', 'insert',
      'buat', 'create', 'make',
      'update', 'perbarui', 'simpan', 'save',
      'ubah', 'ganti', 'edit', 'replace', 'write', 'tulis',
      'tag', 'label',
      'generate', 'hasilkan',
      'rapikan', 'format',
      'terjemahkan', 'translate',
      'koreksi', 'perbaiki', 'fix',
      'panggil', 'call', 'run', 'jalankan', 'execute',
      'apply', 'terapkan', 'ok', 'setuju', 'yes', 'boleh',
      'catatan', 'notes'
    ];
    return keywords.some(kw => p.includes(kw));
  }

  const storageKey = `note_approve_state_${noteId}_${JSON.stringify(item.calls[0]?.args || {})}`

  const [approvalState, setApprovalState] = useState<'pending' | 'approved' | 'rejected'>(() => {
    const firstCall = item.calls[0];
    if (firstCall && firstCall.result) {
      try {
        const resObj = typeof firstCall.result === 'string'
          ? JSON.parse(firstCall.result)
          : firstCall.result;
        if (resObj && (resObj.status === 'approved' || resObj.status === 'rejected')) {
          return resObj.status;
        }
        if (resObj && resObj.status === 'pending_approval') {
          return 'pending';
        }
      } catch (e) {
        // Not a JSON result
      }
    }
    const saved = localStorage.getItem(storageKey)
    if (saved === 'approved' || saved === 'rejected') {
      return saved
    }
    return 'pending'
  })

  const handleApprove = async (args: any, isAutoCall = false) => {
    setApprovalState('approved')
    if (isAutoCall) {
      setIsAuto(true)
    }
    localStorage.setItem(storageKey, 'approved')

    const callId = item.calls[0]?.toolCallId || item.calls[0]?.id || item.toolCallId;
    if (callId) {
      try {
        await fetch('/api/ai/chat/approve_or_reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: noteId,
            call_id: callId,
            status: 'approved'
          })
        });
      } catch (err) {
        console.error('Failed to save approval status to database:', err);
      }
    }

    window.dispatchEvent(
      new CustomEvent('note-updated-by-ai', {
        detail: {
          title: args.title,
          content: args.content
        }
      })
    )
  }

  const handleReject = async () => {
    setApprovalState('rejected')
    localStorage.setItem(storageKey, 'rejected')

    const callId = item.calls[0]?.toolCallId || item.calls[0]?.id || item.toolCallId;
    if (callId) {
      try {
        await fetch('/api/ai/chat/approve_or_reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: noteId,
            call_id: callId,
            status: 'rejected'
          })
        });
      } catch (err) {
        console.error('Failed to save rejection status to database:', err);
      }
    }
  }

  useEffect(() => {
    if (item.toolName === 'write_notes' && approvalState === 'pending' && lastUserPrompt) {
      if (shouldAutoApprove(lastUserPrompt)) {
        const call = item.calls[0];
        if (call && call.args) {
          handleApprove(call.args, true);
        }
      }
    }
  }, [approvalState, item, lastUserPrompt]);

  return (
    <div
      style={{
        margin: '6px 0 10px 4px',
        padding: '8px 12px',
        fontSize: '0.8rem',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--input-bg)',
        color: 'var(--fg-muted)',
        fontFamily: 'var(--font-body)'
      }}
    >
      {/* Header */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
          fontWeight: 600,
          color: 'var(--primary)',
          gap: 8
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>🛠️ Tool: {item.toolName}</span>
          <span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--fg-subtle)' }}>
            ({isAnyCallActive ? 'memanggil...' : 'selesai'})
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isAnyCallActive && <Loader2 className="animate-spin" size={12} color="var(--primary)" />}
          <span style={{ fontSize: '0.7rem', color: 'var(--fg-subtle)' }}>
            {isOpen ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* Content */}
      {isOpen && (
        <div style={{ marginTop: 8 }}>
          {item.calls.map((call: any, callIdx: number) => (
            <div key={callIdx} style={{ marginTop: callIdx > 0 ? 8 : 0, borderTop: callIdx > 0 ? '1px dashed var(--border)' : 'none', paddingTop: callIdx > 0 ? 8 : 0 }}>
              {call.args && (
                <details open style={{ fontSize: '0.72rem', marginBottom: call.result ? 6 : 0 }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--fg-subtle)' }}>
                    Parameter Input {item.calls.length > 1 ? `#${callIdx + 1}` : ''}
                  </summary>
                  <pre style={{ margin: '4px 0 0', padding: 6, background: 'var(--bg)', borderRadius: 4, overflowX: 'auto', fontFamily: 'monospace' }}>
                    {JSON.stringify(call.args, null, 2)}
                  </pre>
                </details>
              )}

              {call.result && (
                <div style={{ borderTop: call.args ? '1px dashed var(--border)' : 'none', paddingTop: call.args ? 6 : 0, marginTop: call.args ? 6 : 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.75rem', marginBottom: 4 }}>
                    Hasil Output {item.calls.length > 1 ? `#${callIdx + 1}` : ''}:
                  </div>
                  {item.toolName === 'write_notes' ? (
                    <div style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)', fontStyle: 'italic' }}>
                      Tindakan penulisan catatan diusulkan oleh AI. Silakan berikan persetujuan Anda di bawah.
                    </div>
                  ) : (
                    <pre style={{ margin: 0, padding: 6, background: 'var(--bg)', borderRadius: 4, overflowX: 'auto', fontFamily: 'monospace', fontSize: '0.72rem', whiteSpace: 'pre-wrap' }}>
                      {typeof call.result === 'string' ? call.result : JSON.stringify(call.result, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              {/* Action Buttons for write_notes */}
              {item.toolName === 'write_notes' && !isAnyCallActive && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                  {approvalState === 'pending' ? (
                    <>
                      <button
                        onClick={() => handleApprove(call.args)}
                        style={{
                          padding: '6px 14px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          borderRadius: 20,
                          background: 'var(--primary)',
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'opacity 0.15s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '0.9' }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                      >
                        Setujui (Approve)
                      </button>
                      <button
                        onClick={handleReject}
                        style={{
                          padding: '6px 14px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          borderRadius: 20,
                          background: 'transparent',
                          color: 'var(--fg-muted)',
                          border: '1px solid var(--border)',
                          cursor: 'pointer',
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--muted)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        Tolak (Reject)
                      </button>
                    </>
                  ) : approvalState === 'approved' ? (
                    <span style={{ fontSize: '0.75rem', color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      ✓ Catatan diperbarui {isAuto ? 'otomatis' : 'di layar'} & disimpan ke database.
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>
                      ✗ Tindakan ditolak oleh pengguna.
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ChatBot({ noteId, noteContent, noteTitle, onClose }: ChatBotProps) {
  const [fetchingHistory, setFetchingHistory] = useState(true)
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Keep track of the latest note details in a ref to avoid stale closures in the transport
  const noteStateRef = useRef({ noteId, noteTitle, noteContent })
  noteStateRef.current = { noteId, noteTitle, noteContent }

  const {
    messages,
    setMessages,
    sendMessage,
    status
  } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/ai/chat/stream',
      body: () => ({
        session_id: noteStateRef.current.noteId,
        note_title: noteStateRef.current.noteTitle,
        note_content: noteStateRef.current.noteContent
      })
    })
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  // Load chat history on mount/noteId change
  useEffect(() => {
    setFetchingHistory(true)
    fetch(`/api/ai/chat/history/${noteId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load history')
        return res.json()
      })
      .then((data) => {
        if (data.messages && data.messages.length > 0) {
          const mergedMessages: any[] = [];
          for (const m of data.messages) {
            let partObj: any;
            if (m.role === 'assistant') {
              if (m.type === 'completed') {
                partObj = { type: 'text', text: m.content };
              } else if (m.type === 'tool') {
                partObj = {
                  type: 'tool' as const,
                  toolCallId: m.toolCallId,
                  toolName: m.toolName,
                  args: m.args,
                  result: m.result,
                  state: m.result ? ('result' as const) : ('call' as const)
                };
              } else {
                // Non-completed (reasoning, text biasa) → panel reasoning
                partObj = { type: 'reasoning', text: m.content };
              }

              const lastMsg = mergedMessages[mergedMessages.length - 1];
              if (lastMsg && lastMsg.role === 'assistant') {
                lastMsg.parts.push(partObj);
              } else {
                mergedMessages.push({
                  id: `msg_${mergedMessages.length}`,
                  role: 'assistant',
                  parts: [partObj]
                });
              }
            } else {
              mergedMessages.push({
                id: `msg_${mergedMessages.length}`,
                role: m.role,
                parts: [{ type: 'text', text: m.content }]
              });
            }
          }
          setMessages(mergedMessages);
        } else {
          setMessages([
            {
              id: 'welcome',
              role: 'assistant',
              parts: [{
                type: 'text',
                text: `Halo! Saya adalah AI Asisten untuk catatan **"${noteTitle || 'Tanpa Judul'}"**. Apa yang bisa saya bantu hari ini? Anda bisa meminta saya meringkas, membuat tag, atau mendelegasikan tugas ke sub-agent keahlian lainnya.`
              }]
            }
          ])
        }
      })
      .catch((err) => {
        console.error('Error loading history:', err)
        setMessages([
          {
            id: 'welcome_error',
            role: 'assistant',
            parts: [{
              type: 'text',
              text: 'Gagal memuat riwayat obrolan. Mari mulai sesi obrolan baru!'
            }]
          }
        ])
      })
      .finally(() => {
        setFetchingHistory(false)
      })
  }, [noteId, noteTitle, setMessages])

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleClearHistory = async () => {
    if (window.confirm('Hapus seluruh riwayat chat untuk catatan ini?')) {
      setMessages([
        {
          id: 'welcome_cleared',
          role: 'assistant',
          parts: [{
            type: 'text',
            text: 'Riwayat obrolan dibersihkan. Apa yang ingin Anda tanyakan?'
          }]
        }
      ])
    }
  }

  const quickPrompts = [
    { label: 'Ringkas Catatan', text: 'Tolong panggil summarize_expert untuk meringkas seluruh isi catatan ini.' },
    { label: 'Buat Tag', text: 'Tolong panggil tagger_expert untuk merekomendasikan tag berdasarkan isi catatan ini.' },
    { label: 'Cari Ide Baru', text: 'Berikan 3 ide tambahan yang bisa ditambahkan ke catatan ini.' }
  ]



  const showLoadingIndicator = isLoading && (
    messages.length === 0 || 
    messages[messages.length - 1].role === 'user' ||
    (messages[messages.length - 1].role === 'assistant' && 
     (!messages[messages.length - 1].parts || messages[messages.length - 1].parts.length === 0))
  )

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = () => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }

  useEffect(() => {
    adjustHeight()
  }, [inputValue])

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return
    sendMessage({ text: inputValue })
    setInputValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    handleSend()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      style={{
        width: '380px',
        borderLeft: '1px solid var(--border)',
        background: 'var(--bg-app)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        flexShrink: 0,
        boxShadow: '-4px 0 16px rgba(0,0,0,0.02)',
        fontFamily: 'var(--font-body)'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: '0.95rem', fontFamily: 'var(--font-heading)', color: 'var(--fg)' }}>
            AI Assistant
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handleClearHistory}
            title="Bersihkan Chat"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--fg-muted)',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--muted)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            <Trash2 size={15} />
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '4px 10px',
              fontSize: '0.75rem',
              fontWeight: 500,
              border: '1px solid var(--border)',
              borderRadius: '6px',
              background: 'var(--bg)',
              color: 'var(--fg-muted)',
              cursor: 'pointer'
            }}
          >
            Tutup
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}
      >
        {fetchingHistory ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Loader2 className="animate-spin" size={20} color="var(--primary)" />
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                alignItems: 'flex-start',
                gap: 10
              }}
            >
              <div
                style={{
                  maxWidth: '82%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  width: msg.role === 'assistant' ? '100%' : 'auto'
                }}
              >

                {(() => {
                  const insideBubbleParts = msg.parts
                    ? msg.parts.filter((p: any) => ['text', 'file', 'data'].includes(p.type))
                    : [];
                  
                  const isMessageLoading = isLoading && index === messages.length - 1;

                  if (msg.role === 'user') {
                    const textContent = insideBubbleParts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('');
                    return (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: '12px',
                          borderTopRightRadius: '2px',
                          background: 'var(--primary)',
                          color: 'var(--primary-fg)',
                          fontSize: '0.85rem',
                          lineHeight: '1.45',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                          whiteSpace: 'pre-wrap'
                        }}
                      >
                        {textContent}
                      </div>
                    );
                  }

                  // Assistant role — cek apakah ada text content atau belum
                  const hasTextParts = insideBubbleParts.some((p: any) => p.type === 'text');
                  const hasReasoningParts = msg.parts?.some((p: any) => p.type === 'reasoning');

                  // Jika sedang loading DAN belum ada text completed → tampilkan thinking bubble
                  if (!hasTextParts && isMessageLoading) {
                    return (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: '12px',
                          borderTopLeftRadius: '2px',
                          background: 'var(--bg)',
                          color: 'var(--fg-muted)',
                          fontSize: '0.82rem',
                          lineHeight: '1.45',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                          border: '1px solid var(--border)',
                          width: 'fit-content',
                          fontStyle: 'italic',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        {hasReasoningParts ? (
                          // Sudah ada reasoning → tampilkan teks singkat
                          <span className="thinking-text">Merumuskan jawaban</span>
                        ) : (
                          // Belum ada apa-apa → animasi tiga titik
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 0' }}>
                            <span className="dot-blink" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--fg-muted)', display: 'inline-block' }} />
                            <span className="dot-blink" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--fg-muted)', animationDelay: '0.2s', display: 'inline-block' }} />
                            <span className="dot-blink" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--fg-muted)', animationDelay: '0.4s', display: 'inline-block' }} />
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Tidak loading dan tidak ada text → render nothing
                  if (!hasTextParts) {
                    return null;
                  }

                  // Render all parts inside the bubble
                  const textParts = insideBubbleParts.filter((p: any) => p.type === 'text');
                  const otherParts = insideBubbleParts.filter((p: any) => p.type !== 'text');
                  const textContent = textParts.map((p: any) => p.text || '').join('');

                  return (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '12px',
                        borderTopLeftRadius: '2px',
                        background: 'var(--bg)',
                        color: 'var(--fg)',
                        fontSize: '0.85rem',
                        lineHeight: '1.45',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                        border: '1px solid var(--border)',
                        whiteSpace: 'pre-wrap',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8
                      }}
                    >
                      {textContent && <div>{textContent}</div>}
                      {otherParts.map((part: any, partIdx: number) => {
                        if (part.type === 'file') {
                          const isImage = part.contentType?.startsWith('image/') || part.url?.match(/\.(jpg|jpeg|png|gif|webp)/i);
                          if (isImage) {
                            return (
                              <img
                                key={partIdx}
                                src={part.url}
                                alt={part.name || 'Attachment'}
                                style={{ maxWidth: '100%', borderRadius: 8, marginTop: 4 }}
                              />
                            );
                          }
                          return (
                            <div
                              key={partIdx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '8px 12px',
                                background: 'var(--muted)',
                                borderRadius: 8,
                                marginTop: 4
                              }}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{part.name || 'File'}</span>
                                <a
                                  href={part.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ fontSize: '0.7rem', color: 'var(--primary)', textDecoration: 'underline' }}
                                >
                                  Download / Lihat
                                </a>
                              </div>
                            </div>
                          );
                        }
                        if (part.type === 'data') {
                          return (
                            <div
                              key={partIdx}
                              style={{
                                marginTop: 4,
                                padding: 8,
                                background: 'var(--input-bg)',
                                borderRadius: 6,
                                fontSize: '0.75rem',
                                fontFamily: 'monospace'
                              }}
                            >
                              <details>
                                <summary style={{ cursor: 'pointer', color: 'var(--primary)', fontWeight: 600 }}>
                                  Data Payload
                                </summary>
                                <pre style={{ margin: '4px 0 0', overflowX: 'auto' }}>
                                  {JSON.stringify(part.data, null, 2)}
                                </pre>
                              </details>
                            </div>
                          );
                        }
                        return null;
                      })}
                    </div>
                  );
                })()}

                {/* Tampilkan log detail pendukung di luar bubble chat */}
                {(() => {
                  if (!msg.parts) return null;

                  const nonReasoningParts = msg.parts.filter((p: any) => p.type !== 'reasoning') as any[];
                  if (nonReasoningParts.length === 0) return null;

                  const groupedItems: any[] = [];
                  let lastItem: any = null;

                  for (const part of nonReasoningParts) {
                    if (
                      part.type === 'tool' ||
                      part.type === 'dynamic-tool' ||
                      (typeof part.type === 'string' && part.type.startsWith('tool-'))
                    ) {
                      const partToolName =
                        part.toolName ||
                        (typeof part.type === 'string' && part.type.startsWith('tool-')
                          ? part.type.replace('tool-', '')
                          : 'unknown_tool');
                      const partArgs = part.args !== undefined ? part.args : (part as any).input;
                      const partResult = part.result !== undefined ? part.result : (part as any).output;
                      const partState = part.state || (partResult !== undefined ? 'result' : 'call');

                      const partToolCallId = part.toolCallId || part.id || part.callId || (part.toolCall && part.toolCall.id) || (part as any).call_id;
                      if (
                        lastItem &&
                        lastItem.type === 'grouped-tool' &&
                        lastItem.toolName === partToolName
                      ) {
                        lastItem.calls.push({
                          toolCallId: partToolCallId,
                          args: partArgs,
                          result: partResult,
                          state: partState
                        });
                      } else {
                        lastItem = {
                          type: 'grouped-tool',
                          toolName: partToolName,
                          calls: [
                            {
                              toolCallId: partToolCallId,
                              args: partArgs,
                              result: partResult,
                              state: partState
                            }
                          ]
                        };
                        groupedItems.push(lastItem);
                      }
                    } else if (part.type === 'source-url') {
                      if (lastItem && lastItem.type === 'grouped-source-url') {
                        lastItem.urls.push({
                          url: part.url,
                          title: part.title
                        });
                      } else {
                        lastItem = {
                          type: 'grouped-source-url',
                          urls: [{
                            url: part.url,
                            title: part.title
                          }]
                        };
                        groupedItems.push(lastItem);
                      }
                    } else if (part.type === 'source-document') {
                      if (lastItem && lastItem.type === 'grouped-source-document') {
                        lastItem.docs.push({
                          title: part.title,
                          text: part.text
                        });
                      } else {
                        lastItem = {
                          type: 'grouped-source-document',
                          docs: [{
                            title: part.title,
                            text: part.text
                          }]
                        };
                        groupedItems.push(lastItem);
                      }
                    } else {
                      lastItem = { ...part };
                      groupedItems.push(lastItem);
                    }
                  }

                  return groupedItems.map((item: any, itemIdx: number) => {
                    if (item.type === 'grouped-tool') {
                      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
                      const lastUserText = lastUserMsg?.parts?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('') || '';
                      return <ToolCallPanel key={itemIdx} item={item} noteId={noteId} lastUserPrompt={lastUserText} />;
                    }

                    if (item.type === 'grouped-source-url') {
                      return (
                        <div key={itemIdx} style={{ margin: '4px 0 8px 4px', display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.78rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--fg-muted)' }}>🔗 Referensi:</span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 12 }}>
                            {item.urls.map((u: any, uIdx: number) => (
                              <a key={uIdx} href={u.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline', fontWeight: 500 }}>
                                {u.title || u.url}
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    if (item.type === 'grouped-source-document') {
                      return (
                        <div key={itemIdx} style={{ margin: '6px 0 10px 4px', padding: '6px 10px', fontSize: '0.78rem', background: 'var(--muted)', borderRadius: 6, borderLeft: '3px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ fontWeight: 600, color: 'var(--primary)' }}>📄 Kutipan Dokumen:</div>
                          {item.docs.map((doc: any, dIdx: number) => (
                            <div key={dIdx} style={{ fontSize: '0.72rem', color: 'var(--fg-muted)', fontStyle: 'italic', borderTop: dIdx > 0 ? '1px dashed var(--border)' : 'none', paddingTop: dIdx > 0 ? 4 : 0 }}>
                              <strong>{doc.title || 'Dokumen'}:</strong> "{doc.text}"
                            </div>
                          ))}
                        </div>
                      );
                    }

                    if (item.type === 'step-start') {
                      return null;
                    }

                    return null;
                  });
                })()}

                {/* Tampilkan SATU KESATUAN reasoning log di bagian paling bawah */}
                {(() => {
                  const reasoningParts = msg.parts
                    ? msg.parts.filter((p: any) => p.type === 'reasoning')
                    : [];
                  
                  if (reasoningParts.length === 0) return null;

                  // Deteksi apakah reasoning masih aktif: pesan masih loading dan ada reasoning parts
                  const isReasoningGenerating = isLoading && index === messages.length - 1 && reasoningParts.length > 0;

                  // Gabungkan semua konten log reasoning menjadi satu, hilangkan prefiks [Subagent: ...]
                  const unifiedContent = reasoningParts
                    .map((p: any) => (p.text || '').replace(/^\[Subagent:[^\]]+\]\n/, '').trim())
                    .filter((t: string) => t !== '')
                    .join('\n\n');

                  return (
                    <ReasoningPanel
                      typeLabel="reasoning"
                      content={unifiedContent}
                      isGenerating={isReasoningGenerating}
                    />
                  );
                })()}
              </div>
            </div>
          ))
        )}
        {showLoadingIndicator && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingLeft: 2 }}>
            <Loader2 className="animate-spin" size={14} color="var(--fg-muted)" />
            <span style={{ fontSize: '0.75rem', color: 'var(--fg-muted)', fontWeight: 500 }}>
              AI sedang berpikir...
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts — hanya tampil jika belum ada sesi chat (belum ada pesan dari user) */}
      {!messages.some((m: any) => m.role === 'user') && !isLoading && (
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Saran Pertanyaan
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {quickPrompts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => sendMessage({ text: p.text })}
                style={{
                  textAlign: 'left',
                  padding: '8px 12px',
                  fontSize: '0.75rem',
                  borderRadius: '8px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--fg)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary)'
                  e.currentTarget.style.background = 'var(--accent)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.background = 'var(--bg)'
                }}
              >
                <span>{p.label}</span>
                <ArrowRight size={12} color="var(--primary)" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Form */}
      <form
        onSubmit={onSubmit}
        style={{
          padding: '16px 20px 20px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg)',
          display: 'flex',
          gap: 10,
          alignItems: 'flex-end'
        }}
      >
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tanyakan sesuatu tentang catatan ini..."
          disabled={isLoading || fetchingHistory}
          rows={1}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '16px',
            border: '1px solid var(--border)',
            background: 'var(--input-bg)',
            color: 'var(--fg)',
            fontSize: '0.825rem',
            outline: 'none',
            fontFamily: 'var(--font-body)',
            resize: 'none',
            minHeight: '38px',
            maxHeight: '200px',
            lineHeight: '1.4',
            overflowY: 'auto'
          }}
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || isLoading}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: inputValue.trim() && !isLoading ? 'var(--primary)' : 'var(--muted)',
            color: inputValue.trim() && !isLoading ? 'var(--primary-fg)' : 'var(--fg-subtle)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: inputValue.trim() && !isLoading ? 'pointer' : 'default',
            transition: 'background 0.2s',
            marginBottom: '1px'
          }}
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  )
}
