import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Package, ShoppingCart, Users, TrendingUp } from "lucide-react"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { useDashboard } from "@/features/dashboard/hooks/use-dashboard"
import { formatCurrency } from "@/lib/utils/format"
import { ROLES } from "@/lib/constants/roles"
import { LoadingSpinner } from "@/components/feedback/loading-spinner"
import { EmptyState } from "@/components/feedback/empty-state"
import { Button } from "@/components/ui/button"
import { Link } from "@tanstack/react-router"

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardPage,
})

function DashboardPage() {
  const isAdmin = useAuthStore((state) => state.user?.role === ROLES.ADMIN)
  const { data: summary, isLoading, error, refetch } = useDashboard()

  if (isLoading) return <LoadingSpinner text="جاري تحميل لوحة التحكم..." />
  if (error || !summary) {
    return (
      <EmptyState
        title="تعذر تحميل لوحة التحكم"
        description={error?.message ?? "حاول تحديث الصفحة."}
        action={<Button onClick={() => void refetch()}>إعادة المحاولة</Button>}
      />
    )
  }

  const stats = [
    { title: "المنتجات النشطة", value: summary.total_products, icon: Package },
    { title: isAdmin ? "طلبات اليوم" : "طلباتي اليوم", value: summary.orders_today, icon: ShoppingCart },
    ...(isAdmin && summary.total_users !== null
      ? [{ title: "المستخدمون", value: summary.total_users, icon: Users }]
      : []),
    { title: isAdmin ? "إجمالي الطلبات" : "إجمالي طلباتي", value: summary.total_orders, icon: TrendingUp },
  ]

  return (
    <div>
      <PageHeader
        title="لوحة التحكم"
        description="نظرة عامة على أداء المتجر"
      />

      <div className={`grid gap-4 md:grid-cols-2 ${isAdmin ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{isAdmin ? "إجمالي المبيعات" : "إجمالي قيمة طلباتي"}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-2xl font-bold">{formatCurrency(summary.total_sales)}</p>
          <Button asChild variant="outline">
            <Link to="/orders">عرض الطلبات</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
