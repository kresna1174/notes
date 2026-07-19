import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuth } from '#/modules/shared/auth'
import { useTheme } from '#/modules/shared/theme'
import { Eye, EyeOff, Sun, Moon, Brain, Map, Lightbulb, BarChart2, KeyRound, Calendar, Network, Users, Lock, Sparkles } from 'lucide-react'
import { AboutModal } from '#/modules/auth'
import { authClient } from '#/modules/shared/auth-client'

export const Route = createFileRoute('/login/')({
  validateSearch: (search: Record<string, unknown>) => ({
    error: (search.error as string) ?? null,
  }),
  component: LoginPage,
})

const DEMO_NOTES = [
  { icon: Map, title: 'Product Roadmap 2026', active: true },
  { icon: Lightbulb, title: 'Ideas & Brainstorm', active: false },
  { icon: BarChart2, title: 'Q3 OKRs', active: false },
  { icon: KeyRound, title: 'Credentials', active: false },
  { icon: Calendar, title: 'Meeting Notes', active: false },
  { icon: Brain, title: 'AI Research Notes', active: false },
]

type DemoLine =
  | { tag: 'h1' | 'h2' | 'bullet' | 'p'; text: string }
  | { tag: 'gap' }

const DEMO_LINES: DemoLine[] = [
  { tag: 'h1', text: 'Product Roadmap 2026' },
  { tag: 'gap' },
  { tag: 'h2', text: 'Q3 Milestones' },
  { tag: 'bullet', text: 'Ship AI note summarization' },
  { tag: 'bullet', text: 'Collaborative live cursors' },
  { tag: 'bullet', text: 'Wiki knowledge graph' },
  { tag: 'gap' },
  { tag: 'p', text: 'Key metrics to track this quarter...' },
  { tag: 'p', text: 'Focus on retention and daily active notes.' },
  { tag: 'gap' },
  { tag: 'h2', text: 'Q4 Goals' },
  { tag: 'bullet', text: 'Mobile app beta launch' },
  { tag: 'bullet', text: 'SSO & enterprise tier' },
]

