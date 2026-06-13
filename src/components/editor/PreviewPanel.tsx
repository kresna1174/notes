import { useMemo } from 'react'
import type { Editor } from '@tiptap/react'
import { docToSegments, DocContent } from './DocRenderer'
import { Pencil } from 'lucide-react'

interface PreviewPanelProps {
  editor: Editor | null
  title: string
  isMobile?: boolean
  onCloseMobile?: () => void
}

export function PreviewPanel({ editor, title, isMobile, onCloseMobile }: PreviewPanelProps) {
  const segments = useMemo(() => {
    if (!editor) return []
    const doc = editor.getJSON()
    const titleHtml = title ? `<h1>${title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</h1>\n` : ''
    return docToSegments(doc, titleHtml)
  }, [editor?.storage, editor?.state.doc.content, title])

  return (
    <div style={{
      flex: 1, overflowY: 'auto',
      padding: isMobile ? '64px 16px 20px' : '40px 40px',
      background: 'var(--bg)',
      borderLeft: isMobile ? 'none' : '1px solid var(--border)',
      position: 'relative',
    }}>
      {isMobile && onCloseMobile && (
        <button
          onClick={onCloseMobile}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            fontSize: '0.75rem',
            fontWeight: 600,
            fontFamily: 'var(--font-body)',
            border: '1px solid var(--primary)',
            borderRadius: 20,
            background: 'var(--accent)',
            color: 'var(--primary)',
            cursor: 'pointer',
            zIndex: 10,
          }}
        >
          <Pencil size={13} />
          Edit
        </button>
      )}
      <DocContent segments={segments} />
    </div>
  )
}
