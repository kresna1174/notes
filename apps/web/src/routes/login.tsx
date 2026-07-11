import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '#/modules/shared/auth'
import { useTheme } from '#/modules/shared/theme'
import { Eye, EyeOff, Sun, Moon, Brain, Zap } from 'lucide-react'
import { AboutModal } from '#/modules/auth'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

const TERMINAL_STEPS = [
  { action: 'type', text: 'npx create-mindspace-app --init', delay: 45 },
  { action: 'print', text: '==> Fetching https://registry.npmjs.org/create-mindspace-app.json', delay: 200 },
  { action: 'print', text: '==> Initializing Mindspace workspace environment...', delay: 150 },
  { action: 'print', text: 'Already downloaded: /Users/krisna/Library/Caches/Mindspace/create-mindspace-app--1.2.0.tgz', delay: 100 },
  { action: 'print', text: '==> Preparing local SQLite database schemas...', delay: 100 },
  { action: 'print', text: '==> Establishing secure local keypairs...', delay: 150 },
  { action: 'print', text: '🧠  ~/.config/mindspace: 12 workspace files configured', delay: 200 },
  { action: 'wait', delay: 500 },
  { action: 'type', text: 'mindspace-db --migrate', delay: 45 },
  { action: 'print', text: '==> Initializing SQLite tables (users, notes, teams, locks)...', delay: 200 },
  { action: 'print', text: '✔ Database connection established at ~/.config/mindspace/db.sqlite', delay: 250 },
  { action: 'wait', delay: 500 },
  { action: 'type', text: 'mindspace start --secure', delay: 45 },
  { action: 'print', text: '🚀 Starting Mindspace local workspace server...', delay: 150 },
  { action: 'print', text: '📡 Collaborative websocket active at http://localhost:3000', delay: 80 },
  { action: 'print', text: '🔑 Secure encrypted session keypair loaded.', delay: 80 },
  { action: 'print', text: '----------------------------------------', delay: 40 },
  { action: 'print', text: '📝 [Space] Product Roadmap & Ideas 💡', delay: 80 },
  { action: 'print', text: '📊 [Flow] Collaborative App Flowchart', delay: 80 },
  { action: 'print', text: '🔒 [Lock] Secured personal crypto passphrase', delay: 80 },
  { action: 'print', text: '----------------------------------------', delay: 40 },
  { action: 'print', text: '==> Client ready for secure authentication...', delay: 80 },
  { action: 'wait', delay: 4000 },
  { action: 'clear', delay: 300 }
]