function MiniAppPreview({ isDark }: { isDark: boolean }) {
  const [lineIdx, setLineIdx] = useState(0)
  const [charIdx, setCharIdx] = useState(0)

  useEffect(() => {
    if (lineIdx >= DEMO_LINES.length) {
      const t = setTimeout(() => { setLineIdx(0); setCharIdx(0) }, 3500)
      return () => clearTimeout(t)
    }
    const line = DEMO_LINES[lineIdx]
    if (line.tag === 'gap') {
      const t = setTimeout(() => { setLineIdx(i => i + 1); setCharIdx(0) }, 100)
      return () => clearTimeout(t)
    }
    if (charIdx >= line.text.length) {
      const t = setTimeout(() => { setLineIdx(i => i + 1); setCharIdx(0) }, 60)
      return () => clearTimeout(t)
    }
    const speed = line.tag === 'h1' ? 50 : 28
    const t = setTimeout(() => setCharIdx(c => c + 1), speed)
    return () => clearTimeout(t)
  }, [lineIdx, charIdx])

  const completedLines = DEMO_LINES.slice(0, lineIdx)
  const currentLine = lineIdx < DEMO_LINES.length ? DEMO_LINES[lineIdx] : null
  const currentText = currentLine && currentLine.tag !== 'gap' ? currentLine.text.slice(0, charIdx) : ''

  // glassmorphism values
  const glassBg = isDark
    ? 'rgba(30,30,30,0.55)'
    : 'rgba(255,255,255,0.55)'
  const glassBorder = isDark
    ? 'rgba(255,255,255,0.10)'
    : 'rgba(0,0,0,0.08)'
  const sidebarGlass = isDark
    ? 'rgba(22,22,22,0.60)'
    : 'rgba(247,247,245,0.65)'
  const editorGlass = isDark
    ? 'rgba(25,25,25,0.50)'
    : 'rgba(255,255,255,0.45)'
  const titlebarGlass = isDark
    ? 'rgba(20,20,20,0.70)'
    : 'rgba(240,240,238,0.75)'

  function renderLine(line: DemoLine, key: number | string, text?: string, showCursor?: boolean) {
    const t = text ?? (line.tag !== 'gap' ? line.text : '')
    if (line.tag === 'gap') return <div key={key} style={{ height: 9 }} />
    if (line.tag === 'h1') return (
      <div key={key} style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--fg)', marginBottom: 6, fontFamily: 'var(--font-heading)', lineHeight: 1.2, display: 'flex', alignItems: 'center', letterSpacing: '-0.02em' }}>
        {t}{showCursor && <Cursor tall />}
      </div>
    )
    if (line.tag === 'h2') return (
      <div key={key} style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg)', marginBottom: 5, fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', marginTop: 2 }}>
        {t}{showCursor && <Cursor />}
      </div>
    )
    if (line.tag === 'bullet') return (
      <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
        <span style={{ color: 'var(--primary)', fontSize: '0.55rem', flexShrink: 0, marginTop: 1 }}>●</span>
        <span style={{ fontSize: '0.78rem', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', lineHeight: 1.4 }}>
          {t}{showCursor && <Cursor />}
        </span>
      </div>
    )
    return (
      <div key={key} style={{ fontSize: '0.78rem', color: 'var(--fg-muted)', marginBottom: 3, lineHeight: 1.6, display: 'flex', alignItems: 'center' }}>
        {t}{showCursor && <Cursor />}
      </div>
    )
  }

  return (
    <div style={{
      width: '100%',
      borderRadius: 14,
      overflow: 'hidden',
      border: `1px solid ${glassBorder}`,
      boxShadow: isDark
        ? '0 32px 80px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)'
        : '0 32px 80px rgba(0,0,0,0.14), 0 8px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
      backdropFilter: 'blur(24px) saturate(1.6)',
      WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
      background: glassBg,
    }}>
      {/* macOS titlebar */}
      <div style={{
        background: titlebarGlass,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${glassBorder}`,
        padding: '11px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        userSelect: 'none',
      }}>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f56', display: 'block', boxShadow: '0 0 0 0.5px rgba(0,0,0,0.15)' }} />
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ffbd2e', display: 'block', boxShadow: '0 0 0 0.5px rgba(0,0,0,0.15)' }} />
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#27c93f', display: 'block', boxShadow: '0 0 0 0.5px rgba(0,0,0,0.15)' }} />
        </div>
        <div style={{
          flex: 1,
          background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
          border: `1px solid ${glassBorder}`,
          borderRadius: 6,
          padding: '4px 12px',
          fontSize: '0.65rem',
          color: 'var(--fg-subtle)',
          fontFamily: 'var(--font-body)',
          textAlign: 'center',
          letterSpacing: '0.01em',
        }}>
          mindspace.app/notes/product-roadmap-2026
        </div>
      </div>

      {/* App layout */}
      <div style={{ display: 'flex', height: 380 }}>
        {/* Sidebar */}
        <div style={{
          width: 175,
          borderRight: `1px solid ${glassBorder}`,
          background: sidebarGlass,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          display: 'flex',
          flexDirection: 'column',
          padding: '10px 0',
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '3px 12px 11px',
            borderBottom: `1px solid ${glassBorder}`,
            marginBottom: 6,
          }}>
            <Brain size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}>
              Mindspace
            </span>
          </div>
          <div style={{ padding: '2px 6px 4px', marginBottom: 2 }}>
            <span style={{ fontSize: '0.58rem', fontWeight: 600, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingLeft: 6 }}>
              My Notes
            </span>
          </div>
          {DEMO_NOTES.map((note, i) => {
            const NoteIcon = note.icon
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 10px',
                borderRadius: 6,
                margin: '1px 5px',
                background: note.active
                  ? isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)'
                  : 'transparent',
              }}>
                <NoteIcon size={11} style={{ color: note.active ? 'var(--primary)' : 'var(--fg-subtle)', flexShrink: 0 }} />
                <span style={{
                  fontSize: '0.68rem',
                  color: note.active ? 'var(--fg)' : 'var(--fg-muted)',
                  fontWeight: note.active ? 600 : 400,
                  fontFamily: 'var(--font-body)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {note.title}
                </span>
              </div>
            )
          })}
        </div>

        {/* Editor */}
        <div style={{
          flex: 1,
          background: editorGlass,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          padding: '28px 28px',
          overflowY: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--font-body)',
        }}>
          {completedLines.map((line, i) => renderLine(line, i))}
          {currentLine && renderLine(currentLine, 'current', currentText, true)}
        </div>
      </div>
    </div>
  )
}

function Cursor({ tall }: { tall?: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: 2, height: tall ? 18 : 12,
      background: 'var(--primary)', marginLeft: 2, flexShrink: 0, verticalAlign: 'middle',
      borderRadius: 1,
      animation: 'blink 1s step-end infinite',
    }} />
  )
}

function LoginPage() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const search = useSearch({ from: '/login/' })
  const { theme, toggle } = useTheme()
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMsg, setForgotMsg] = useState<string | null>(null)
  const [forgotError, setForgotError] = useState<string | null>(null)

  const isDark = theme === 'dark'
  
  const textTitle = 'var(--fg)'
  const textMuted = 'var(--fg-muted)'
  const bgInput = isDark ? '#18181b' : '#ffffff'
  const borderInput = 'var(--border)'
  const textInput = 'var(--fg)'
  const borderFocus = 'var(--primary)'
  const bgSocial = isDark ? '#18181b' : '#ffffff'
  const borderSocial = 'var(--border)'
  const bgSocialHover = 'var(--muted)'
  const dividerLine = 'var(--border)'

  const getThemeIcon = (t: string) => {
    return t === 'dark' ? <Sun size={18} /> : <Moon size={18} />
  }

  if (user) {
    navigate({ to: '/' })
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)
    setLoading(true)
    const err = await login(username, password)
    setLoading(false)
    if (err) { setError(err); return }
    navigate({ to: '/' })
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setForgotError(null)
    setForgotMsg(null)
    setForgotLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      })
      if (res.ok) {
        setForgotMsg('If an account with that email exists, a reset link has been sent.')
      } else {
        const data = await res.json()
        setForgotError(data.error ?? 'Something went wrong')
      }
    } catch {
      setForgotError('Network error. Please try again.')
    } finally {
      setForgotLoading(false)
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/public-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      setLoading(false)
      if (!res.ok) {
        setError(data.error || 'Registration failed')
        return
      }
      setSuccessMsg('Registration successful! You can now sign in.')
      setUsername('')
      setPassword('')
      setIsRegister(false)
    } catch {
      setLoading(false)
      setError('A network error occurred')
    }
  }

  const inputBase: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '12px 16px', fontSize: '0.875rem',
    fontFamily: 'var(--font-body)',
    border: `1px solid ${borderInput}`, borderRadius: 8,
    outline: 'none', color: textInput,
    background: bgInput,
    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen w-full relative" style={{ background: 'var(--bg-app)' }}>
      {/* Floating Theme Toggle */}
      <button
        onClick={toggle}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          zIndex: 100,
          background: 'color-mix(in srgb, var(--card-bg) 80%, transparent)',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 10,
          cursor: 'pointer',
          color: 'var(--fg)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.15s, background-color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.background = 'var(--muted)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--card-bg) 80%, transparent)' }}
      >
        {getThemeIcon(theme)}
      </button>

      {/* Left Panel — macOS glass preview */}
      <div
        className="hidden md:flex md:w-[55%] lg:w-[60%] flex-col justify-center items-center relative overflow-hidden"
        style={{
          background: isDark
            ? 'linear-gradient(135deg, #0f1117 0%, #111520 40%, #0d1a12 100%)'
            : 'linear-gradient(135deg, #e8f5e9 0%, #f0f4ff 50%, #e8f0f5 100%)',
          borderRight: '1px solid var(--border)',
          padding: '40px 48px',
        }}
      >
        {/* Ambient glow blobs */}
        <div style={{
          position: 'absolute', top: '-10%', left: '-5%',
          width: 420, height: 420, borderRadius: '50%', pointerEvents: 'none',
          background: isDark
            ? 'radial-gradient(circle, rgba(74,222,128,0.10) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(22,163,74,0.12) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', bottom: '0%', right: '-10%',
          width: 380, height: 380, borderRadius: '50%', pointerEvents: 'none',
          background: isDark
            ? 'radial-gradient(circle, rgba(99,102,241,0.10) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', top: '40%', right: '10%',
          width: 240, height: 240, borderRadius: '50%', pointerEvents: 'none',
          background: isDark
            ? 'radial-gradient(circle, rgba(251,191,36,0.05) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(251,191,36,0.08) 0%, transparent 70%)',
        }} />

        {/* Noise texture */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
          opacity: isDark ? 0.025 : 0.018,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundSize: '180px 180px',
        }} />

        <div style={{
          zIndex: 10, width: '100%',
          animation: 'fadeInUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
          animationDelay: '150ms',
          display: 'flex', flexDirection: 'column', gap: 28,
        }}>
          {/* Header */}
          <div>
            <h2 style={{
              fontFamily: 'var(--font-heading)', fontSize: '1.65rem', fontWeight: 800,
              letterSpacing: '-0.03em', margin: '0 0 8px',
              color: isDark ? 'rgba(255,255,255,0.92)' : '#1a1a1a',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Brain size={26} style={{ color: 'var(--primary)' }} />
              Your ideas, beautifully organised.
            </h2>
            <p style={{
              fontSize: '0.875rem', margin: 0, lineHeight: 1.6,
              color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)',
              fontFamily: 'var(--font-body)',
            }}>
              Notes · Wiki · AI · Collaboration — all in one workspace.
            </p>
          </div>

          {/* Glass window */}
          <MiniAppPreview isDark={isDark} />

          {/* Feature chips */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'AI Summarization', Icon: Sparkles },
              { label: 'Wiki Graph', Icon: Network },
              { label: 'Live Collab', Icon: Users },
              { label: 'PIN Lock', Icon: Lock },
            ].map(({ label, Icon }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 11px',
                borderRadius: 20,
                background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)'}`,
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}>
                <Icon size={11} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                <span style={{
                  fontSize: '0.7rem', fontFamily: 'var(--font-body)', fontWeight: 500,
                  color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)',
                }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Login Card */}
      <div 
        className="flex-1 flex items-center justify-center p-6 md:p-12 relative" 
        style={{ 
          background: 'var(--bg-app)',
          backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          transition: 'background 0.2s',
        }}
      >
        {/* Cascade entrance wrapper */}
        <div 
          style={{ 
            width: '100%', 
            maxWidth: 400,
            animation: 'fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both',
            animationDelay: '780ms',
          }}
        >
          <div 
            style={{
              width: '100%',
              maxWidth: 400,
              display: 'flex',
              flexDirection: 'column',
              zIndex: 10,
              position: 'relative',
              padding: '24px 0',
            }}
          >
            <h1 style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '2rem',
              fontWeight: 700,
              color: textTitle,
              letterSpacing: '-0.025em',
              margin: '0 0 6px'
            }}>
              {isRegister ? 'Welcome to Mindspace' : 'Welcome back'}
            </h1>
            <p style={{ fontSize: '0.875rem', color: textMuted, margin: '0 0 28px' }}>
              {isRegister ? 'Create an account to get started' : 'Sign in to your account'}
            </p>

            {/* OAuth Error Display */}
            {search.error && (
              <div style={{
                padding: '9px 13px', background: 'rgba(224,49,49,0.08)',
                border: '1px solid rgba(224,49,49,0.25)',
                borderRadius: 8, fontSize: '0.8375rem', color: '#e03131',
                marginBottom: 16
              }}>
                {search.error === 'oauth_failed' ? 'OAuth login failed. Please try again.' : search.error}
              </div>
            )}

            {/* Social Logins */}
            <button
              type="button"
              onClick={() => authClient.signIn.social({ provider: 'google', callbackURL: '/' })}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '11px 16px',
                background: bgSocial,
                border: `1px solid ${borderSocial}`,
                borderRadius: 8,
                color: textTitle,
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
                marginBottom: 12,
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = bgSocialHover}
              onMouseLeave={e => e.currentTarget.style.background = bgSocial}
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill={textTitle} d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.53-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C17.955 2.192 15.34 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.478 0 10.793-4.537 10.793-10.982 0-.74-.08-1.302-.176-1.865H12.24z"/>
              </svg>
              Continue with Google
            </button>

            <button
              type="button"
              onClick={() => authClient.signIn.social({ provider: 'github', callbackURL: '/' })}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '11px 16px',
                background: bgSocial,
                border: `1px solid ${borderSocial}`,
                borderRadius: 8,
                color: textTitle,
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
                marginBottom: 20,
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = bgSocialHover}
              onMouseLeave={e => e.currentTarget.style.background = bgSocial}
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
              </svg>
              Continue with GitHub
            </button>

            {/* Divider OR */}
            <div style={{ display: 'flex', alignItems: 'center', margin: '12px 0 24px', gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: dividerLine }} />
              <span style={{ fontSize: '0.75rem', color: textMuted, fontWeight: 600, letterSpacing: '0.05em' }}>OR</span>
              <div style={{ flex: 1, height: 1, background: dividerLine }} />
            </div>

            {successMsg && (
              <div style={{
                padding: '9px 13px', background: 'rgba(43,138,62,0.08)',
                border: '1px solid rgba(43,138,62,0.25)',
                borderRadius: 8, fontSize: '0.8375rem', color: '#2b8a3e',
                marginBottom: 16
              }}>
                {successMsg}
              </div>
            )}

            <form onSubmit={isRegister ? handleRegister : handleSubmit} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: textTitle, marginBottom: 8 }}>
                  Username
                </label>
                <input
                  autoFocus type="text" value={username} required
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  autoComplete="off"
                  style={inputBase}
                  onFocus={e => { e.currentTarget.style.borderColor = borderFocus; e.currentTarget.style.boxShadow = `0 0 0 1px ${borderFocus}` }}
                  onBlur={e => { e.currentTarget.style.borderColor = borderInput; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 600, color: textTitle }}>
                    Password
                  </label>
                  {!isRegister && (
                    <button
                      type="button"
                      onClick={() => { setShowForgot(true); setForgotMsg(null); setForgotError(null); setForgotEmail('') }}
                      style={{
                        background: 'none', border: 'none',
                        fontSize: '0.8125rem', color: textMuted,
                        cursor: 'pointer', fontFamily: 'var(--font-body)',
                        transition: 'color 0.2s',
                        padding: 0,
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = textTitle}
                      onMouseLeave={e => e.currentTarget.style.color = textMuted}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPw ? 'text' : 'password'} value={password} required
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="new-password"
                    style={{ ...inputBase, padding: '12px 40px 12px 16px' }}
                    onFocus={e => { e.currentTarget.style.borderColor = borderFocus; e.currentTarget.style.boxShadow = `0 0 0 1px ${borderFocus}` }}
                    onBlur={e => { e.currentTarget.style.borderColor = borderInput; e.currentTarget.style.boxShadow = 'none' }}
                  />
                  <button
                    type="button" onClick={() => setShowPw(v => !v)}
                    style={{
                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
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
                onMouseEnter={e => { if (!loading) { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)' }}
                style={{
                  marginTop: 8, padding: '12px 16px',
                  background: 'var(--primary)', color: 'var(--primary-fg)',
                  border: 'none', borderRadius: 8,
                  fontSize: '0.875rem', fontWeight: 600,
                  fontFamily: 'var(--font-body)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  width: '100%',
                }}
              >
                {isRegister ? (loading ? 'Creating Account…' : 'Sign Up') : (loading ? 'Signing In…' : 'Sign In')}
              </button>
            </form>

            {/* Bottom Link to toggle Register/Login */}
            <div style={{ marginTop: 24, textAlign: 'center', fontSize: '0.875rem', color: textMuted, fontFamily: 'var(--font-body)' }}>
              {isRegister ? (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => { setIsRegister(false); setError(null); setSuccessMsg(null) }}
                    style={{ background: 'none', border: 'none', color: textTitle, fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'none' }}
                    onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                    onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                  >
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => { setIsRegister(true); setError(null); setSuccessMsg(null) }}
                    style={{ background: 'none', border: 'none', color: textTitle, fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'none' }}
                    onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                    onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                  >
                    Sign up
                  </button>
                </>
              )}
            </div>

            {/* Info release notes */}
            <div style={{ marginTop: 32, textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => setShowAbout(true)}
                style={{
                  background: 'none', border: 'none',
                  fontSize: '0.75rem', color: textMuted,
                  cursor: 'pointer', textDecoration: 'underline',
                  fontFamily: 'var(--font-body)'
                }}
                onMouseEnter={e => (e.currentTarget.style.color = textTitle)}
                onMouseLeave={e => (e.currentTarget.style.color = textMuted)}
              >
                About & Release Notes
              </button>
            </div>
          </div>
        </div>
      </div>

      <AboutModal open={showAbout} onOpenChange={setShowAbout} />

      {/* Forgot password modal */}
      {showForgot && (
        <div
          onClick={() => setShowForgot(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: isDark ? '#18181b' : '#ffffff',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: '36px 32px',
              width: '100%',
              maxWidth: 400,
              boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            }}
          >
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: textTitle, marginBottom: 6 }}>
              Reset your password
            </h3>
            <p style={{ fontSize: '0.875rem', color: textMuted, marginBottom: 20 }}>
              Enter your account email and we'll send you a reset link.
            </p>

            {forgotMsg && (
              <div style={{
                padding: '9px 13px', borderRadius: 8, marginBottom: 16,
                background: 'rgba(43,138,62,0.08)', border: '1px solid rgba(43,138,62,0.25)',
                fontSize: '0.8375rem', color: '#2b8a3e',
              }}>
                {forgotMsg}
              </div>
            )}
            {forgotError && (
              <div style={{
                padding: '9px 13px', borderRadius: 8, marginBottom: 16,
                background: 'rgba(224,49,49,0.08)', border: '1px solid rgba(224,49,49,0.25)',
                fontSize: '0.8375rem', color: '#e03131',
              }}>
                {forgotError}
              </div>
            )}

            {!forgotMsg && (
              <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: textTitle, marginBottom: 8 }}>
                    Email address
                  </label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus
                    style={{
                      width: '100%', padding: '11px 16px', borderRadius: 8,
                      border: `1px solid ${borderInput}`,
                      background: bgInput, color: textInput,
                      fontSize: '0.9375rem', fontFamily: 'var(--font-body)',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = borderFocus; e.currentTarget.style.boxShadow = `0 0 0 1px ${borderFocus}` }}
                    onBlur={e => { e.currentTarget.style.borderColor = borderInput; e.currentTarget.style.boxShadow = 'none' }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  style={{
                    padding: '11px', borderRadius: 8, border: 'none',
                    background: 'var(--primary)', color: 'var(--primary-fg)',
                    fontWeight: 600, fontSize: '0.9375rem', fontFamily: 'var(--font-body)',
                    cursor: forgotLoading ? 'not-allowed' : 'pointer',
                    opacity: forgotLoading ? 0.7 : 1,
                  }}
                >
                  {forgotLoading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={() => setShowForgot(false)}
              style={{
                marginTop: 20, display: 'block', width: '100%',
                background: 'none', border: 'none',
                fontSize: '0.875rem', color: textMuted,
                cursor: 'pointer', fontFamily: 'var(--font-body)',
                textAlign: 'center',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  )
}
