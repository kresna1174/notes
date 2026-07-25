import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuth } from '#/modules/shared/auth'
import { useTheme } from '#/modules/shared/theme'
import { Eye, EyeOff, Brain, Check, AlertTriangle, Loader2 } from 'lucide-react'
import { AboutModal } from '#/modules/auth'
import { authClient } from '#/modules/shared/auth-client'

export const Route = createFileRoute('/login/')({
  validateSearch: (search: Record<string, unknown>) => ({
    error: (search.error as string) ?? null,
  }),
  component: LoginPage,
})

function LoginPage() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const search = useSearch({ from: '/login/' })
  const { theme } = useTheme()
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        minHeight: '100vh',
        width: '100vw',
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--bg-app)',
      }}
    >

      {/* Left Panel — Image with overlay */}
      <div
        className="hidden md:flex md:w-[48%] lg:w-[50%] flex-col justify-between relative overflow-hidden"
        style={{
          background: isDark ? '#030303' : '#fafafa',
          borderRight: '1px solid var(--border)',
          padding: '48px',
        }}
      >
        {/* Background Image with cover and premium dimming */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: isDark ? 'url(/login_illustration.jpg)' : 'url(/login_illustration_light.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: isDark ? 0.78 : 0.85,
            zIndex: 1,
          }}
        />

        {/* Gradient Overlay for text contrast */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: isDark
              ? 'linear-gradient(to top, rgba(3,3,3,0.92) 0%, rgba(3,3,3,0.2) 50%, rgba(3,3,3,0.6) 100%)'
              : 'linear-gradient(to top, rgba(250,250,250,0.92) 0%, rgba(250,250,250,0.2) 50%, rgba(250,250,250,0.6) 100%)',
            zIndex: 2,
          }}
        />

        {/* Content Container */}
        <div
          style={{
            zIndex: 3,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            justifyContent: 'space-between',
          }}
        >
          {/* Brand Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Brain size={24} style={{ color: '#10b981' }} />
            <span style={{ fontSize: '1rem', fontWeight: 700, color: isDark ? '#ffffff' : '#030303', fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}>
              Mindspace
            </span>
          </div>

          {/* Tagline */}
          <div style={{ maxWidth: '440px' }}>
            <h2
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '2rem',
                fontWeight: 700,
                lineHeight: 1.25,
                color: isDark ? '#ffffff' : '#030303',
                letterSpacing: '-0.03em',
                margin: '0 0 12px',
              }}
            >
              Your ideas, beautifully organised with AI.
            </h2>
            <p
              style={{
                fontSize: '0.925rem',
                color: isDark ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.65)',
                lineHeight: 1.5,
                margin: 0,
                fontFamily: 'var(--font-body)',
              }}
            >
              A unified workspace for your thoughts, concept wiki maps, collaborative documents, and semantic RAG indexing.
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Card */}
      <div
        className="flex-1 flex items-center justify-center p-6 md:p-12 relative"
        style={{
          background: isDark ? '#030303' : '#fafafa',
          backgroundImage: isDark
            ? 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)'
            : 'radial-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        {/* Ambient Glow behind login card */}
        <div
          style={{
            position: 'absolute',
            width: '380px',
            height: '380px',
            background: isDark
              ? 'radial-gradient(circle, rgba(16, 185, 129, 0.10) 0%, rgba(16, 185, 129, 0.02) 50%, transparent 100%)'
              : 'radial-gradient(circle, rgba(16, 185, 129, 0.06) 0%, rgba(16, 185, 129, 0.01) 50%, transparent 100%)',
            filter: 'blur(70px)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />

        {/* Glass Login Card */}
        <div
          style={{
            zIndex: 10,
            position: 'relative',
            width: '100%',
            maxWidth: '400px',
            borderRadius: '16px',
            background: isDark ? 'rgba(15, 15, 20, 0.72)' : 'rgba(255, 255, 255, 0.85)',
            border: '1px solid var(--border)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            boxShadow: isDark ? '0 30px 70px rgba(0,0,0,0.5)' : '0 30px 70px rgba(0,0,0,0.06)',
            padding: '32px 24px',
            animation: 'fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
          }}
        >
          {/* Logo on mobile only (hidden on md screens since brand is on left) */}
          <div
            className="flex md:hidden"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'var(--accent)',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px',
              border: '1px solid var(--border)',
            }}
          >
            <Brain size={20} style={{ color: '#10b981' }} />
          </div>

          {showForgot ? (
            /* Forgot Password Section */
            <div>
              <h1
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '1.65rem',
                  fontWeight: 700,
                  color: 'var(--fg)',
                  letterSpacing: '-0.025em',
                  margin: '0 0 6px',
                }}
              >
                Reset your password
              </h1>
              <p
                style={{
                  fontSize: '0.875rem',
                  color: 'var(--fg-muted)',
                  margin: '0 0 16px',
                  lineHeight: 1.4,
                }}
              >
                Enter your account email and we'll send you a reset link.
              </p>

              {forgotMsg && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'start',
                    gap: 10,
                    padding: '12px 14px',
                    background: 'rgba(34,197,94,0.08)',
                    border: '1px solid rgba(34,197,94,0.2)',
                    borderRadius: 8,
                    fontSize: '0.8125rem',
                    color: '#22c55e',
                    marginBottom: 20,
                  }}
                >
                  <Check size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{forgotMsg}</span>
                </div>
              )}

              {forgotError && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'start',
                    gap: 10,
                    padding: '12px 14px',
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: 8,
                    fontSize: '0.8125rem',
                    color: '#ef4444',
                    marginBottom: 20,
                  }}
                >
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{forgotError}</span>
                </div>
              )}

              {!forgotMsg && (
                <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label
                      htmlFor="forgot-email"
                      style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}
                    >
                      Email Address
                    </label>
                    <ForgotPasswordInput value={forgotEmail} onChange={setForgotEmail} isDark={isDark} />
                  </div>

                  <button
                    type="submit"
                    disabled={forgotLoading}
                    style={{
                      marginTop: 8,
                      padding: '12px 16px',
                      background: 'var(--fg)',
                      color: 'var(--bg)',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: forgotLoading ? 'not-allowed' : 'pointer',
                      opacity: forgotLoading ? 0.7 : 1,
                      transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                      width: '100%',
                    }}
                    onMouseEnter={e => {
                      if (!forgotLoading) e.currentTarget.style.opacity = '0.9'
                    }}
                    onMouseLeave={e => {
                      if (!forgotLoading) e.currentTarget.style.opacity = '1'
                    }}
                  >
                    {forgotLoading ? <Loader2 size={16} className="animate-spin" style={{ margin: '0 auto' }} /> : 'Send reset link'}
                  </button>
                </form>
              )}

              <button
                type="button"
                onClick={() => setShowForgot(false)}
                style={{
                  marginTop: 20,
                  display: 'block',
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  fontSize: '0.8125rem',
                  color: 'var(--fg-muted)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  textAlign: 'center',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-muted)')}
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            /* Main Login / Register Section */
            <div>
              <h1
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '1.85rem',
                  fontWeight: 700,
                  color: 'var(--fg)',
                  letterSpacing: '-0.03em',
                  margin: '0 0 6px',
                }}
              >
                {isRegister ? 'Welcome to Mindspace' : 'Welcome back'}
              </h1>
              <p
                style={{
                  fontSize: '0.875rem',
                  color: 'var(--fg-muted)',
                  margin: '0 0 28px',
                  lineHeight: 1.4,
                }}
              >
                {isRegister ? 'Create an account to get started' : 'Sign in to your account'}
              </p>

              {/* OAuth Error Display */}
              {search.error && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'start',
                    gap: 10,
                    padding: '12px 14px',
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: 8,
                    fontSize: '0.8125rem',
                    color: '#ef4444',
                    marginBottom: 16,
                  }}
                >
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{search.error === 'oauth_failed' ? 'OAuth login failed. Please try again.' : search.error}</span>
                </div>
              )}

              {/* Social Logins */}
              <div style={{ display: 'flex', flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                <button
                  type="button"
                  onClick={() => authClient.signIn.social({ provider: 'google', callbackURL: '/' })}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '10px 14px',
                    background: isDark ? '#121214' : '#ffffff',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    color: 'var(--fg)',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'background-color 0.2s, border-color 0.2s',
                    outline: 'none',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--muted)'
                    e.currentTarget.style.borderColor = 'var(--fg-subtle)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = isDark ? '#121214' : '#ffffff'
                    e.currentTarget.style.borderColor = 'var(--border)'
                  }}
                >
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.53-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C17.955 2.192 15.34 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.478 0 10.793-4.537 10.793-10.982 0-.74-.08-1.302-.176-1.865H12.24z"
                    />
                  </svg>
                  Google
                </button>

                <button
                  type="button"
                  onClick={() => authClient.signIn.social({ provider: 'github', callbackURL: '/' })}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '10px 14px',
                    background: isDark ? '#121214' : '#ffffff',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    color: 'var(--fg)',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'background-color 0.2s, border-color 0.2s',
                    outline: 'none',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--muted)'
                    e.currentTarget.style.borderColor = 'var(--fg-subtle)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = isDark ? '#121214' : '#ffffff'
                    e.currentTarget.style.borderColor = 'var(--border)'
                  }}
                >
                  <svg aria-hidden="true" width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                  </svg>
                  GitHub
                </button>
              </div>

              {/* Divider OR */}
              <div style={{ display: 'flex', alignItems: 'center', margin: '12px 0 12px', gap: 12 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: '0.6875rem', color: 'var(--fg-subtle)', fontWeight: 600, letterSpacing: '0.05em' }}>OR CONTINUE WITH</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>

              {successMsg && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'start',
                    gap: 10,
                    padding: '12px 14px',
                    background: 'rgba(34,197,94,0.08)',
                    border: '1px solid rgba(34,197,94,0.2)',
                    borderRadius: 8,
                    fontSize: '0.8125rem',
                    color: '#22c55e',
                    marginBottom: 16,
                  }}
                >
                  <Check size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{successMsg}</span>
                </div>
              )}

              <form
                onSubmit={isRegister ? handleRegister : handleSubmit}
                autoComplete="off"
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <div>
                  <label
                    htmlFor="login-username"
                    style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--fg)', marginBottom: 8 }}
                  >
                    Username
                  </label>
                  <UsernameInput value={username} onChange={setUsername} isDark={isDark} />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label htmlFor="login-password" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--fg)' }}>
                      Password
                    </label>
                    {!isRegister && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowForgot(true)
                          setForgotMsg(null)
                          setForgotError(null)
                          setForgotEmail('')
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '0.75rem',
                          color: 'var(--fg-muted)',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-body)',
                          transition: 'color 0.2s',
                          padding: 0,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-muted)')}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <PasswordInput value={password} onChange={setPassword} showPw={showPw} setShowPw={setShowPw} isRegister={isRegister} isDark={isDark} />
                </div>

                {error && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'start',
                      gap: 10,
                      padding: '12px 14px',
                      background: 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      borderRadius: 8,
                      fontSize: '0.8125rem',
                      color: '#ef4444',
                    }}
                  >
                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    marginTop: 8,
                    padding: '12px 16px',
                    background: 'var(--fg)',
                    color: 'var(--bg)',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    fontFamily: 'var(--font-body)',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    width: '100%',
                  }}
                  onMouseEnter={e => {
                    if (!loading) {
                      e.currentTarget.style.opacity = '0.9'
                      e.currentTarget.style.transform = 'translateY(-1px)'
                      e.currentTarget.style.boxShadow = isDark ? '0 4px 20px rgba(255, 255, 255, 0.15)' : '0 4px 20px rgba(0, 0, 0, 0.12)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!loading) {
                      e.currentTarget.style.opacity = '1'
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = 'none'
                    }
                  }}
                >
                  {isRegister ? (
                    loading ? (
                      <Loader2 size={16} className="animate-spin" style={{ margin: '0 auto' }} />
                    ) : (
                      'Sign Up'
                    )
                  ) : loading ? (
                    <Loader2 size={16} className="animate-spin" style={{ margin: '0 auto' }} />
                  ) : (
                    'Sign In'
                  )}
                </button>
              </form>

              {/* Bottom Link to toggle Register/Login */}
              <div style={{ marginTop: 16, textAlign: 'center', fontSize: '0.8125rem', color: 'var(--fg-muted)', fontFamily: 'var(--font-body)' }}>
                {isRegister ? (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegister(false)
                        setError(null)
                        setSuccessMsg(null)
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--fg)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                      onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                    >
                      Sign in
                    </button>
                  </>
                ) : (
                  <>
                    Don't have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegister(true)
                        setError(null)
                        setSuccessMsg(null)
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--fg)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                      onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                    >
                      Sign up
                    </button>
                  </>
                )}
              </div>

              {/* Info release notes */}
              <div style={{ marginTop: 20, textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowAbout(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '0.75rem',
                    color: 'var(--fg-muted)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    fontFamily: 'var(--font-body)',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg-muted)')}
                >
                  About & Release Notes
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <AboutModal open={showAbout} onOpenChange={setShowAbout} />

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(24px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}

/* Local input components to encapsulate focus state easily */

function UsernameInput({ value, onChange, isDark }: { value: string; onChange: (v: string) => void; isDark: boolean }) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      id="login-username"
      autoFocus
      type="text"
      value={value}
      required
      onChange={e => onChange(e.target.value)}
      placeholder="Enter your username"
      autoComplete="username"
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '10px 14px',
        fontSize: '0.875rem',
        fontFamily: 'var(--font-body)',
        border: focused ? '1px solid var(--primary)' : '1px solid var(--border)',
        boxShadow: focused ? '0 0 0 2px var(--accent)' : 'none',
        borderRadius: 8,
        outline: 'none',
        color: 'var(--fg)',
        background: isDark ? '#0c0c0e' : '#ffffff',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  )
}

