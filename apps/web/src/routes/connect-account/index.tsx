import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuth } from '#/modules/shared/auth'
import { Sidebar } from '#/modules/sidebar'
import { useState } from 'react'
import { authClient } from '#/modules/shared/auth-client'

export const Route = createFileRoute('/connect-account/')({
  beforeLoad: ({ context }) => {
    if (!context.auth.user) {
      throw redirect({ to: '/login', search: { error: '' } })
    }
  },
  component: ConnectAccountPage,
})

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
}

const ALL_PROVIDERS = ['google', 'github']

function ConnectAccountPage() {
  const { user } = useAuth()
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (!user) return null

  const isOnlyAuthMethod = !user.hasPassword && user.connectedProviders.length <= 1

  async function handleDisconnect(provider: string) {
    setDisconnecting(provider)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/oauth/accounts/${provider}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to disconnect')
      } else {
        setSuccess(`${PROVIDER_LABELS[provider]} disconnected.`)
        // Refresh page to update connectedProviders
        window.location.reload()
      }
    } finally {
      setDisconnecting(null)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-app)' }}>
      <Sidebar activeNoteId={null} />
      <main style={{ flex: 1, padding: '40px 48px', maxWidth: 640 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--fg)', marginBottom: 32 }}>
          Connect Account
        </h1>

        {/* Account Section */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
            Account
          </h2>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--fg-muted)' }}>Username</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--fg)' }}>{user.username}</span>
            </div>
            <div style={{ height: 1, background: 'var(--border)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--fg-muted)' }}>Email</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--fg)' }}>
                {user.email ?? <span style={{ color: 'var(--fg-subtle)' }}>—</span>}
              </span>
            </div>
            <div style={{ height: 1, background: 'var(--border)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--fg-muted)' }}>Role</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--fg)', textTransform: 'capitalize' }}>{user.role}</span>
            </div>
          </div>
        </section>

        {/* Connected Accounts Section */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
            Connected Accounts
          </h2>

          {error && (
            <div style={{ padding: '9px 13px', background: 'rgba(224,49,49,0.08)', border: '1px solid rgba(224,49,49,0.25)', borderRadius: 8, fontSize: '0.8375rem', color: '#e03131', marginBottom: 16 }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ padding: '9px 13px', background: 'rgba(43,138,62,0.08)', border: '1px solid rgba(43,138,62,0.25)', borderRadius: 8, fontSize: '0.8375rem', color: '#2b8a3e', marginBottom: 16 }}>
              {success}
            </div>
          )}

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {ALL_PROVIDERS.map((provider, i) => {
              const connected = user.connectedProviders.includes(provider)
              return (
                <div key={provider}>
                  {i > 0 && <div style={{ height: 1, background: 'var(--border)' }} />}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--fg)' }}>
                      {PROVIDER_LABELS[provider]}
                    </span>
                    {connected ? (
                      <button
                        onClick={() => handleDisconnect(provider)}
                        disabled={disconnecting === provider || isOnlyAuthMethod}
                        title={isOnlyAuthMethod ? 'Set a password before disconnecting your only login method' : undefined}
                        style={{
                          padding: '6px 14px', borderRadius: 6,
                          background: 'transparent', border: '1px solid var(--border)',
                          color: 'var(--fg-muted)', fontSize: '0.8125rem', fontWeight: 500,
                          cursor: (disconnecting === provider || isOnlyAuthMethod) ? 'not-allowed' : 'pointer',
                          opacity: (disconnecting === provider || isOnlyAuthMethod) ? 0.4 : 1,
                        }}
                      >
                        {disconnecting === provider ? 'Disconnecting…' : 'Disconnect'}
                      </button>
                    ) : (
                      <button
                        onClick={() => authClient.signIn.social({ provider: provider as 'google' | 'github', callbackURL: '/connect-account' })}
                        style={{
                          padding: '6px 14px', borderRadius: 6,
                          background: 'var(--primary)', border: 'none',
                          color: 'var(--primary-fg)', fontSize: '0.8125rem', fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}
