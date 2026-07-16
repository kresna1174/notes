import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, Highlighter, Code, Sparkles, FileText, Globe, RefreshCw, AlignLeft, Languages, Briefcase, Smile, ArrowLeft } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { DOMSerializer } from '@tiptap/pm/model'

interface BubbleToolbarProps {
  editor: Editor | null
}

export function BubbleToolbar({ editor }: BubbleToolbarProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [mode, setMode] = useState<'text' | 'table' | null>(null)
  const [aiMenuOpen, setAiMenuOpen] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)

  const handleAiAction = (systemPrompt: string, actionType: 'replace' | 'insert_below' | 'append_to_end', useHtml: boolean = false) => {
    if (!editor) return
    const { from, to } = editor.state.selection
    
    let contentToSend = ''
    if (useHtml) {
      const fragment = editor.state.doc.slice(from, to).content
      const serializer = DOMSerializer.fromSchema(editor.schema)
      const dom = serializer.serializeFragment(fragment)
      const temp = document.createElement('div')
      temp.appendChild(dom)
      contentToSend = temp.innerHTML
    } else {
      contentToSend = editor.state.doc.textBetween(from, to, ' ')
    }

    if (!contentToSend.trim()) return

    window.dispatchEvent(new CustomEvent('trigger-ai-action', {
      detail: {
        prompt: `${systemPrompt}\n\nSelected/highlighted text/HTML:\n"""\n${contentToSend}\n"""`,
        action: actionType,
        from,
        to
      }
    }))
  }

  useEffect(() => {
    if (!editor) return

    function update() {
      const { from, to } = editor!.state.selection
      const isTable = editor!.isActive('table')
      const isNodeSelection = 'node' in editor!.state.selection
      const hasSelection = from !== to && !isNodeSelection

      if (!isTable && !hasSelection) {
        setPos(null)
        setMode(null)
        setAiMenuOpen(false)
        return
      }

      // get caret / selection rect
      const domSelection = window.getSelection()
      if (!domSelection || domSelection.rangeCount === 0) {
        setPos(null)
        setMode(null)
        setAiMenuOpen(false)
        return
      }

      const range = domSelection.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      if (!rect || rect.width === 0 && !isTable) {
        setPos(null)
        setMode(null)
        setAiMenuOpen(false)
        return
      }

      // For table: use editor DOM position
      if (isTable) {
        const editorEl = editor!.view.dom
        const tableEl = editorEl.querySelector('table')
        if (!tableEl) { setPos(null); setMode(null); setAiMenuOpen(false); return }
        const tableRect = tableEl.getBoundingClientRect()
        setPos({
          top: tableRect.top - 48,
          left: tableRect.left,
        })
        setMode('table')
        return
      }

      setPos({
        top: rect.top - 48,
        left: rect.left + rect.width / 2,
      })
      setMode('text')
    }

    editor.on('selectionUpdate', update)
    editor.on('transaction', update)

    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', update)
    }
  }, [editor])

  if (!pos || !mode || !editor) return null

  return (
    <div
      ref={toolbarRef}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        transform: mode === 'text' ? 'translateX(-50%)' : 'none',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: '#1a1a2e',
        borderRadius: 8,
        padding: '5px 8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        pointerEvents: 'auto',
      }}
      onMouseDown={e => e.preventDefault()}
    >
      {mode === 'text' && (
        <>
          {aiMenuOpen ? (
            <>
              <button
                onClick={() => setAiMenuOpen(false)}
                style={{
                  padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600,
                  borderRadius: 5, border: 'none', cursor: 'pointer',
                  background: 'transparent', color: '#ced4da', display: 'flex', alignItems: 'center', gap: 4
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#ffffff22')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <ArrowLeft size={13} />
              </button>
              <div style={{ width: 1, background: '#ffffff33', margin: '0 4px', height: 16 }} />
              <Btn 
                icon={<Sparkles size={13} style={{ color: 'var(--primary)' }} />} 
                active={false} 
                onClick={() => {
                  handleAiAction('Please fix grammar, fix typos, and improve the following text/HTML to be more professional. You MUST preserve all HTML tags (like <strong>, <em>, <u>, <span>, <mark>, etc.) at the correct word positions to maintain the formatting/style of the text.', 'replace', true, 'editor')
                  setAiMenuOpen(false)
                }}
                title="Improve Writing"
              />
              <Btn 
                icon={<RefreshCw size={13} style={{ color: 'var(--primary)' }} />} 
                active={false} 
                onClick={() => {
                  handleAiAction('Please rewrite the following text/HTML to make it more engaging, clear, and varied in phrasing. You MUST preserve all HTML tags (like <strong>, <em>, <u>, <span>, <mark>, etc.) at the correct word positions to maintain the formatting/style of the text.', 'replace', true, 'editor')
                  setAiMenuOpen(false)
                }}
                title="Rewrite / Rephrase"
              />
              <Btn 
                icon={<AlignLeft size={13} style={{ color: 'var(--primary)' }} />} 
                active={false} 
                onClick={() => {
                  handleAiAction('Please create a short summary in bullet points from the following text.', 'insert_below', false, 'summarizer')
                  setAiMenuOpen(false)
                }}
                title="Summarize"
              />
              <Btn 
                icon={<Globe size={13} style={{ color: 'var(--primary)' }} />} 
                active={false} 
                onClick={() => {
                  handleAiAction('Please translate the following text/HTML to English naturally. You MUST preserve all HTML tags (like <strong>, <em>, <u>, <span>, <mark>, etc.) at the correct word positions to maintain the formatting/style of the text.', 'replace', true, 'translator')
                  setAiMenuOpen(false)
                }}
                title="Translate to English"
              />
              <Btn 
                icon={<Languages size={13} style={{ color: 'var(--primary)' }} />} 
                active={false} 
                onClick={() => {
                  handleAiAction('Please translate the following text/HTML to Indonesian (Bahasa Indonesia) naturally. You MUST preserve all HTML tags (like <strong>, <em>, <u>, <span>, <mark>, etc.) at the correct word positions to maintain the formatting/style of the text.', 'replace', true, 'translator')
                  setAiMenuOpen(false)
                }}
                title="Translate to Indonesian"
              />
              <Btn 
                icon={<Briefcase size={13} style={{ color: 'var(--primary)' }} />} 
                active={false} 
                onClick={() => {
                  handleAiAction('Please rewrite the following text/HTML in a formal, professional tone. You MUST preserve all HTML tags (like <strong>, <em>, <u>, <span>, <mark>, etc.) at the correct word positions to maintain the formatting/style of the text.', 'replace', true, 'editor')
                  setAiMenuOpen(false)
                }}
                title="Change Tone to Formal"
              />
              <Btn 
                icon={<Smile size={13} style={{ color: 'var(--primary)' }} />} 
                active={false} 
                onClick={() => {
                  handleAiAction('Please rewrite the following text/HTML in a friendly, casual tone. You MUST preserve all HTML tags (like <strong>, <em>, <u>, <span>, <mark>, etc.) at the correct word positions to maintain the formatting/style of the text.', 'replace', true, 'editor')
                  setAiMenuOpen(false)
                }}
                title="Change Tone to Casual"
              />
            </>
          ) : (
            <>
              <Btn icon={<Bold size={13} />} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold" />
              <Btn icon={<Italic size={13} />} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic" />
              <Btn icon={<UnderlineIcon size={13} />} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline" />
              <Btn icon={<Strikethrough size={13} />} active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough" />
              <Btn icon={<Code size={13} />} active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Code" />
              <Btn icon={<Highlighter size={13} />} active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Highlight" />
              <div style={{ width: 1, background: '#ffffff33', margin: '0 4px', height: 16 }} />
              
              <Btn 
                icon={<Sparkles size={13} style={{ color: 'var(--primary)' }} />} 
                active={false} 
                onClick={() => setAiMenuOpen(true)}
                title="AI Assistant" 
              />
              
              <div style={{ width: 1, background: '#ffffff33', margin: '0 4px', height: 16 }} />
              {[1, 2, 3].map(level => (
                <Btn
                  key={level}
                  icon={<span style={{ fontSize: '0.7rem', fontWeight: 700 }}>H{level}</span>}
                  active={editor.isActive('heading', { level })}
                  onClick={() => editor.chain().focus().toggleHeading({ level: level as 1|2|3 }).run()}
                  title={`Heading ${level}`}
                />
              ))}
            </>
          )}
        </>
      )}

      {mode === 'table' && (
        <>
          <TxtBtn label="+ Col" onClick={() => editor.chain().focus().addColumnAfter().run()} />
          <TxtBtn label="+ Row" onClick={() => editor.chain().focus().addRowAfter().run()} />
          <TxtBtn label="- Col" onClick={() => editor.chain().focus().deleteColumn().run()} danger />
          <TxtBtn label="- Row" onClick={() => editor.chain().focus().deleteRow().run()} danger />
          <div style={{ width: 1, background: '#ffffff33', margin: '0 2px', height: 16 }} />
          <TxtBtn label="Delete table" onClick={() => editor.chain().focus().deleteTable().run()} danger />
        </>
      )}
    </div>
  )
}

function Btn({ icon, active, onClick, title }: { icon: ReactNode; active: boolean; onClick: () => void; title: string }) {
  return (
    <button
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      style={{
        width: 28, height: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 5, border: 'none', cursor: 'pointer',
        background: active ? '#3b5bdb' : 'transparent',
        color: active ? '#fff' : '#ced4da',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#ffffff22' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      {icon}
    </button>
  )
}

function TxtBtn({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onMouseDown={e => { e.preventDefault(); onClick() }}
      style={{
        padding: '3px 8px', fontSize: '0.75rem',
        borderRadius: 5, border: 'none', cursor: 'pointer',
        background: 'transparent',
        color: danger ? '#ff8787' : '#fff',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = danger ? '#ff000022' : '#ffffff22')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </button>
  )
}