function PasswordInput({
  value,
  onChange,
  showPw,
  setShowPw,
  isRegister,
  isDark,
}: {
  value: string
  onChange: (v: string) => void
  showPw: boolean
  setShowPw: (v: boolean) => void
  isRegister: boolean
  isDark: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input
        id="login-password"
        type={showPw ? 'text' : 'password'}
        value={value}
        required
        onChange={e => onChange(e.target.value)}
        placeholder="Enter your password"
        autoComplete={isRegister ? 'new-password' : 'current-password'}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '10px 36px 10px 14px',
          fontSize: '0.875rem',
          fontFamily: 'var(--font-body)',
          border: focused ? '1px solid var(--primary)' : '1px solid var(--border)',
          boxShadow: focused ? '0 0 0 2px var(--accent)' : 'none',
          borderRadius: 8,
          outline: 'none',
          color: 'var(--fg)',
          background: isDark ? '#0c0c0e' : '#ffffff',
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <button
        type="button"
        onClick={() => setShowPw(!showPw)}
        aria-label={showPw ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute',
          right: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 8,
          color: 'var(--fg-subtle)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}

function ForgotPasswordInput({ value, onChange, isDark }: { value: string; onChange: (v: string) => void; isDark: boolean }) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      id="forgot-email"
      type="email"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="you@example.com"
      required
      autoFocus
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '10px 14px',
        fontSize: '0.875rem',
        fontFamily: 'var(--font-body)',
        border: focused ? '1px solid var(--primary)' : '1px solid var(--border)',
        boxShadow: focused ? '0 0 0 2px var(--accent)' : 'none',
        borderRadius: 8,
        outline: 'none',
        color: 'var(--fg)',
        background: isDark ? '#0c0c0e' : '#ffffff',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  )
}
