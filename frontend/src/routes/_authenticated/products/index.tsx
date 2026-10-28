import { createFileRoute, Link } from "@tanstack/react-router"
import { z } from "zod"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { ProductTable } from "@/features/products/components/product-table"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { ROLES } from "@/lib/constants/roles"

const productsSearchSchema = z.object({
  page: z.coerce.number().int().min(1).optional().catch(1),
  search: z.string().optional().catch(""),
  category: z.string().optional().catch(""),
})

export const Route = createFileRoute("/_authenticated/products/")({
  validateSearch: productsSearchSchema,
  component: ProductsPage,
})

function ProductsPage() {
  const isAdmin = useAuthStore((state) => state.user?.role === ROLES.ADMIN)

  // يمكن استخدام Route.useSearch() لاحقاً لربط الفلاتر بالـ URL
  // const { page, search, category } = Route.useSearch()

  return (
    <div>
      <PageHeader
        title="المنتجات"
        description={isAdmin
          ? "إدارة جميع منتجات المتجر"
          : "استعرض منتجات المتجر. إضافة المنتجات وتعديلها وإزالتها متاحة للمسؤول فقط."}
        actions={
          isAdmin ? (
            <Button asChild>
              <Link to="/products/new">
                <Plus className="ml-2 h-4 w-4" />
                إضافة منتج
              </Link>
            </Button>
          ) : undefined
        }
      />
      <ProductTable />
    </div>
  )
}
