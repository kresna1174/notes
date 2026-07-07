import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import { ChevronRight } from 'lucide-react'

function ToggleNodeView({ node, updateAttributes }: any) {
  const { open, title } = node.attrs

  return (
    <NodeViewWrapper className="toggle-block-wrapper my-2">
      <div style={{ display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-body)' }}>
        {/* Toggle Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0' }}>
          <button
            onClick={() => updateAttributes({ open: !open })}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              borderRadius: '4px',
              color: 'var(--fg-muted)',
              transform: open ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.2s, background-color 0.2s',
              padding: 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <ChevronRight size={16} />
          </button>
          
          <input
            type="text"
            value={title}
            onChange={e => updateAttributes({ title: e.target.value })}
            placeholder="Toggle"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: '0.95rem',
              fontWeight: 500,
              color: 'var(--fg)',
              padding: '2px 0',
            }}
          />
        </div>

        {/* Collapsible Content */}
        {open && (
          <div
            style={{
              paddingLeft: '28px',
              borderLeft: '2px solid var(--border)',
              marginLeft: '11px',
              marginTop: '4px',
            }}
          >
            <NodeViewContent style={{ outline: 'none', minHeight: '1rem' }} />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}

export const ToggleBlock = Node.create({
  name: 'toggleBlock',
  group: 'block',
  content: 'block*', // Can contain any block nodes (paragraphs, lists, headings)
  defining: true,
  addAttributes() {
    return {
      open: { default: true },
      title: { default: '' },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="toggle-block"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'toggle-block' }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(ToggleNodeView)
  },
})
