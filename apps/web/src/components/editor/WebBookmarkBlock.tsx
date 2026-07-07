import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { useState } from 'react'
import { Link2, Trash2 } from 'lucide-react'

function WebBookmarkNodeView({ node, updateAttributes, deleteNode }: any) {
  const { url, title, description, icon, image } = node.attrs
  const [inputUrl, setInputUrl] = useState('')
  const [loading, setLoading] = useState(false)

  async function fetchMetadata(targetUrl: string) {
    if (!targetUrl) return
    let formattedUrl = targetUrl.trim()
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/metadata?url=${encodeURIComponent(formattedUrl)}`)
      if (!res.ok) throw new Error('Failed to fetch metadata')
      const data = await res.json()
      updateAttributes({
        url: data.url || formattedUrl,
        title: data.title || new URL(formattedUrl).host,
        description: data.description || '',
        icon: data.icon || '',
        image: data.image || '',
      })
    } catch (err) {
      console.error(err)
      // Fallback
      updateAttributes({
        url: formattedUrl,
        title: new URL(formattedUrl).host,
        description: '',
        icon: '',
        image: '',
      })
    } finally {
      setLoading(false)
    }
  }

  // Input view (when URL is not yet fetched)
  if (!url) {
    return (
      <NodeViewWrapper className="bookmark-input-wrapper my-4">
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '12px 16px',
            background: 'var(--bg-app)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            alignItems: 'center',
            fontFamily: 'var(--font-body)',
          }}
        >
          <Link2 size={16} style={{ color: 'var(--fg-muted)' }} />
          <input
            type="text"
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            placeholder="Paste atau ketik web URL..."
            onKeyDown={e => {
              if (e.key === 'Enter') fetchMetadata(inputUrl)
            }}
            disabled={loading}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: '0.875rem',
              color: 'var(--fg)',
            }}
          />
          <button
            onClick={() => fetchMetadata(inputUrl)}
            disabled={loading || !inputUrl.trim()}
            style={{
              padding: '6px 12px',
              background: 'var(--primary)',
              color: 'var(--primary-fg)',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              opacity: loading || !inputUrl.trim() ? 0.6 : 1,
            }}
          >
            {loading ? 'Memuat...' : 'Buat Bookmark'}
          </button>
        </div>
      </NodeViewWrapper>
    )
  }

  // Premium Card Preview view (when URL is loaded)
  return (
    <NodeViewWrapper className="bookmark-card-wrapper my-4 relative group">
      <div
        style={{
          display: 'flex',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          overflow: 'hidden',
          background: 'var(--card-bg)',
          fontFamily: 'var(--font-body)',
          transition: 'all 0.2s ease',
          cursor: 'pointer',
          maxHeight: '120px',
        }}
        onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'var(--primary)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.05)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        {/* Left Side Info */}
        <div
          style={{
            flex: 1,
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minWidth: 0,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
            <h5
              style={{
                margin: 0,
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--fg)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {title}
            </h5>
            <p
              style={{
                margin: 0,
                fontSize: '0.75rem',
                color: 'var(--fg-muted)',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                lineHeight: '1.4',
              }}
            >
              {description || 'Tidak ada deskripsi tersedia.'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, marginTop: '8px' }}>
            {icon ? (
              <img
                src={icon}
                alt=""
                onError={e => (e.currentTarget.style.display = 'none')}
                style={{ width: '14px', height: '14px', borderRadius: '2px', objectFit: 'contain' }}
              />
            ) : (
              <Link2 size={12} style={{ color: 'var(--fg-muted)' }} />
            )}
            <span
              style={{
                fontSize: '0.7rem',
                color: 'var(--fg-subtle)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {url}
            </span>
          </div>
        </div>

        {/* Right Side Image Thumbnail */}
        {image && (
          <div
            style={{
              width: '140px',
              borderLeft: '1px solid var(--border)',
              background: 'var(--bg-app)',
              flexShrink: 0,
            }}
          >
            <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}
      </div>

      {/* Delete button shown on hover */}
      <button
        onClick={e => {
          e.stopPropagation()
          deleteNode()
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{
          position: 'absolute',
          top: '-8px',
          right: '-8px',
          width: '24px',
          height: '24px',
          background: '#e03131',
          color: '#ffffff',
          border: 'none',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
          zIndex: 10,
        }}
        title="Hapus Bookmark"
      >
        <Trash2 size={12} />
      </button>
    </NodeViewWrapper>
  )
}

export const WebBookmarkBlock = Node.create({
  name: 'webBookmark',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      url: { default: '' },
      title: { default: '' },
      description: { default: '' },
      icon: { default: '' },
      image: { default: '' },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="bookmark"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'bookmark' })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(WebBookmarkNodeView)
  },
})
