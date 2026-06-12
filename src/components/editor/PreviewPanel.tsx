import { useMemo } from 'react'
import type { Editor } from '@tiptap/react'
import { docToSegments, DocContent } from './DocRenderer'

interface PreviewPanelProps {
  editor: Editor | null
  title: string
}

export function PreviewPanel({ editor, title }: PreviewPanelProps) {
  const segments = useMemo(() => {
    if (!editor) return []
    const doc = editor.getJSON()
    const titleHtml = title ? `<h1>${title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</h1>\n` : ''
    return docToSegments(doc, titleHtml)
  }, [editor?.storage, editor?.state.doc.content, title])

  return (
    <div style={{
      flex: 1, overflowY: 'auto',
      padding: '40px 40px',
      background: 'var(--bg)',
      borderLeft: '1px solid var(--border)',
    }}>
      <DocContent segments={segments} />
    </div>
  )
}
