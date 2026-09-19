import { useCallback, useEffect, useState } from 'react'

export const THEME_KEY = 'rsf-theme'

// 'system' follows the operating system; 'light' and 'dark' pin it. Only an explicit
// choice is stored, so a user who never touches the toggle keeps following their OS.
export function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    // Private mode or blocked storage: fall back to the system preference.
    return 'system'
  }
}

export function applyTheme(theme) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

function systemPrefersDark() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}

export function useTheme() {
  const [theme, setTheme] = useState(readStoredTheme)
  // What the user actually sees right now, which is what the toggle icon reflects.
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia('(prefers-color-scheme: dark)')
    const onChange = event => setSystemDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    applyTheme(theme)
    try {
      if (theme === 'system') localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, theme)
    } catch {
      // Nothing to do — the attribute is already applied for this session.
    }
  }, [theme])

  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
  // Toggling from a system-following state pins the opposite of what is on screen.
  const toggle = useCallback(() => setTheme(resolved === 'dark' ? 'light' : 'dark'), [resolved])

  return { theme, resolved, setTheme, toggle }
}
