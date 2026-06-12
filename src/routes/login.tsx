import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { Eye, EyeOff } from 'lucide-react'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (user) {
    navigate({ to: '/' })
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const err = await login(username, password)
    setLoading(false)
    if (err) { setError(err); return }
    navigate({ to: '/' })
  }

  const inputBase: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '9px 13px', fontSize: '0.9rem',
    fontFamily: 'var(--font-body)',
    border: '1px solid var(--border)', borderRadius: 8,
    outline: 'none', color: 'var(--fg)',
    background: 'var(--input-bg)',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-app)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-body)',
    }}>
      <div style={{
        background: 'var(--card-bg)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '40px 36px',
        width: '100%', maxWidth: 400,
        boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 36, height: 36, background: 'var(--accent)',
            borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.125rem', color: 'var(--fg)' }}>
            Notes
          </span>
        </div>

        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.375rem', color: 'var(--fg)', margin: '0 0 6px' }}>
          Welcome back
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--fg-muted)', margin: '0 0 28px' }}>
          Sign in to your account
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--fg-muted)', marginBottom: 6 }}>
              Username
            </label>
            <input
              autoFocus type="text" value={username} required
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
              style={inputBase}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--fg-muted)', marginBottom: 6 }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'} value={password} required
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                style={{ ...inputBase, padding: '9px 40px 9px 13px' }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
              />
              <button
                type="button" onClick={() => setShowPw(v => !v)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                  color: 'var(--fg-subtle)', display: 'flex', alignItems: 'center',
                }}
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              padding: '9px 13px', background: 'rgba(224,49,49,0.08)',
              border: '1px solid rgba(224,49,49,0.25)',
              borderRadius: 8, fontSize: '0.8375rem', color: '#e03131',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              marginTop: 4, padding: '10px',
              background: 'var(--primary)', color: 'var(--primary-fg)',
              border: 'none', borderRadius: 8,
              fontSize: '0.9375rem', fontWeight: 600,
              fontFamily: 'var(--font-body)',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={{ marginTop: 24, fontSize: '0.8rem', color: 'var(--fg-subtle)', textAlign: 'center' }}>
          Default: <code style={{ color: 'var(--fg-muted)' }}>admin</code> / <code style={{ color: 'var(--fg-muted)' }}>admin123</code>
        </p>
      </div>
    </div>
  )
}
