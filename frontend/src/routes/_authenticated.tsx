import { createFileRoute, redirect } from "@tanstack/react-router"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { AppShell } from "@/components/layout/app-shell"

/**
 * Layout route for all authenticated pages.
 * Protects children and renders the AppShell (which contains <Outlet />).
 */
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ location }) => {
    const { isAuthenticated } = useAuthStore.getState()
    if (!isAuthenticated) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      })
    }
  },
  component: AppShell,
})
