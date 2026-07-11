import { useEffect, useRef, useState } from 'react'
import { Lock, LockOpen, X } from 'lucide-react'

type Mode = 'unlock' | 'set' | 'remove'

interface Props {
  mode: Mode
  onSubmit: (pin: string) => Promise<boolean>
  onClose: () => void
}

export function PinLockModal({ mode, onSubmit, onClose }: Props) {
  const [digits, setDigits] = useState<string[]>(['', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  useEffect(() => {
    refs[0].current?.focus()
  }, [])

  function handleChange(i: number, val: string) {
    const ch = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = ch
    setDigits(next)
    setError('')
    if (ch && i < 3) {
      refs[i + 1].current?.focus()
    }
    if (ch && i === 3) {
      const pin = next.join('')
      if (pin.length === 4) submit(pin)
    }
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      const next = [...digits]
      next[i - 1] = ''
      setDigits(next)
      refs[i - 1].current?.focus()
    }
  }

  async function submit(pin: string) {
    setLoading(true)
    const ok = await onSubmit(pin)
    setLoading(false)
    if (!ok) {
      setDigits(['', '', '', ''])
      setError('Incorrect PIN. Try again.')
      setShake(true)
      setTimeout(() => setShake(false), 500)
      refs[0].current?.focus()
    }
  }

  const title = mode === 'unlock' ? 'Enter PIN' : mode === 'set' ? 'Create New PIN' : 'Enter PIN to Remove'
  const subtitle = mode === 'set' ? '4 digits to lock this note' : 'Enter 4-digit PIN'
  const Icon = mode === 'unlock' || mode === 'remove' ? Lock : LockOpen

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(2px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '32px 36px',
          minWidth: 320,
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 14, right: 14,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--fg-muted)', display: 'flex', padding: 4, borderRadius: 6,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <X size={16} />
        </button>

        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>
          <Icon size={22} color="var(--primary)" />
        </div>

        <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '1.05rem', color: 'var(--fg)', fontFamily: 'var(--font-heading)' }}>
          {title}
        </p>
        <p style={{ margin: '0 0 24px', fontSize: '0.8rem', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>
          {subtitle}
        </p>

        <div
          style={{
            display: 'flex', gap: 12,
            animation: shake ? 'pin-shake 0.4s ease' : undefined,
          }}
        >
          {digits.map((d, i) => (
            <input
              key={i}
              ref={refs[i]}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              disabled={loading}
              style={{
                width: 52, height: 60,
                textAlign: 'center', fontSize: '1.6rem', fontWeight: 700,
                fontFamily: 'var(--font-heading)',
                border: `2px solid ${error ? '#e03131' : d ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 10,
                background: 'var(--input-bg)',
                color: 'var(--fg)',
                outline: 'none',
                transition: 'border-color 0.15s',
                caretColor: 'transparent',
              }}
              onFocus={e => {
                if (!error) e.currentTarget.style.borderColor = 'var(--primary)'
              }}
              onBlur={e => {
                if (!d && !error) e.currentTarget.style.borderColor = 'var(--border)'
              }}
            />
          ))}
        </div>

        {error && (
          <p style={{ margin: '12px 0 0', fontSize: '0.78rem', color: '#e03131', fontFamily: 'var(--font-body)' }}>
            {error}
          </p>
        )}

        {loading && (
          <p style={{ margin: '12px 0 0', fontSize: '0.78rem', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>
            Verifying…
          </p>
        )}
      </div>

      <style>{`
        @keyframes pin-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-5px); }
          80% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  )
}
