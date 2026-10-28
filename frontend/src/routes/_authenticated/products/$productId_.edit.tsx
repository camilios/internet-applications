import { createFileRoute, redirect } from "@tanstack/react-router"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { ROLES } from "@/lib/constants/roles"
import { PageHeader } from "@/components/layout/page-header"
import { ProductForm } from "@/features/products/components/product-form"
import { useProduct } from "@/features/products/hooks/use-products"
import { LoadingSpinner } from "@/components/feedback/loading-spinner"
import { EmptyState } from "@/components/feedback/empty-state"

export const Route = createFileRoute("/_authenticated/products/$productId_/edit")({
  beforeLoad: () => {
    const { user } = useAuthStore.getState()
    if (user?.role !== ROLES.ADMIN) {
      throw redirect({ to: "/" })
    }
  },
  component: EditProductPage,
})

function EditProductPage() {
  const { productId } = Route.useParams()
  const { data: product, isLoading, error } = useProduct(Number(productId))

  if (isLoading) return <LoadingSpinner text="جاري تحميل المنتج..." />

  if (error || !product) {
    return (
      <EmptyState
        title="المنتج غير موجود"
        description={error?.message ?? "لم نتمكن من العثور على هذا المنتج للتعديل."}
      />
    )
  }

  return (
    <div>
      <PageHeader title="تعديل المنتج" description={`تحديث بيانات: ${product.name}`} />
      {/* key يضمن إن القيم الابتدائية تتحدّث لو تغير المنتج */}
      <ProductForm key={product.id} product={product} />
    </div>
  )
}
