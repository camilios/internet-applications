import { Outlet } from "@tanstack/react-router"
import { Sidebar } from "./sidebar"
import { Header } from "./header"
import { useUiStore } from "@/stores/ui.store"
import { cn } from "@/lib/utils/cn"
import { useIsMobile } from "@/hooks/use-media-query"

/**
 * Main application shell.
 * GlobalSpinner موجود في AppProviders (يغطي كل الصفحات).
 */
export function AppShell() {
  const { sidebarOpen } = useUiStore()
  const isMobile = useIsMobile()

  return (
    <div className="relative flex min-h-screen bg-background">
      <Sidebar />

      <div
        className={cn(
          "flex flex-1 flex-col transition-all duration-300",
          !isMobile && sidebarOpen ? "md:mr-64" : "md:mr-16"
        )}
      >
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
