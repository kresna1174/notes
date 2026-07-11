import type { SVGProps } from 'react'

interface NoteIconProps extends SVGProps<SVGSVGElement> {
  icon: string | null | undefined
  size?: number
}

export function NoteIcon({ icon, size = 20, style, ...props }: NoteIconProps) {
  if (!icon) return null

  const key = icon.trim()

  switch (key) {
    case '📝':
    case 'note':
      return (
        <svg 
          width={size} 
          height={size} 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          style={{ display: 'block', ...style }}
          {...props}
        >
          <defs>
            <linearGradient id="noteGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="url(#noteGrad)" stroke="none" />
          <path d="M14 2v6h6" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="16" y1="13" x2="8" y2="13" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="16" y1="17" x2="8" y2="17" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
          <polyline points="10 9 9 9 8 9" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case '💡':
    case 'idea':
      return (
        <svg 
          width={size} 
          height={size} 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          style={{ display: 'block', ...style }}
          {...props}
        >
          <defs>
            <linearGradient id="bulbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>
          <path 
            d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .6 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" 
            fill="url(#bulbGrad)" 
            stroke="none" 
          />
          <path 
            d="M9 18h6M10 22h4" 
            stroke="#e2e8f0" 
            strokeWidth="2" 
            strokeLinecap="round" 
          />
          <path 
            d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .6 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" 
            stroke="#f59e0b" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />
        </svg>
      )
    case '🚀':
    case 'rocket':
      return (
        <svg 
          width={size} 
          height={size} 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          style={{ display: 'block', ...style }}
          {...props}
        >
          <defs>
            <linearGradient id="rocketGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>
          </defs>
          <path d="M4.5 16.5c-1.5 1.25-2.5 3.5-2.5 3.5s2.25-1 3.5-2.5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
          <path 
            d="M12 2C6.5 2 2 6.5 2 12c0 1.5.5 3 1.5 4.5L12 22l8.5-5.5c1-1.5 1.5-3 1.5-4.5 0-5.5-4-10-10-10z" 
            fill="url(#rocketGrad)" 
            stroke="none" 
          />
          <circle cx="12" cy="10" r="2.5" fill="#ffffff" />
        </svg>
      )
    case '💼':
    case 'work':
      return (
        <svg 
          width={size} 
          height={size} 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          style={{ display: 'block', ...style }}
          {...props}
        >
          <defs>
            <linearGradient id="briefGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
          </defs>
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" fill="url(#briefGrad)" stroke="none" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case '📅':
    case 'calendar':
      return (
        <svg 
          width={size} 
          height={size} 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          style={{ display: 'block', ...style }}
          {...props}
        >
          <defs>
            <linearGradient id="calGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#f43f5e" />
            </linearGradient>
          </defs>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" fill="url(#calGrad)" stroke="none" />
          <line x1="16" y1="2" x2="16" y2="6" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <line x1="8" y1="2" x2="8" y2="6" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <line x1="3" y1="10" x2="21" y2="10" stroke="#ffffff" strokeWidth="1.5" />
        </svg>
      )
    case '⭐':
    case 'star':
      return (
        <svg 
          width={size} 
          height={size} 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          style={{ display: 'block', ...style }}
          {...props}
        >
          <defs>
            <linearGradient id="starGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#facc15" />
              <stop offset="100%" stopColor="#eab308" />
            </linearGradient>
          </defs>
          <polygon 
            points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" 
            fill="url(#starGrad)" 
            stroke="none" 
          />
        </svg>
      )
    default:
      return (
        <div 
          style={{ 
            width: size, 
            height: size, 
            borderRadius: '12px', 
            background: 'linear-gradient(135deg, rgba(168,85,247,0.1), rgba(99,102,241,0.1))',
            border: '1px solid rgba(168,85,247,0.2)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            fontSize: `${size * 0.55}px`,
            lineHeight: 1,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            ...style
          }}
        >
          {key}
        </div>
      )
  }
}
