import { Outlet } from "@tanstack/react-router"
import { useEffect } from "react"
import { Sidebar } from "./sidebar"
import { Header } from "./header"
import { useUiStore } from "@/stores/ui.store"
import { cn } from "@/lib/utils/cn"
import { useIsDesktop } from "@/hooks/use-media-query"
import { useAdminOrderRealtime } from "@/features/orders/hooks/use-order-realtime"

/**
 * Main application shell.
 * GlobalSpinner موجود في AppProviders (يغطي كل الصفحات).
 */
export function AppShell() {
  useAdminOrderRealtime()
  const { sidebarOpen, setMobileSidebarOpen } = useUiStore()
  const isDesktop = useIsDesktop()

  // Drawer state is separate from desktop expansion, so resizing cannot open it.
  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [isDesktop, setMobileSidebarOpen])

  return (
    <div className="relative flex min-h-screen bg-background">
      <Sidebar />

      <div
        className={cn(
          "min-w-0 flex flex-1 flex-col transition-[margin] duration-300 motion-reduce:transition-none",
          isDesktop && (sidebarOpen ? "lg:mr-64" : "lg:mr-16")
        )}
      >
        <Header />
        <main className="min-w-0 flex-1 p-4 sm:p-6 xl:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
