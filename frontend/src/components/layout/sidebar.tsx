import { Link, useRouterState } from "@tanstack/react-router"
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react"
import { Dialog } from "radix-ui"
import { cn } from "@/lib/utils/cn"
import { useUiStore } from "@/stores/ui.store"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { useIsDesktop } from "@/hooks/use-media-query"
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
  const mobileSidebarOpen = useUiStore((s) => s.mobileSidebarOpen)
  const setMobileSidebarOpen = useUiStore((s) => s.setMobileSidebarOpen)
  const user = useAuthStore((s) => s.user)
  const isDesktop = useIsDesktop()
  const currentPath = useRouterState({ select: (s) => s.location.pathname })
  const expanded = !isDesktop || sidebarOpen

  const sidebar = (
    <aside
      id="app-sidebar"
      aria-label="القائمة الرئيسية"
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex flex-col border-l bg-card transition-[width] duration-300 motion-reduce:transition-none",
        isDesktop ? (sidebarOpen ? "w-64" : "w-16") : "w-72 max-w-[calc(100vw-2rem)]"
      )}
    >
      {/* Logo */}
      <div className={cn("flex h-16 shrink-0 items-center border-b", expanded ? "justify-between px-4" : "justify-center px-2")}>
        {expanded && (
          isDesktop
            ? <span className="text-lg font-bold tracking-tight">متجرنا</span>
            : <Dialog.Title className="text-lg font-bold tracking-tight">متجرنا</Dialog.Title>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={isDesktop ? toggleSidebar : () => setMobileSidebarOpen(false)}
          className="shrink-0"
          aria-label={!isDesktop ? "إغلاق القائمة" : sidebarOpen ? "طي القائمة" : "فتح القائمة"}
        >
          {!isDesktop ? <X className="h-4 w-4" /> : sidebarOpen ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
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
                aria-label={!expanded ? item.title : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
                onClick={() => !isDesktop && setMobileSidebarOpen(false)}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {expanded && <span>{item.title}</span>}
              </Link>
            )
          })}
      </nav>
    </aside>
  )

  if (isDesktop) return sidebar

  return (
    <Dialog.Root open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
      <Dialog.Portal>
        <Dialog.Overlay data-slot="sidebar-overlay" className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          asChild
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            document.getElementById("sidebar-toggle")?.focus()
          }}
        >
          {sidebar}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
