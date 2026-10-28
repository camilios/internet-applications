import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import { LoadingSpinner } from "@/components/feedback/loading-spinner"
import { EmptyState } from "@/components/feedback/empty-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { useOrder, useUpdateOrderStatus } from "@/features/orders/hooks/use-orders"
import { ORDER_STATUS, ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/constants/order-status"
import { ROLES } from "@/lib/constants/roles"
import { formatCurrency, formatDate } from "@/lib/utils/format"

export const Route = createFileRoute("/_authenticated/orders/$orderId")({
  component: OrderDetailsPage,
})

const nextStatuses: Record<OrderStatus, OrderStatus[]> = {
  pending: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED],
  confirmed: [ORDER_STATUS.PROCESSING, ORDER_STATUS.CANCELLED],
  processing: [ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELLED],
  shipped: [ORDER_STATUS.DELIVERED],
  delivered: [],
  cancelled: [],
}

function OrderDetailsPage() {
  const { orderId } = Route.useParams()
  const id = Number(orderId)
  const isAdmin = useAuthStore((state) => state.user?.role === ROLES.ADMIN)
  const { data: order, isLoading, error } = useOrder(id)
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

  const statusOptions = nextStatuses[order.status]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title={`تفاصيل الطلب #${order.id}`} description={`تاريخ الطلب: ${formatDate(order.created_at)}`} />
        <Button asChild variant="outline">
          <Link to="/orders"><ArrowRight className="ml-2 h-4 w-4" />العودة</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>ملخص الطلب</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">الحالة</p>
            <span className={`mt-1 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${ORDER_STATUS_COLORS[order.status]}`}>
              {ORDER_STATUS_LABELS[order.status]}
            </span>
          </div>
          {isAdmin && order.user && (
            <div>
              <p className="text-sm text-muted-foreground">الزبون</p>
              <p className="font-medium">{order.user.name} ({order.user.email})</p>
            </div>
          )}
          <div>
            <p className="text-sm text-muted-foreground">الإجمالي</p>
            <p className="font-semibold">{formatCurrency(order.total)}</p>
          </div>
        </CardContent>
        {isAdmin && statusOptions.length > 0 && (
          <div className="border-t p-6">
            <label htmlFor="next-order-status" className="mb-2 block text-sm font-medium">تحديث الحالة</label>
            <select
              id="next-order-status"
              defaultValue=""
              disabled={updateStatus.isPending}
              onChange={(event) => {
                if (event.target.value) updateStatus.mutate(event.target.value as OrderStatus)
              }}
              className="h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="" disabled>اختر الحالة التالية</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{ORDER_STATUS_LABELS[status]}</option>
              ))}
            </select>
          </div>
        )}
      </Card>
      <Card>
        <CardHeader><CardTitle>عناصر الطلب</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-4 border-b pb-4 last:border-0 last:pb-0">
              <div className="flex min-w-0 items-center gap-3">
                {item.product.image_url && (
                  <img src={item.product.image_url} alt="" className="h-14 w-14 rounded-md object-cover" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.product.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(item.unit_price)} × {item.quantity}
                  </p>
                </div>
              </div>
              <p className="shrink-0 font-semibold">{formatCurrency(item.subtotal)}</p>
            </div>
          ))}
          <div className="flex justify-between border-t pt-4 font-bold">
            <span>الإجمالي</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
