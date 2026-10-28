import type { ReactNode } from "react"
import { QueryProvider } from "./query-provider"
import { ThemeProvider } from "./theme-provider"
import { Toaster } from "sonner"
import { GlobalSpinner } from "@/components/feedback/global-spinner"

/**
 * All app-level providers in one place.
 * GlobalSpinner هنا عشان يظهر حتى في صفحات Login/Register.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        {children}
        <GlobalSpinner />
        <Toaster
          position="top-center"
          richColors
          closeButton
          dir="rtl"
          toastOptions={{
            classNames: {
              toast: "font-sans",
            },
          }}
        />
      </QueryProvider>
    </ThemeProvider>
  )
}
