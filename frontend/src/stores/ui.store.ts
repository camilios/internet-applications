import { create } from "zustand"
import { persist } from "zustand/middleware"

interface UiState {
  sidebarOpen: boolean
  theme: "light" | "dark" | "system"
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setTheme: (theme: "light" | "dark" | "system") => void
}

/** على الموبايل السايدبار يبدأ مقفول عشان ما يغطي الصفحة */
const getInitialSidebarOpen = () =>
  typeof window === "undefined" ? true : window.innerWidth >= 768

/**
 * Global UI state only.
 * Never put server data here.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: getInitialSidebarOpen(),
      theme: "system",
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "ui-storage",
      partialize: (state) => ({ theme: state.theme }), // only persist theme
    }
  )
)
