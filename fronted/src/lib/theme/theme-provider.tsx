import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type ThemeMode = 'dark' | 'light'

const THEME_STORAGE_KEY = 'pm-theme-mode'

type ThemeContextValue = {
  themeMode: ThemeMode
  isDarkTheme: boolean
  setThemeMode: (mode: ThemeMode) => void
  toggleThemeMode: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const getInitialThemeMode = (): ThemeMode => {
  if (typeof window === 'undefined') return 'dark'

  const savedMode = window.localStorage.getItem(THEME_STORAGE_KEY)
  return savedMode === 'light' ? 'light' : 'dark'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialThemeMode)

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode
    document.documentElement.style.colorScheme = themeMode
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode)
  }, [themeMode])

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeMode,
      isDarkTheme: themeMode === 'dark',
      setThemeMode,
      toggleThemeMode: () => setThemeMode((current) => (current === 'dark' ? 'light' : 'dark')),
    }),
    [themeMode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useThemeMode = () => {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useThemeMode must be used within ThemeProvider')
  }

  return context
}
