import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'

export function SearchBar() {
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    setIsMac(navigator.userAgent.indexOf('Mac') !== -1)
  }, [])

  const handleOpenSearch = () => {
    window.dispatchEvent(new CustomEvent('open-search-palette'))
  }

  return (
    <div className="px-3 pb-3">
      <div 
        onClick={handleOpenSearch}
        className="relative cursor-pointer group"
      >
        <Search 
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors" 
          style={{ color: 'var(--fg-subtle)' }} 
        />
        <div
          className="w-full pl-8 pr-12 h-8 text-sm rounded-lg outline-none transition-all flex items-center"
          style={{
            background: 'var(--input-bg)',
            color: 'var(--fg-muted)',
            border: '1px solid transparent',
            fontSize: '0.8125rem',
            fontFamily: 'var(--font-body)',
            userSelect: 'none',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'transparent'
          }}
        >
          Search...
        </div>
        <div 
          className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" 
          style={{ 
            fontSize: '0.625rem', 
            color: 'var(--fg-subtle)', 
            background: 'var(--bg-muted)', 
            border: '1px solid var(--border)',
            padding: '1px 4px', 
            borderRadius: '4px',
            fontWeight: 500,
            fontFamily: 'var(--font-body)',
          }}
        >
          {isMac ? '⌘K' : 'Ctrl+K'}
        </div>
      </div>
    </div>
  )
}
