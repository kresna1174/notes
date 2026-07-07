import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { useEffect, useState } from 'react'

function TableOfContentsNodeView({ editor }: any) {
  const [headings, setHeadings] = useState<any[]>([])

  useEffect(() => {
    if (!editor) return

    const updateHeadings = () => {
      const list: any[] = []
      editor.state.doc.descendants((node: any, pos: number) => {
        if (node.type.name === 'heading') {
          list.push({
            id: `heading-${pos}`,
            text: node.textContent,
            level: node.attrs.level,
            pos,
          })
        }
      })
      setHeadings(list)
    }

    // Initial load
    updateHeadings()

    // Listen to updates
    editor.on('update', updateHeadings)
    return () => {
      editor.off('update', updateHeadings)
    }
  }, [editor])

  if (headings.length === 0) {
    return (
      <NodeViewWrapper>
        <div
          style={{
            padding: '16px',
            border: '1px dashed var(--border)',
            borderRadius: '8px',
            color: 'var(--fg-muted)',
            fontSize: '0.85rem',
            fontStyle: 'italic',
            textAlign: 'center',
            background: 'var(--bg-app)',
          }}
        >
          Daftar Isi (Buat heading H1, H2, atau H3 terlebih dahulu)
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper className="toc-block-wrapper my-4">
      <div
        style={{
          padding: '16px',
          background: 'var(--bg-app)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          fontFamily: 'var(--font-body)',
        }}
      >
        <h4
          style={{
            margin: '0 0 12px 0',
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--fg-muted)',
          }}
        >
          Daftar Isi
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {headings.map(h => (
            <button
              key={h.id}
              onClick={() => {
                editor.commands.focus(h.pos)
                const element = editor.view.nodeDOM(h.pos) as HTMLElement
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
              }}
              style={{
                background: 'transparent',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: 'var(--primary)',
                padding: '4px 6px',
                borderRadius: '4px',
                paddingLeft: `${(h.level - 1) * 16 + 6}px`,
                transition: 'background-color 0.15s, color 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = 'var(--accent)'
                e.currentTarget.style.color = 'var(--accent-fg)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = 'var(--primary)'
              }}
            >
              {h.text || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Heading Kosong</span>}
            </button>
          ))}
        </div>
      </div>
    </NodeViewWrapper>
  )
}

export const TableOfContentsBlock = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  parseHTML() {
    return [{ tag: 'div[data-type="toc"]' }]
  },
  renderHTML() {
    return ['div', { 'data-type': 'toc' }]
  },
  addNodeView() {
    return ReactNodeViewRenderer(TableOfContentsNodeView)
  },
})
