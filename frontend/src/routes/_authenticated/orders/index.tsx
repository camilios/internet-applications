import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import type { ColumnDef } from "@tanstack/react-table"
import { Eye } from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import { DataTable } from "@/components/common/data-table"
import { Pagination } from "@/components/common/pagination"
import { EmptyState } from "@/components/feedback/empty-state"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { useOrders } from "@/features/orders/hooks/use-orders"
import type { Order } from "@/features/orders/types"
import { ORDER_STATUS, ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/constants/order-status"
import { ROLES } from "@/lib/constants/roles"
import { formatCurrency, formatDate } from "@/lib/utils/format"

const ordersSearchSchema = z.object({
  page: z.coerce.number().int().min(1).optional().catch(1),
  status: z.enum(["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"]).optional().catch(undefined),
})

export const Route = createFileRoute("/_authenticated/orders/")({
  validateSearch: ordersSearchSchema,
  component: OrdersPage,
})

function OrdersPage() {
  const { page = 1, status } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const isAdmin = useAuthStore((state) => state.user?.role === ROLES.ADMIN)
  const { data, isLoading, error } = useOrders(page, status, isAdmin)

  const columns: ColumnDef<Order>[] = [
    { accessorKey: "id", header: "رقم الطلب", cell: ({ row }) => `#${row.original.id}` },
  ]
  if (isAdmin) {
    columns.push({
      id: "customer",
      header: "الزبون",
      cell: ({ row }) => row.original.user?.name ?? `مستخدم #${row.original.user_id}`,
    })
  }
  columns.push(
    { id: "items", header: "عدد المنتجات", cell: ({ row }) => row.original.items.reduce((sum, item) => sum + item.quantity, 0) },
    { accessorKey: "total", header: "الإجمالي", cell: ({ row }) => formatCurrency(row.original.total) },
    { accessorKey: "status", header: "الحالة", cell: ({ row }) => (
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ORDER_STATUS_COLORS[row.original.status]}`}>
        {ORDER_STATUS_LABELS[row.original.status]}
      </span>
    ) },
    { accessorKey: "created_at", header: "التاريخ", cell: ({ row }) => formatDate(row.original.created_at) },
    { id: "actions", header: "", cell: ({ row }) => (
      <Button asChild size="sm" variant="outline">
        <Link to="/orders/$orderId" params={{ orderId: String(row.original.id) }}>
          <Eye className="ml-2 h-4 w-4" />
          التفاصيل
        </Link>
      </Button>
    ) },
  )

  return (
    <div className="space-y-4">
      <PageHeader title="الطلبات" description={isAdmin ? "متابعة وإدارة جميع طلبات المتجر" : "متابعة طلباتك"} />
      <div className="max-w-xs">
        <label htmlFor="order-status" className="mb-2 block text-sm font-medium">تصفية حسب الحالة</label>
        <select
          id="order-status"
          value={status ?? ""}
          onChange={(event) => {
            const next = event.target.value as OrderStatus | ""
            void navigate({ search: (previous) => ({ ...previous, page: 1, status: next || undefined }) })
          }}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">كل الحالات</option>
          {Object.values(ORDER_STATUS).map((value) => (
            <option key={value} value={value}>{ORDER_STATUS_LABELS[value]}</option>
          ))}
        </select>
      </div>
      {error ? (
        <EmptyState title="تعذر تحميل الطلبات" description={error.message} />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            isLoading={isLoading}
            emptyTitle="لا توجد طلبات"
            emptyDescription="لم يتم العثور على طلبات بهذه الحالة."
          />
          {data?.meta && (
            <Pagination
              page={data.meta.current_page}
              lastPage={data.meta.last_page}
              onPageChange={(nextPage) => void navigate({ search: (previous) => ({ ...previous, page: nextPage }) })}
            />
          )}
        </>
      )}
    </div>
  )
}
