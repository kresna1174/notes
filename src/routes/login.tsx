import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { Eye, EyeOff } from 'lucide-react'
import { AboutModal } from '../components/ui/AboutModal'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

const TERMINAL_STEPS = [
  { action: 'type', text: 'brew install homebrew-notes', delay: 45 },
  { action: 'print', text: '==> Downloading https://formulae.brew.sh/api/formula/homebrew-notes.json', delay: 200 },
  { action: 'print', text: '==> Downloading source tarball...', delay: 150 },
  { action: 'print', text: 'Already downloaded: /Users/krisna/Library/Caches/Homebrew/downloads/homebrew-notes--1.2.0.tar.gz', delay: 100 },
  { action: 'print', text: '==> Installing homebrew-notes', delay: 100 },
  { action: 'print', text: '==> Pouring homebrew-notes--1.2.0.arm64_sonoma.bottle.1.tar.gz', delay: 150 },
  { action: 'print', text: '🍺  /opt/homebrew/Cellar/homebrew-notes/1.2.0: 18 files, 4.2MB', delay: 200 },
  { action: 'wait', delay: 500 },
  { action: 'type', text: 'notes-app --init-db', delay: 45 },
  { action: 'print', text: '==> Initializing local SQLite database...', delay: 200 },
  { action: 'print', text: '==> Creating schema tables (users, notes, teams, locks)...', delay: 100 },
  { action: 'print', text: '✔ Database initialized successfully at ~/.config/homebrew-notes/db.sqlite', delay: 250 },
  { action: 'wait', delay: 500 },
  { action: 'type', text: 'notes-app start', delay: 45 },
  { action: 'print', text: '🚀 Starting Homebrew Notes daemon...', delay: 150 },
  { action: 'print', text: '📡 Server running at http://localhost:3000', delay: 80 },
  { action: 'print', text: '🔑 Secure session key generated.', delay: 80 },
  { action: 'print', text: '----------------------------------------', delay: 40 },
  { action: 'print', text: '📝 [Note] Catatan Belanja Kopi ☕', delay: 80 },
  { action: 'print', text: '📊 [Flow] Skema Sistem Database Drizzle', delay: 80 },
  { action: 'print', text: '🔒 [Lock] Sandi Dompet Kripto Rahasia', delay: 80 },
  { action: 'print', text: '----------------------------------------', delay: 40 },
  { action: 'print', text: '==> Ready for user authentication...', delay: 80 },
  { action: 'wait', delay: 4000 },
  { action: 'clear', delay: 300 }
]

