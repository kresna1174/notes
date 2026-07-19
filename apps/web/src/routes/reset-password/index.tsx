import { createFileRoute, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useTheme } from '#/modules/shared/theme'

export const Route = createFileRoute('/reset-password/')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) ?? '',
  }),
  component: ResetPasswordPage,
})

type State = 'form' | 'expired' | 'success'

function ResetPasswordPage() {
  const { token } = useSearch({ from: '/reset-password/' })
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [state, setState] = useState<State>('form')

  const bg = isDark ? '#09090b' : '#f4f4f5'
  const card = isDark ? '#18181b' : '#ffffff'
  const fg = 'var(--fg)'
  const fgMuted = 'var(--fg-muted)'
  const border = 'var(--border)'
  const primary = 'var(--primary)'
  const primaryFg = 'var(--primary-fg)'

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 16px',
    borderRadius: 8,
    border: `1px solid ${border}`,
    background: isDark ? '#0f0f12' : '#ffffff',
    color: fg,
    fontSize: '0.9375rem',
    fontFamily: 'var(--font-body)',
    outline: 'none',
    boxSizing: 'border-box',
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'expired_token' || data.error === 'invalid_token') {
          setState('expired')
        } else {
          setError(data.error ?? 'Something went wrong')
        }
      } else {
        setState('success')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return <CenteredCard bg={bg} card={card} fg={fg} fgMuted={fgMuted}>
      <LinkExpired fg={fg} fgMuted={fgMuted} primary={primary} />
    </CenteredCard>
  }

  if (state === 'expired') {
    return <CenteredCard bg={bg} card={card} fg={fg} fgMuted={fgMuted}>
      <LinkExpired fg={fg} fgMuted={fgMuted} primary={primary} />
    </CenteredCard>
  }

  if (state === 'success') {
    return <CenteredCard bg={bg} card={card} fg={fg} fgMuted={fgMuted}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto', display: 'block' }}>
            <circle cx="12" cy="12" r="10" />
            <polyline points="9,12 11,14 15,10" />
          </svg>
        </div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: fg, marginBottom: 8 }}>Password updated</h2>
        <p style={{ color: fgMuted, fontSize: '0.9rem', marginBottom: 24 }}>
          Your password has been changed. You can now sign in.
        </p>
        <a
          href="/login"
          style={{
            display: 'inline-block',
            padding: '10px 28px',
            borderRadius: 8,
            background: primary,
            color: primaryFg,
            fontWeight: 600,
            fontSize: '0.9rem',
            textDecoration: 'none',
          }}
        >
          Sign in
        </a>
      </div>
    </CenteredCard>
  }

  return (
    <CenteredCard bg={bg} card={card} fg={fg} fgMuted={fgMuted}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: fg, marginBottom: 6 }}>
        Set new password
      </h2>
      <p style={{ color: fgMuted, fontSize: '0.875rem', marginBottom: 24 }}>
        This link expires 10 minutes after it was sent.
      </p>

      {error && (
        <div style={{
          padding: '9px 13px', borderRadius: 8, marginBottom: 16,
          background: 'rgba(224,49,49,0.08)', border: '1px solid rgba(224,49,49,0.25)',
          fontSize: '0.8375rem', color: '#e03131',
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: fg, marginBottom: 8 }}>
            New password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              autoFocus
              style={{ ...inputStyle, padding: '11px 40px 11px 16px' }}
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                color: fgMuted, display: 'flex', alignItems: 'center',
              }}
            >
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: fg, marginBottom: 8 }}>
            Confirm password
          </label>
          <input
            type={showPw ? 'text' : 'password'}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Repeat password"
            required
            style={inputStyle}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '12px', borderRadius: 8, border: 'none',
            background: primary, color: primaryFg,
            fontWeight: 600, fontSize: '0.9375rem', fontFamily: 'var(--font-body)',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
            marginTop: 4,
          }}
        >
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </CenteredCard>
  )
}

function LinkExpired({ fg, fgMuted, primary }: { fg: string; fgMuted: string; primary: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ marginBottom: 16 }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e03131" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto', display: 'block' }}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: fg, marginBottom: 8 }}>
        Link expired
      </h2>
      <p style={{ color: fgMuted, fontSize: '0.9rem', marginBottom: 24 }}>
        This password reset link has expired or already been used.
        <br />
        Request a new one from the login page.
      </p>
      <a
        href="/login"
        style={{
          display: 'inline-block',
          padding: '10px 28px',
          borderRadius: 8,
          background: primary,
          color: 'var(--primary-fg)',
          fontWeight: 600,
          fontSize: '0.9rem',
          textDecoration: 'none',
        }}
      >
        Back to login
      </a>
    </div>
  )
}

function CenteredCard({ bg, card, children }: {
  bg: string; card: string; fg?: string; fgMuted?: string; children: React.ReactNode
}) {
  return (
    <div style={{
      minHeight: '100vh', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: card,
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '40px 36px',
        width: '100%',
        maxWidth: 420,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        {children}
      </div>
    </div>
  )
}
