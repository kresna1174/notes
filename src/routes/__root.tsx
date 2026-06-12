import { Outlet, createRootRoute, useNavigate, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { AuthProvider, useAuth } from '../lib/auth'
import { ThemeProvider } from '../lib/theme'
import { useEffect } from 'react'
import '../styles.css'

export const Route = createRootRoute({
  component: RootComponent,
})

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useRouterState({ select: s => s.location.pathname })

  const isPublic = location.startsWith('/share/')

  useEffect(() => {
    if (loading || isPublic) return
    if (!user && location !== '/login') {
      navigate({ to: '/login' })
    }
    if (user && location === '/login') {
      navigate({ to: '/' })
    }
  }, [loading, user, location, isPublic])

  if (isPublic) return <>{children}</>

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #e9ecef', borderTopColor: '#3b5bdb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // not logged in and not on login page — render nothing, effect handles redirect
  if (!user && location !== '/login') return null

  return <>{children}</>
}

function RootComponent() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <AuthGuard>
        <Outlet />
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[{ name: 'TanStack Router', render: <TanStackRouterDevtoolsPanel /> }]}
        />
      </AuthGuard>
    </AuthProvider>
    </ThemeProvider>
  )
}
