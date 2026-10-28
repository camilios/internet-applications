import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { User } from "@/types/auth"

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  setAuth: (user: User, token: string) => void
  setUser: (user: User) => void
  logout: () => void
}

/**
 * Auth is the only server-related state we keep in Zustand
 * because we need it synchronously for the API interceptor
 * and for route guards.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      setAuth: (user, token) => {
        set({ user, token, isAuthenticated: true })
      },

      setUser: (user) => set({ user }),

      // persist يتكفل بمسح التخزين عند تغيير الحالة، ما نحتاج removeItem يدوي
      logout: () => {
        set({ user: null, token: null, isAuthenticated: false })
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
