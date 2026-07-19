import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export interface AuthUser {
  userId: string
  username: string
  role: 'admin' | 'viewer'
  email: string | null
  hasPassword: boolean
  connectedProviders: string[]
  organizations: { id: string; name: string }[]
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(async r => {
        if (r.ok) return r.json()
        // stale cookie — clear it server-side so browser doesn't keep sending it
        if (r.status === 401) await fetch('/api/auth/logout', { method: 'POST' })
        return null
      })
      .then(data => { setUser(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function login(username: string, password: string): Promise<string | null> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await res.json()
    if (!res.ok) return data.error ?? 'Login failed'
    // Fetch full profile (includes email, hasPassword, connectedProviders)
    const me = await fetch('/api/auth/me').then(r => r.ok ? r.json() : null)
    setUser(me ?? data)
    return null
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }

  async function refresh() {
    const me = await fetch('/api/auth/me').then(r => r.ok ? r.json() : null).catch(() => null)
    if (me) setUser(me)
  }

  return <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
