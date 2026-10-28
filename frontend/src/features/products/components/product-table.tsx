import { useState } from "react"
import { type ColumnDef } from "@tanstack/react-table"
import { Link } from "@tanstack/react-router"
import { Ban, MoreHorizontal, Pencil, Eye } from "lucide-react"
import { DataTable } from "@/components/common/data-table"
import { Pagination } from "@/components/common/pagination"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/feedback/confirm-dialog"
import { Input } from "@/components/ui/input"
import { useProducts, useDeleteProduct } from "../hooks/use-products"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { ROLES } from "@/lib/constants/roles"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { useDebounce } from "@/hooks/use-debounce"
import type { Product } from "../types"

/**
 * جدول المنتجات:
 * - بحث مع debounce، وpagination من السيرفر
 * - حذف/تعطيل مع تأكيد (الباك يحتفظ بالسجل ولا يحذفه نهائياً)
 */
export function ProductTable() {
  const isAdmin = useAuthStore((state) => state.user?.role === ROLES.ADMIN)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 400)

  const { data, isLoading } = useProducts({
    page,
    per_page: 10,
    search: debouncedSearch || undefined,
  })

  const deleteMutation = useDeleteProduct()
  const [deactivateId, setDeactivateId] = useState<number | null>(null)

  const columns: ColumnDef<Product>[] = [
    {
      accessorKey: "name",
      header: "الاسم",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          {row.original.image_url && (
            <img
              src={row.original.image_url}
              alt=""
              className="h-10 w-10 rounded-md object-cover"
            />
          )}
          <span className="font-medium">{row.original.name}</span>
        </div>
      ),
    },
    {
      id: "category",
      header: "التصنيف",
      cell: ({ row }) => row.original.category?.name ?? "—",
    },
    {
      accessorKey: "price",
      header: "السعر",
      cell: ({ row }) => formatCurrency(row.original.price),
    },
    {
      accessorKey: "is_active",
      header: "الحالة",
      cell: ({ row }) => (row.original.is_active ? "نشط" : "معطّل"),
    },
    {
      accessorKey: "created_at",
      header: "تاريخ الإضافة",
      cell: ({ row }) => formatDate(row.original.created_at),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to="/products/$productId" params={{ productId: String(row.original.id) }}>
                <Eye className="ml-2 h-4 w-4" />
                عرض
              </Link>
            </DropdownMenuItem>
            {isAdmin && (
              <>
                <DropdownMenuItem asChild>
                  <Link to="/products/$productId/edit" params={{ productId: String(row.original.id) }}>
                    <Pencil className="ml-2 h-4 w-4" />
                    تعديل
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setDeactivateId(row.original.id)}
                >
                  <Ban className="ml-2 h-4 w-4" />
                  حذف / تعطيل
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="ابحث عن منتج..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          className="max-w-sm"
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        emptyTitle="لا توجد منتجات"
        emptyDescription="ابدأ بإضافة أول منتج للمتجر"
      />

      {data?.meta && (
        <Pagination
          page={data.meta.current_page}
          lastPage={data.meta.last_page}
          onPageChange={setPage}
        />
      )}

      <ConfirmDialog
        open={deactivateId !== null}
        onOpenChange={(open) => !open && setDeactivateId(null)}
        title="حذف المنتج"
        description="سيتم تعطيل المنتج وإخفاؤه من المتجر، مع الاحتفاظ بسجله وعدم حذفه نهائياً."
        confirmLabel="حذف / تعطيل"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (deactivateId !== null) {
            deleteMutation.mutate(deactivateId, {
              onSuccess: () => setDeactivateId(null),
            })
          }
        }}
      />
    </div>
  )
}
