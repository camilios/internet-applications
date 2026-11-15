import { ORDER_STATUS, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/constants/order-status"

const nextStatuses: Record<OrderStatus, OrderStatus[]> = {
  pending: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED],
  confirmed: [ORDER_STATUS.PROCESSING, ORDER_STATUS.CANCELLED],
  processing: [ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELLED],
  shipped: [ORDER_STATUS.DELIVERED],
  delivered: [],
  cancelled: [],
}

export function OrderStatusControl({ status, isPending, onStatusChange }: {
  status: OrderStatus
  isPending: boolean
  onStatusChange: (status: OrderStatus) => void
}) {
  const options = nextStatuses[status]
  if (!options.length) return null

  return (
    <div className="border-t p-4 sm:p-6">
      <label htmlFor="next-order-status" className="mb-2 block text-sm font-medium">تحديث الحالة</label>
      <select
        id="next-order-status"
        // An uncontrolled select auto-selects the next option when the old one
        // disappears. Keep the placeholder selected so every choice fires change.
        value=""
        disabled={isPending}
        onChange={(event) => {
          const next = event.target.value as OrderStatus
          if (options.includes(next)) onStatusChange(next)
        }}
        className="h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="" disabled>اختر الحالة التالية</option>
        {options.map((next) => <option key={next} value={next}>{ORDER_STATUS_LABELS[next]}</option>)}
      </select>
    </div>
  )
}
