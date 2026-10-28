import { Menu, Moon, Sun, LogOut, Bell } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { authApi } from "@/features/auth/api/auth.api"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { useUiStore } from "@/stores/ui.store"
import { useTheme } from "@/app/providers/theme-provider"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useIsMobile } from "@/hooks/use-media-query"
import { useNotifications, useMarkAllNotificationsRead, useMarkNotificationRead } from "@/features/notifications/hooks/use-notifications"
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/constants/order-status"

function isOrderStatus(value: string): value is OrderStatus {
  return Object.hasOwn(ORDER_STATUS_LABELS, value)
}

export function Header() {
  const { setTheme } = useTheme()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const { data: notifications } = useNotifications()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const unreadCount = notifications?.data.filter((notification) => !notification.read_at).length ?? 0

  const initials =
    user?.name
      ?.split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U"

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch {
      // نكمل الخروج محلياً حتى لو فشل الطلب
    }
    logout()
    navigate({ to: "/login" })
  }

  // نقرأ الوضع الفعلي من الـ DOM، لأن الوضع "system" ما يعطي dark/light مباشرة
  const toggleTheme = () => {
    const isDark = document.documentElement.classList.contains("dark")
    setTheme(isDark ? "light" : "dark")
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {isMobile && (
        <Button variant="ghost" size="icon" onClick={toggleSidebar}>
          <Menu className="h-5 w-5" />
          <span className="sr-only">القائمة</span>
        </Button>
      )}

      <div className="flex-1" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label="الإشعارات">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
                {unreadCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-80" align="end">
          <div className="flex items-center justify-between px-3 py-2">
            <DropdownMenuLabel className="p-0">الإشعارات</DropdownMenuLabel>
            {unreadCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                disabled={markAllRead.isPending}
                onClick={() => markAllRead.mutate()}
              >
                تعليم الكل كمقروء
              </Button>
            )}
          </div>
          <DropdownMenuSeparator />
          {notifications?.data.length ? notifications.data.map((notification) => {
            const status = notification.data.status
            return (
              <DropdownMenuItem
                key={notification.id}
                className="items-start whitespace-normal"
                onSelect={() => {
                  if (!notification.read_at) markRead.mutate(notification.id)
                  void navigate({
                    to: "/orders/$orderId",
                    params: { orderId: String(notification.data.order_id) },
                  })
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    طلب #{notification.data.order_id}
                    {!notification.read_at && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary" />}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {isOrderStatus(status) ? ORDER_STATUS_LABELS[status] : notification.data.message}
                  </span>
                </span>
              </DropdownMenuItem>
            )
          }) : (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">لا توجد إشعارات</p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="icon" onClick={toggleTheme} className="relative">
        <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">تبديل المظهر</span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-9 w-9 rounded-full">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{user?.name}</p>
              <p className="text-xs leading-none text-muted-foreground">
                {user?.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={handleLogout}
          >
            <LogOut className="ml-2 h-4 w-4" />
            تسجيل الخروج
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
