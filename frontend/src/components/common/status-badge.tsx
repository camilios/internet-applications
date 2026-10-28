import { cn } from "@/lib/utils/cn"
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, type OrderStatus } from "@/lib/constants/order-status"

interface StatusBadgeProps {
  status: OrderStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        ORDER_STATUS_COLORS[status],
        className
      )}
    >
      {ORDER_STATUS_LABELS[status]}
    </span>
  )
}