function HomebrewTerminal() {
  const [lines, setLines] = useState<Array<{ text: string; isCommand?: boolean }>>([])
  const [currentInput, setCurrentInput] = useState('')
  const [stepIndex, setStepIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    let timer: any

    async function run() {
      const step = TERMINAL_STEPS[stepIndex]
      if (!step) return

      if (step.action === 'type') {
        let typed = ''
        const text = step.text
        for (let i = 0; i < text.length; i++) {
          if (!active) return
          await new Promise(r => { timer = setTimeout(r, step.delay || 50) })
          typed += text[i]
          setCurrentInput(typed)
        }
        await new Promise(r => { timer = setTimeout(r, 150) })
        if (!active) return
        setLines(prev => [...prev, { text: '$ ' + text, isCommand: true }])
        setCurrentInput('')
        setStepIndex(s => s + 1)
      } else if (step.action === 'print') {
        await new Promise(r => { timer = setTimeout(r, step.delay || 80) })
        if (!active) return
        setLines(prev => [...prev, { text: step.text || '' }])
        setStepIndex(s => s + 1)
      } else if (step.action === 'wait') {
        await new Promise(r => { timer = setTimeout(r, step.delay || 800) })
        if (!active) return
        setStepIndex(s => s + 1)
      } else if (step.action === 'clear') {
        await new Promise(r => { timer = setTimeout(r, step.delay || 400) })
        if (!active) return
        setLines([])
        setCurrentInput('')
        setStepIndex(0)
      }
    }

    run()

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [stepIndex])

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [lines, currentInput])

  return (
    <div 
      className="w-full max-w-[500px] rounded-xl overflow-hidden shadow-2xl border"
      style={{
        background: '#22170d',
        borderColor: '#3a2717',
        fontFamily: 'Courier New, Courier, monospace',
        display: 'flex',
        flexDirection: 'column',
        height: '350px',
      }}
    >
      {/* Terminal Title Bar */}
      <div 
        style={{
          background: '#2c1e11',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid #3a2717',
          position: 'relative',
        }}
      >
        {/* Traffic lights */}
        <div style={{ display: 'flex', gap: 6, zIndex: 2 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
        </div>
        {/* Title */}
        <div 
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.72rem',
            color: '#a6927d',
            fontWeight: 500,
          }}
        >
          krisna@homebrew-notes: ~
        </div>
      </div>

      {/* Terminal Content Area */}
      <div 
        ref={containerRef}
        style={{
          padding: 16,
          flex: 1,
          overflowY: 'auto',
          fontSize: '0.8rem',
          lineHeight: '1.45',
          color: '#ebdcb9',
          textAlign: 'left',
        }}
      >
        {lines.map((line, idx) => {
          let color = '#ebdcb9'
          if (line.isCommand) {
            color = '#ffffff'
          } else if (line.text.startsWith('🍺') || line.text.startsWith('✔') || line.text.startsWith('🚀') || line.text.startsWith('📡')) {
            color = '#f2d472'
          } else if (line.text.startsWith('==>') || line.text.startsWith('┌') || line.text.startsWith('└') || line.text.startsWith('│')) {
            color = '#a6927d'
          }
          return (
            <div 
              key={idx} 
              style={{
                color,
                fontWeight: line.isCommand ? 600 : 400,
                whiteSpace: 'pre-wrap',
                marginBottom: 3,
              }}
            >
              {line.text}
            </div>
          )
        })}
        
        {/* Current typing line */}
        <div style={{ color: '#ffffff', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
          {stepIndex < TERMINAL_STEPS.length && TERMINAL_STEPS[stepIndex].action === 'type' && (
            <span>$ {currentInput}</span>
          )}
          <span 
            style={{
              marginLeft: 2,
              width: 7,
              height: 13,
              background: '#c27d0c',
              display: 'inline-block',
              animation: 'blink 1s step-end infinite',
            }}
          />
        </div>
      </div>
    </div>
  )
}

function LoginPage() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAbout, setShowAbout] = useState(false)

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
        setError(data.error || 'Gagal mendaftar')
        return
      }
      setSuccessMsg('Pendaftaran berhasil! Akun Anda kini menunggu persetujuan admin.')
      setUsername('')
      setPassword('')
      setIsRegister(false)
    } catch {
      setLoading(false)
      setError('Terjadi kesalahan jaringan')
    }
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
    <div className="flex flex-col md:flex-row min-h-screen w-full" style={{ background: 'var(--bg-app)' }}>
      {/* Left Panel - Homebrew Terminal Animation */}
      <div 
        className="hidden md:flex md:w-[55%] lg:w-[60%] flex-col justify-center items-center p-12 relative overflow-hidden"
        style={{
          background: '#f9f5eb',
          borderRight: '1px solid #ebdcb9',
        }}
      >
        {/* Subtle retro overlay pattern */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(#2c1e11 20%, transparent 20%)',
          backgroundSize: '24px 24px',
        }} />

        <h1 style={{
          fontFamily: 'var(--font-heading)',
          fontSize: '1.85rem',
          fontWeight: 800,
          color: '#c27d0c',
          marginBottom: 8,
          textAlign: 'center',
          letterSpacing: '-0.02em',
        }}>
          ☕ Homebrew Notes
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.9rem',
          color: '#735f4b',
          marginBottom: 32,
          textAlign: 'center',
          maxWidth: 420,
          lineHeight: '1.5',
        }}>
          Tempat aman untuk mencatat ide kreatif, berkolaborasi dengan tim, dan merancang diagram alir secara instan.
        </p>

        <HomebrewTerminal />
      </div>

      {/* Right Panel - Login Card */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12" style={{ background: 'var(--bg-app)' }}>
        <div style={{
          background: 'var(--card-bg)', border: '1px solid var(--border)',
          borderRadius: 16, padding: '40px 36px',
          width: '100%', maxWidth: 400,
          boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <img
              src="/logo192.png"
              alt="Homebrew Notes Logo"
              style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'contain' }}
            />
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.125rem', color: 'var(--fg)' }}>
              Homebrew Notes
            </span>
          </div>

          {/* Tab Switcher */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--muted)', borderRadius: 8, padding: 3, marginBottom: 24 }}>
            <button
              onClick={() => { setIsRegister(false); setError(null); setSuccessMsg(null) }}
              style={{
                flex: 1, padding: '6px 0', fontSize: '0.8rem', fontWeight: !isRegister ? 600 : 400,
                border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-body)',
                background: !isRegister ? 'var(--bg)' : 'transparent',
                color: !isRegister ? 'var(--fg)' : 'var(--fg-muted)',
                boxShadow: !isRegister ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              Masuk (Sign in)
            </button>
            <button
              onClick={() => { setIsRegister(true); setError(null); setSuccessMsg(null) }}
              style={{
                flex: 1, padding: '6px 0', fontSize: '0.8rem', fontWeight: isRegister ? 600 : 400,
                border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-body)',
                background: isRegister ? 'var(--bg)' : 'transparent',
                color: isRegister ? 'var(--fg)' : 'var(--fg-muted)',
                boxShadow: isRegister ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              Daftar (Register)
            </button>
          </div>

          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.375rem', color: 'var(--fg)', margin: '0 0 6px' }}>
            {isRegister ? 'Daftar Akun Baru' : 'Welcome back'}
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--fg-muted)', margin: '0 0 28px' }}>
            {isRegister ? 'Pendaftaran memerlukan persetujuan admin' : 'Sign in to your account'}
          </p>

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

          <form onSubmit={isRegister ? handleRegister : handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              {isRegister ? (loading ? 'Mendaftar…' : 'Daftar') : (loading ? 'Signing in…' : 'Sign in')}
            </button>
          </form>

          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => setShowAbout(true)}
              style={{
                background: 'none', border: 'none',
                fontSize: '0.75rem', color: 'var(--fg-muted)',
                cursor: 'pointer', textDecoration: 'underline',
                fontFamily: 'var(--font-body)'
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-muted)')}
            >
              Tentang & Catatan Rilis
            </button>
          </div>
        </div>
      </div>

      <AboutModal open={showAbout} onOpenChange={setShowAbout} />

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
