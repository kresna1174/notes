import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import { useState, useRef, useEffect } from 'react'

const COLOR_PRESETS = [
  { name: 'Default', bg: 'var(--accent)', border: 'var(--border)' },
  { name: 'Success', bg: 'rgba(47, 158, 68, 0.08)', border: 'rgba(47, 158, 68, 0.3)' },
  { name: 'Warning', bg: 'rgba(247, 103, 7, 0.08)', border: 'rgba(247, 103, 7, 0.3)' },
  { name: 'Danger', bg: 'rgba(224, 49, 49, 0.08)', border: 'rgba(224, 49, 49, 0.3)' },
]

const EMOJIS = ['💡', 'ℹ️', '⚠️', '🚨', '✅', '❌', '📌', '🚀', '⭐', '🎨', '📝', '🎯', '💭', '🔥']

function CalloutNodeView({ node, updateAttributes }: any) {
  const { icon, bg, border } = node.attrs
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <NodeViewWrapper className="callout-block-wrapper my-4">
      <div
        style={{
          display: 'flex',
          gap: '12px',
          padding: '16px',
          borderRadius: '8px',
          background: bg || 'var(--accent)',
          border: `1px solid ${border || 'var(--border)'}`,
          alignItems: 'flex-start',
          position: 'relative',
        }}
      >
        {/* Emoji Selector / Picker Button */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setPickerOpen(!pickerOpen)}
            style={{
              fontSize: '1.25rem',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              userSelect: 'none',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {icon || '💡'}
          </button>

          {pickerOpen && (
            <div
              ref={pickerRef}
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                zIndex: 9999,
                background: 'var(--card-bg)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '10px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
                width: '180px',
                marginTop: '4px',
              }}
            >
              {/* Emojis Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', marginBottom: '8px' }}>
                {EMOJIS.map(e => (
                  <button
                    key={e}
                    onClick={() => {
                      updateAttributes({ icon: e })
                      setPickerOpen(false)
                    }}
                    style={{
                      fontSize: '1.1rem',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '4px',
                      textAlign: 'center',
                    }}
                    onMouseEnter={el => (el.currentTarget.style.backgroundColor = 'var(--accent)')}
                    onMouseLeave={el => (el.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {e}
                  </button>
                ))}
              </div>

              {/* Separator */}
              <div style={{ height: '1px', background: 'var(--border)', margin: '6px 0' }} />

              {/* Color Presets */}
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'space-between', padding: '2px 0' }}>
                {COLOR_PRESETS.map(c => (
                  <button
                    key={c.name}
                    onClick={() => {
                      updateAttributes({ bg: c.bg, border: c.border })
                      setPickerOpen(false)
                    }}
                    title={c.name}
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: c.bg === 'var(--accent)' ? 'var(--accent-fg)' : c.bg,
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Editable content area */}
        <NodeViewContent
          style={{
            flex: 1,
            minWidth: 0,
            outline: 'none',
            fontSize: '0.95rem',
            color: 'var(--fg)',
            lineHeight: '1.5',
          }}
        />
      </div>
    </NodeViewWrapper>
  )
}

export const CalloutBlock = Node.create({
  name: 'callout',
  group: 'block',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return {
      icon: { default: '💡' },
      bg: { default: 'var(--accent)' },
      border: { default: 'var(--border)' },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutNodeView)
  },
})
