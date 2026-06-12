import { Moon, Sun, Beer, Atom } from 'lucide-react'
import { useTheme } from '../../lib/theme'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()

  let icon = <Moon size={14} />
  let title = 'Switch to dark mode'

  if (theme === 'dark') {
    icon = <Beer size={14} />
    title = 'Switch to Homebrew theme'
  } else if (theme === 'homebrew') {
    icon = <Atom size={14} />
    title = 'Switch to Reactor theme'
  } else if (theme === 'reactor') {
    icon = <Sun size={14} />
    title = 'Switch to light mode'
  }

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
