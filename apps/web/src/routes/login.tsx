import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'
import { Eye, EyeOff, Sun, Moon, Beer, Zap } from 'lucide-react'
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
  { action: 'print', text: '📝 [Note] Homebrew Beer Recipe 🍺', delay: 80 },
  { action: 'print', text: '📊 [Flow] Drizzle DB System Schema', delay: 80 },
  { action: 'print', text: '🔒 [Lock] Secret Crypto Wallet Passphrase', delay: 80 },
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

const MOCK_GIT_LOG = [
  'commit 100768fa6283bf5e58c537c38c8cb9ae7649558a',
  'Author: Kresna <kresna@users.noreply.github.com>',
  'Date:   Sat Jun 13 09:38:01 2026 +0700',
  '',
  '  * style: split-screen login page',
  '  * feat: add HomebrewTerminal animation',
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

  const cardRef = useRef<HTMLDivElement>(null)
  const [transformStyle, setTransformStyle] = useState('perspective(1000px) rotateX(0deg) rotateY(0deg)')
  const [transitionStyle, setTransitionStyle] = useState('transform 0.5s ease')
  const [glowStyle, setGlowStyle] = useState({ opacity: 0, x: 0, y: 0 })

  const getThemeIcon = (t: string) => {
    switch (t) {
      case 'light': return <Sun size={18} />
      case 'dark': return <Moon size={18} />
      case 'homebrew': return <Beer size={18} />
      case 'reactor': return <Zap size={18} />
      default: return <Sun size={18} />
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const card = cardRef.current
    if (!card) return
    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const rotateX = ((centerY - y) / centerY) * 6
    const rotateY = ((x - centerX) / centerX) * 6

    setTransitionStyle('transform 0.15s ease-out')
    setTransformStyle(`perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`)
    setGlowStyle({ opacity: 1, x, y })
  }

  function handleMouseLeave() {
    setTransitionStyle('transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)')
    setTransformStyle('perspective(1000px) rotateX(0deg) rotateY(0deg)')
    setGlowStyle({ opacity: 0, x: 0, y: 0 })
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
    padding: '9px 13px', fontSize: '0.9rem',
    fontFamily: 'var(--font-body)',
    border: '1px solid var(--border)', borderRadius: 8,
    outline: 'none', color: 'var(--fg)',
    background: 'var(--input-bg)',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen w-full relative" style={{ background: 'var(--bg-app)' }}>
      {/* Floating Theme Toggle */}
      <button
        onClick={toggle}
        title={`Switch theme (Current: ${theme})`}
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
          }}>
            🍺 Homebrew Notes
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.9rem',
            color: 'var(--fg-muted)',
            marginBottom: 32,
            textAlign: 'center',
            lineHeight: '1.5',
          }}>
            A secure workspace to write creative ideas, collaborate with teams, and design interactive flowcharts instantly.
          </p>

          <HomebrewTerminal />
        </div>
      </div>

      {/* Right Panel - Login Card */}
      <div 
        className="flex-1 flex items-center justify-center p-6 md:p-12 relative" 
        style={{ 
          background: 'var(--bg-app)',
          backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
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
            ref={cardRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{
              background: 'color-mix(in srgb, var(--card-bg) 82%, transparent)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid var(--border)',
              borderRadius: 16, 
              width: '100%', maxWidth: 400,
              boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 10,
              transform: transformStyle,
              transition: transitionStyle,
              transformStyle: 'preserve-3d',
              position: 'relative',
            }}
          >
          {/* Mouse glow overlay */}
          <div 
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(350px circle at ${glowStyle.x}px ${glowStyle.y}px, color-mix(in srgb, var(--primary) 15%, transparent), transparent 80%)`,
              opacity: glowStyle.opacity,
              pointerEvents: 'none',
              transition: 'opacity 0.2s ease',
              zIndex: 1,
            }}
          />

          {/* Terminal-style Card Header */}
          <div 
            style={{
              background: 'color-mix(in srgb, var(--muted) 40%, transparent)',
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              borderBottom: '1px solid var(--border)',
              position: 'relative',
              zIndex: 2,
            }}
          >
            {/* Traffic lights */}
            <div style={{ display: 'flex', gap: 6, zIndex: 2 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5f56' }} />
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffbd2e' }} />
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#27c93f' }} />
            </div>
            {/* Title */}
            <div 
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                color: 'var(--fg-muted)',
                fontWeight: 600,
                fontFamily: 'Courier New, Courier, monospace',
                zIndex: 2,
              }}
            >
              auth-session.sh
            </div>
          </div>

          {/* Terminal Form Body */}
          <div style={{ padding: '32px 28px 28px 28px', position: 'relative', zIndex: 2 }}>
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
                Sign In
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
                Register
              </button>
            </div>

            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.375rem', color: 'var(--fg)', margin: '0 0 6px' }}>
              {isRegister ? 'Create New Account' : 'Welcome Back'}
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--fg-muted)', margin: '0 0 28px' }}>
              {isRegister ? 'Registration requires admin approval' : 'Sign in to your account'}
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
                {isRegister ? (loading ? 'Registering…' : 'Register') : (loading ? 'Signing in…' : 'Sign In')}
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
                About & Release Notes
              </button>
            </div>
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
