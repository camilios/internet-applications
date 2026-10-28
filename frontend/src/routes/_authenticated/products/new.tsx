import { createFileRoute, redirect } from "@tanstack/react-router"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { ROLES } from "@/lib/constants/roles"
import { PageHeader } from "@/components/layout/page-header"
import { ProductForm } from "@/features/products/components/product-form"

export const Route = createFileRoute("/_authenticated/products/new")({
  beforeLoad: () => {
    const { user } = useAuthStore.getState()
    if (user?.role !== ROLES.ADMIN) {
      throw redirect({ to: "/" })
    }
  },
  component: NewProductPage,
})

function NewProductPage() {
  return (
    <div>
      <PageHeader title="إضافة منتج جديد" description="أدخل بيانات المنتج" />
      <ProductForm />
    </div>
  )
}
