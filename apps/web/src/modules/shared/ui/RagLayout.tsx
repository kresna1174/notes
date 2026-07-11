import { Sidebar } from '#/modules/sidebar'
import { Link } from '@tanstack/react-router'
import { Library, FileStack, Search, MessageSquare, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useState, useEffect } from 'react'
import { UploadMenu } from './UploadMenu'

export function RagLayout({ children }: { children: React.ReactNode }) {
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const navItems = [
    { to: '/documents', label: 'Documents', icon: Library },
    { to: '/documents/pages', label: 'Pages', icon: FileStack },
    { to: '/search', label: 'Search', icon: Search },
    { to: '/ask-agent', label: 'Ask AI', icon: MessageSquare },
  ] as const

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Mobile Toggle Button */}
      {isMobile && (
        <button
          onClick={() => setIsOpen(true)}
          title="Tampilkan sidebar"
          style={{
            position: 'fixed',
            top: 16,
            left: 16,
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            border: '1px solid var(--border)',
            borderRadius: 7,
            background: 'var(--bg)',
            color: 'var(--fg-muted)',
            cursor: 'pointer',
          }}
        >
          <Menu size={15} />
        </button>
      )}

      {/* Mobile Sidebar Overlay */}
      {isMobile && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.3)',
            backdropFilter: 'blur(3px)',
            zIndex: 48,
            opacity: isOpen ? 1 : 0,
            pointerEvents: isOpen ? 'auto' : 'none',
            transition: 'opacity 0.2s ease',
          }}
        />
      )}

      {/* Sidebar Wrapper */}
      <div
        style={
          isMobile
            ? {
                position: 'fixed',
                top: 0,
                bottom: 0,
                left: 0,
                zIndex: 49,
                transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
                transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }
            : {
                width: sidebarVisible ? undefined : 0,
                overflow: 'hidden',
                transition: 'width 0.2s ease',
                flexShrink: 0,
              }
        }
      >
        <Sidebar activeNoteId={null} />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden flex flex-col" style={{ background: 'var(--bg-app)', position: 'relative' }}>
        {/* Desktop Sidebar Toggle Button */}
        {!isMobile && (
          <button
            onClick={() => setSidebarVisible((v) => !v)}
            title={sidebarVisible ? 'Sembunyikan sidebar' : 'Tampilkan sidebar'}
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              zIndex: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              border: '1px solid var(--border)',
              borderRadius: 7,
              background: 'var(--bg)',
              color: 'var(--fg-muted)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary)'
              e.currentTarget.style.color = 'var(--primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color = 'var(--fg-muted)'
            }}
          >
            {sidebarVisible ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>
        )}

        {/* Sticky Action Bar */}
        <header
          className="sticky top-0 z-30 border-b flex items-center justify-between gap-4"
          style={{
            background: 'var(--bg)',
            borderColor: 'var(--border)',
            padding: isMobile ? '12px 16px' : '16px 60px',
            paddingLeft: isMobile ? '64px' : '64px', // align beautifully with the toggle button
            minHeight: '63px',
          }}
        >
          {/* Header left title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-heading)' }}>
              RAG Engine
            </span>
          </div>

          {/* Navigation links */}
          <nav className="flex items-center gap-1 rounded-md p-1" style={{ background: 'var(--input-bg)' }}>
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === '/documents' }}
                activeProps={{
                  style: { background: 'var(--bg)', color: 'var(--fg)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
                }}
                inactiveProps={{
                  style: { color: 'var(--fg-muted)' },
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition hover:opacity-90"
              >
                <item.icon size={13} aria-hidden="true" />
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Upload Button */}
          <UploadMenu />
        </header>

        {/* Scrollable Workspace Pane */}
        <div
          className="flex-1 overflow-y-auto"
          style={{
            padding: isMobile ? '24px 16px 40px' : '40px 60px',
            background: 'var(--bg-app)',
          }}
        >
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
