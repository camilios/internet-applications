import { createRootRoute, Outlet } from "@tanstack/react-router"
import { AppProviders } from "@/app/providers"
import { ErrorBoundary } from "@/components/feedback/error-boundary"

/**
 * Root route – wraps everything with providers and a top-level error boundary.
 * Public routes (login/register) will not use AppShell.
 */
export const Route = createRootRoute({
  component: () => (
    <AppProviders>
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </AppProviders>
  ),
})
