import { Link, useRouterState } from "@tanstack/react-router"
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils/cn"
import { useUiStore } from "@/stores/ui.store"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { useIsMobile } from "@/hooks/use-media-query"
import { Button } from "@/components/ui/button"
import { ROLES } from "@/lib/constants/roles"

const navItems = [
  { title: "لوحة التحكم", href: "/", icon: LayoutDashboard },
  { title: "المنتجات", href: "/products", icon: Package },
  { title: "الطلبات", href: "/orders", icon: ShoppingCart },
  { title: "المستخدمون", href: "/users", icon: Users, adminOnly: true },
  { title: "الإعدادات", href: "/settings", icon: Settings },
]

export function Sidebar() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen)
  const user = useAuthStore((s) => s.user)
  const isMobile = useIsMobile()
  const currentPath = useRouterState({ select: (s) => s.location.pathname })

  return (
    <>
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex flex-col border-l bg-card transition-all duration-300",
          sidebarOpen ? "w-64" : "w-16",
          isMobile && !sidebarOpen && "translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b px-4">
          {sidebarOpen && (
            <span className="text-lg font-bold tracking-tight">متجرنا</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="shrink-0"
            aria-label={sidebarOpen ? "طي القائمة" : "فتح القائمة"}
          >
            {sidebarOpen ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2">
          {navItems
            .filter((item) => !item.adminOnly || user?.role === ROLES.ADMIN)
            .map((item) => {
              const isActive =
                item.href === "/"
                  ? currentPath === "/"
                  : currentPath === item.href ||
                    currentPath.startsWith(item.href + "/")

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  title={item.title}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  onClick={() => isMobile && setSidebarOpen(false)}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {sidebarOpen && <span>{item.title}</span>}
                </Link>
              )
            })}
        </nav>
      </aside>
    </>
  )
}
