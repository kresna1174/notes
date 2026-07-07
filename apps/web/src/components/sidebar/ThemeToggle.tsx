import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../lib/theme'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()

  const isDark = theme === 'dark'
  const icon = isDark ? <Sun size={14} /> : <Moon size={14} />
  const title = isDark ? 'Ubah ke mode terang' : 'Ubah ke mode gelap'

  return (
    <button
      onClick={toggle}
      title={title}
      style={{
        width: 28, height: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6, border: 'none', cursor: 'pointer',
        background: 'transparent', color: 'var(--fg-muted)',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = 'var(--primary)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-muted)' }}
    >
      {icon}
    </button>
  )
}