function MindspaceTerminal() {
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
        const text = step.text || ''
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
        background: '#0d1117',
        borderColor: '#21262d',
        fontFamily: 'Courier New, Courier, monospace',
        display: 'flex',
        flexDirection: 'column',
        height: '350px',
      }}
    >
      {/* Terminal Title Bar */}
      <div 
        style={{
          background: '#161b22',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid #21262d',
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
            color: '#8b949e',
            fontWeight: 500,
          }}
        >
          krisna@mindspace: ~
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
          color: '#e6edf3',
          textAlign: 'left',
        }}
      >
        {lines.map((line, idx) => {
          let color = '#e6edf3'
          if (line.isCommand) {
            color = '#58a6ff'
          } else if (line.text.startsWith('🧠') || line.text.startsWith('✔') || line.text.startsWith('🚀') || line.text.startsWith('📡')) {
            color = '#39d353'
          } else if (line.text.startsWith('==>') || line.text.startsWith('┌') || line.text.startsWith('└') || line.text.startsWith('│')) {
            color = '#8b949e'
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
        <div style={{ color: '#58a6ff', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
          {stepIndex < TERMINAL_STEPS.length && TERMINAL_STEPS[stepIndex].action === 'type' && (
            <span>$ {currentInput}</span>
          )}
          <span 
            style={{
              marginLeft: 2,
              width: 7,
              height: 13,
              background: '#58a6ff',
              display: 'inline-block',
              animation: 'blink 1s step-end infinite',
            }}
          />
        </div>
      </div>
    </div>
  )
}

const MOCK_GIT_LOG = [
  'commit 100768fa6283bf5e58c537c38c8cb9ae7649558a',
  'Author: Kresna <kresna@users.noreply.github.com>',
  'Date:   Sat Jun 13 09:38:01 2026 +0700',
  '',
  '  * style: split-screen login page',
  '  * feat: add MindspaceTerminal animation',
  '  * docs: update changelog v1.3.2'
]

const MOCK_TEST_LOG = [
  'RUN  v4.1.8 /Users/krisna/notes-app',
  '✓ src/server/copy.test.ts (2 tests) 13ms',
  '✓ src/server/auth.test.ts (5 tests) 706ms',
  '',
  'Test Files  2 passed (2)',
  '     Tests  7 passed (7)',
  '  Duration  1.41s'
]

const MOCK_DOCKER_LOG = [
  '✔ Container db-1       Created',
  '✔ Container redis-1    Created',
  '✔ Container dev-app-1  Created',
  'Attaching to dev-app-1',
  'dev-app-1 | Server listening on port 3000',
  'dev-app-1 | Connected to sqlite db'
]

const MOCK_NPM_LOG = [
  'npm install @tanstack/react-router',
  'added 142 packages, and audited 143 packages',
  'found 0 vulnerabilities',
  '',
  'npm run build',
  '✓ 2382 modules transformed.',
  'dist/assets/login-BHMKjdvB.js  11.71 kB'
]

interface StaticTerminalProps {
  title: string
  lines: string[]
  opacity: number
  width: number
  height: number
  top?: string
  bottom?: string
  left?: string
  right?: string
  transform?: string
  delay?: string
}

function StaticTerminal({ title, lines, opacity, width, height, top, bottom, left, right, transform, delay }: StaticTerminalProps) {
  return (
    <div 
      style={{
        position: 'absolute',
        top,
        bottom,
        left,
        right,
        width,
        height,
        transform,
        zIndex: 1,
      }}
    >
      <div 
        className="w-full h-full rounded-lg border pointer-events-none select-none"
        style={{
          background: '#22170d',
          borderColor: '#3a2717',
          fontFamily: 'Courier New, Courier, monospace',
          display: 'flex',
          flexDirection: 'column',
          opacity,
          boxShadow: '0 8px 24px rgba(44, 30, 17, 0.12)',
          animation: 'fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both',
          animationDelay: delay || '0ms',
        }}
      >
        {/* Mini Title Bar */}
        <div 
          style={{
            background: '#2c1e11',
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid #3a2717',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff5f56' }} />
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffbd2e' }} />
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#27c93f' }} />
          </div>
          <div 
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.6rem',
              color: '#a6927d',
              fontWeight: 500,
            }}
          >
            {title}
          </div>
        </div>
        {/* Mini Content */}
        <div 
          style={{
            padding: 8,
            flex: 1,
            fontSize: '0.65rem',
            lineHeight: '1.35',
            color: '#ebdcb9',
            overflow: 'hidden',
            textAlign: 'left',
          }}
        >
          {lines.map((line, idx) => (
            <div key={idx} style={{ whiteSpace: 'pre', marginBottom: 2 }}>
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function LoginPage() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAbout, setShowAbout] = useState(false)

  const isDark = theme === 'dark'
  
  // Custom theme colors for high professional layout matching screenshot, integrated with app theme variables
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
      setSuccessMsg('Registration successful! Your account is now pending admin approval.')
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

      {/* Left Panel - Scattered Terminals & Homebrew Terminal Animation */}
      <div 
        className="hidden md:flex md:w-[55%] lg:w-[60%] flex-col justify-center items-center p-12 relative overflow-hidden"
        style={{
          background: 'var(--bg)',
          borderRight: '1px solid var(--border)',
        }}
      >
        {/* Subtle retro overlay pattern */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(var(--fg) 20%, transparent 20%)',
          backgroundSize: '24px 24px',
          zIndex: 2,
        }} />

        {/* Scattered background terminals */}
        <StaticTerminal 
          title="git-log.sh" 
          lines={MOCK_GIT_LOG} 
          opacity={0.15} 
          width={240} 
          height={160} 
          top="6%" 
          left="4%" 
          transform="rotate(-4deg)" 
          delay="100ms"
        />
        <StaticTerminal 
          title="vitest-run.sh" 
          lines={MOCK_TEST_LOG} 
          opacity={0.25} 
          width={280} 
          height={150} 
          bottom="8%" 
          left="6%" 
          transform="rotate(5deg)" 
          delay="250ms"
        />
        <StaticTerminal 
          title="docker-compose.log" 
          lines={MOCK_DOCKER_LOG} 
          opacity={0.12} 
          width={270} 
          height={140} 
          top="10%" 
          right="4%" 
          transform="rotate(6deg)" 
          delay="400ms"
        />
        <StaticTerminal 
          title="npm-build.log" 
          lines={MOCK_NPM_LOG} 
          opacity={0.2} 
          width={260} 
          height={160} 
          bottom="8%" 
          right="6%" 
          transform="rotate(-3deg)" 
          delay="550ms"
        />

        {/* Center Main Terminal */}
        <div 
          style={{ 
            zIndex: 10, 
            textAlign: 'center', 
            width: '100%', 
            maxWidth: 500,
            animation: 'fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both',
            animationDelay: '650ms',
          }}
        >
          <h1 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.85rem',
            fontWeight: 800,
            color: 'var(--primary)',
            marginBottom: 8,
            textAlign: 'center',
            letterSpacing: '-0.02em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}>
            <Brain size={28} /> Mindspace
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.9rem',
            color: 'var(--fg-muted)',
            marginBottom: 32,
            textAlign: 'center',
            lineHeight: '1.5',
          }}>
            A premium collaborative workspace to capture ideas, structure thoughts, and organize your digital mind space.
          </p>

          <MindspaceTerminal />
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

            {/* Social Logins */}
            <button
              type="button"
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
