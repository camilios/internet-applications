import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import { LoadingSpinner } from "@/components/feedback/loading-spinner"
import { EmptyState } from "@/components/feedback/empty-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { useOrder, useUpdateOrderStatus } from "@/features/orders/hooks/use-orders"
import { useOrderStatusRealtime } from "@/features/orders/hooks/use-order-realtime"
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from "@/lib/constants/order-status"
import { OrderStatusControl } from "@/features/orders/components/order-status-control"
import { ROLES } from "@/lib/constants/roles"
import { formatCurrency, formatDate } from "@/lib/utils/format"

export const Route = createFileRoute("/_authenticated/orders/$orderId")({
  component: OrderDetailsPage,
})

function OrderDetailsPage() {
  const { orderId } = Route.useParams()
  const id = Number(orderId)
  const isAdmin = useAuthStore((state) => state.user?.role === ROLES.ADMIN)
  const { data: order, isLoading, error } = useOrder(id)
  useOrderStatusRealtime(order)
  const updateStatus = useUpdateOrderStatus(id)

  if (isLoading) return <LoadingSpinner text="جاري تحميل الطلب..." />
  if (error || !order) {
    return (
      <EmptyState
        title="تعذر العثور على الطلب"
        description={error?.message ?? "الطلب غير موجود أو لا تملك صلاحية عرضه."}
        action={<Button asChild variant="outline"><Link to="/orders">العودة للطلبات</Link></Button>}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`تفاصيل الطلب #${order.id}`}
        description={`تاريخ الطلب: ${formatDate(order.created_at)}`}
        actions={<Button asChild variant="outline">
          <Link to="/orders"><ArrowRight className="ml-2 h-4 w-4" />العودة</Link>
        </Button>}
      />
      <Card>
        <CardHeader>
          <CardTitle>ملخص الطلب</CardTitle>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">الحالة</p>
            <span className={`mt-1 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${ORDER_STATUS_COLORS[order.status]}`}>
              {ORDER_STATUS_LABELS[order.status]}
            </span>
          </div>
          {isAdmin && order.user && (
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">الزبون</p>
              <p className="break-words font-medium">{order.user.name}</p>
              <p className="break-all text-sm text-muted-foreground">{order.user.email}</p>
            </div>
          )}
          <div>
            <p className="text-sm text-muted-foreground">الإجمالي</p>
            <p className="break-words font-semibold">{formatCurrency(order.total)}</p>
          </div>
        </CardContent>
        {isAdmin && (
          <OrderStatusControl status={order.status} isPending={updateStatus.isPending} onStatusChange={(status) => updateStatus.mutate(status)} />
        )}
      </Card>
      <Card>
        <CardHeader><CardTitle>عناصر الطلب</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {order.items.map((item) => (
            <div key={item.id} className="flex min-w-0 flex-col gap-3 border-b pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex min-w-0 items-center gap-3">
                {item.product.image_url && (
                  <img src={item.product.image_url} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
                )}
                <div className="min-w-0">
                  <p className="break-words font-medium">{item.product.name}</p>
                  <p className="break-words text-sm text-muted-foreground">
                    {formatCurrency(item.unit_price)} × {item.quantity}
                  </p>
                </div>
              </div>
              <p className="break-words font-semibold sm:shrink-0">{formatCurrency(item.subtotal)}</p>
            </div>
          ))}
          <div className="flex flex-wrap justify-between gap-2 border-t pt-4 font-bold">
            <span>الإجمالي</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
