import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

// Switches between light and dark. Shows the mode it will switch to, so the icon
// is an action rather than a status. Until it is used, the app follows the OS.
export default function ThemeToggle({ className = '', size = 17 }) {
  const { resolved, toggle } = useTheme()
  const next = resolved === 'dark' ? 'light' : 'dark'
  return <button
    type="button"
    className={`theme-toggle ${className}`.trim()}
    onClick={toggle}
    title={`Switch to ${next} mode`}
    aria-label={`Switch to ${next} mode`}
  >
    {resolved === 'dark' ? <Sun size={size} /> : <Moon size={size} />}
  </button>
}
