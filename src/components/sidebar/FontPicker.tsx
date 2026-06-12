import { useState } from 'react'
import { Type } from 'lucide-react'

const PRESETS = [
  {
    id: '1',
    label: 'Modern & Sleek',
    heading: 'Outfit',
    body: 'Inter',
    desc: 'Bersih & geometris',
  },
  {
    id: '2',
    label: 'Editorial & Premium',
    heading: 'Playfair Display',
    body: 'Lora',
    desc: 'Elegan & klasik',
  },
  {
    id: '3',
    label: 'Unik & Kreatif',
    heading: 'Space Grotesk',
    body: 'Plus Jakarta Sans',
    desc: 'Kreatif & futuristik',
  },
]

function applyPreset(id: string) {
  const p = PRESETS.find(x => x.id === id)
  if (!p) return
  document.documentElement.style.setProperty('--font-heading', `'${p.heading}', sans-serif`)
  document.documentElement.style.setProperty('--font-body', `'${p.body}', -apple-system, sans-serif`)
  localStorage.setItem('font-preset', id)
}

export function FontPicker() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(() => localStorage.getItem('font-preset') || '1')

  function pick(id: string) {
    setActive(id)
    applyPreset(id)
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Ganti font"
        style={{
          width: 28, height: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 6, border: 'none', cursor: 'pointer',
          background: open ? '#e8edff' : 'transparent',
          color: open ? '#3b5bdb' : '#6c757d',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = '#f0f4ff' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent' }}
      >
        <Type size={14} />
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 998 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: 'absolute',
              top: 34,
              left: 0,
              zIndex: 999,
              background: '#fff',
              border: '1px solid #e9ecef',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              padding: 6,
              width: 220,
            }}
          >
            <p style={{ fontSize: '0.6875rem', color: '#6c757d', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 8px 8px' }}>
              Font Style
            </p>
            {PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => pick(p.id)}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 7,
                  border: 'none',
                  cursor: 'pointer',
                  background: active === p.id ? '#e8edff' : 'transparent',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}
                onMouseEnter={e => { if (active !== p.id) e.currentTarget.style.background = '#f8f9fa' }}
                onMouseLeave={e => { if (active !== p.id) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  fontFamily: `'${p.heading}', sans-serif`,
                  color: active === p.id ? '#3b5bdb' : '#1a1a2e',
                }}>
                  {p.label}
                </span>
                <span style={{
                  fontSize: '0.75rem',
                  fontFamily: `'${p.body}', sans-serif`,
                  color: active === p.id ? '#3b5bdb99' : '#6c757d',
                }}>
                  {p.heading} · {p.body}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
