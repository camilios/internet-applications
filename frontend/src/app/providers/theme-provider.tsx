import { createContext, useContext, useEffect, type ReactNode } from "react"
import { useUiStore } from "@/stores/ui.store"

type Theme = "dark" | "light" | "system"

interface ThemeProviderProps {
  children: ReactNode
}

interface ThemeProviderState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined)

/**
 * الـ Provider دايماً موجود (ما في gate على mounted)،
 * لأن zustand persist يقرأ localStorage بشكل متزامن.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)

  useEffect(() => {
    const root = window.document.documentElement
    const media = window.matchMedia("(prefers-color-scheme: dark)")

    const apply = () => {
      const resolved = theme === "system" ? (media.matches ? "dark" : "light") : theme
      root.classList.remove("light", "dark")
      root.classList.add(resolved)
    }

    apply()

    // نتابع تغيير النظام فقط لما يكون الوضع "system"
    if (theme !== "system") return
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [theme])

  return (
    <ThemeProviderContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeProviderContext)
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
