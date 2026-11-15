import { Link } from "@tanstack/react-router"
import { Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from "@/lib/constants/order-status"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import type { Order } from "../types"

export function OrderSummaryCard({ order, showCustomer }: { order: Order; showCustomer: boolean }) {
  return (
    <article className="min-w-0 space-y-3" aria-label={`طلب #${order.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/orders/$orderId" params={{ orderId: String(order.id) }} className="font-semibold hover:underline">
          طلب #{order.id}
        </Link>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${ORDER_STATUS_COLORS[order.status]}`}>
          {ORDER_STATUS_LABELS[order.status]}
        </span>
      </div>
      {showCustomer && <p className="break-words text-sm">{order.user?.name ?? `مستخدم #${order.user_id}`}</p>}
      <dl className="grid min-w-0 grid-cols-2 gap-3 text-sm">
        <div className="min-w-0">
          <dt className="text-muted-foreground">الإجمالي</dt>
          <dd className="break-words font-semibold">{formatCurrency(order.total)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">عدد المنتجات</dt>
          <dd>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <span className="text-xs text-muted-foreground">{formatDate(order.created_at)}</span>
        <Button asChild size="sm" variant="outline">
          <Link to="/orders/$orderId" params={{ orderId: String(order.id) }}>
            <Eye className="ml-2 h-4 w-4" />التفاصيل
          </Link>
        </Button>
      </div>
    </article>
  )
}
