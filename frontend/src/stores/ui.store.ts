import { create } from "zustand"
import { persist } from "zustand/middleware"

interface UiState {
  sidebarOpen: boolean
  mobileSidebarOpen: boolean
  theme: "light" | "dark" | "system"
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setMobileSidebarOpen: (open: boolean) => void
  toggleMobileSidebar: () => void
  setTheme: (theme: "light" | "dark" | "system") => void
}

/**
 * Global UI state only.
 * Never put server data here.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      mobileSidebarOpen: false,
      theme: "system",
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      toggleMobileSidebar: () => set((s) => ({ mobileSidebarOpen: !s.mobileSidebarOpen })),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "ui-storage",
      partialize: (state) => ({ theme: state.theme }), // only persist theme
    }
  )
)
