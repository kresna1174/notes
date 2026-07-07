import { Outlet, createRootRouteWithContext, redirect } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { ThemeProvider } from '../lib/theme'
import type { RouterContext } from '../router'
import '../styles.css'

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: ({ location, context }) => {
    const isPublic = location.pathname.startsWith('/share/')
    if (context.auth.loading || isPublic) return

    if (!context.auth.user && location.pathname !== '/login') {
      throw redirect({ to: '/login' })
    }
    if (context.auth.user && location.pathname === '/login') {
      throw redirect({ to: '/' })
    }
  },
  component: RootComponent,
})

function RootComponent() {
  const { auth } = Route.useRouteContext()

  if (auth.loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #e9ecef', borderTopColor: '#3b5bdb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <ThemeProvider>
      <Outlet />
      <TanStackDevtools
        config={{ position: 'bottom-right' }}
        plugins={[{ name: 'TanStack Router', render: <TanStackRouterDevtoolsPanel /> }]}
      />
    </ThemeProvider>
  )
}
