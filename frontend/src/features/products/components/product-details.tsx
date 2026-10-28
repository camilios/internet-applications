import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useProduct } from "../hooks/use-products"
import { useCreateOrder } from "@/features/orders/hooks/use-orders"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { LoadingSpinner } from "@/components/feedback/loading-spinner"
import { EmptyState } from "@/components/feedback/empty-state"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Link } from "@tanstack/react-router"
import { Pencil, ArrowRight, ShoppingCart } from "lucide-react"
import { ROLES } from "@/lib/constants/roles"

interface ProductDetailsProps {
  productId: number
}

export function ProductDetails({ productId }: ProductDetailsProps) {
  const { data: product, isLoading, error } = useProduct(productId)
  const isAdmin = useAuthStore((state) => state.user?.role === ROLES.ADMIN)
  const createOrder = useCreateOrder()
  const navigate = useNavigate()
  const [quantity, setQuantity] = useState(1)

  if (isLoading) return <LoadingSpinner text="جاري تحميل المنتج..." />

  if (error || !product) {
    const isStockDown = error?.statusCode === 503
    return (
      <EmptyState
        title={isStockDown ? "خدمة المخزون غير متاحة" : "المنتج غير موجود"}
        description={error?.message ?? "لم نتمكن من العثور على هذا المنتج."}
        action={
          <Button asChild variant="outline">
            <Link to="/products">العودة للمنتجات</Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/products">
            <ArrowRight className="ml-2 h-4 w-4" />
            العودة
          </Link>
        </Button>
        {isAdmin && (
          <Button asChild>
            <Link to="/products/$productId/edit" params={{ productId: String(product.id) }}>
              <Pencil className="ml-2 h-4 w-4" />
              تعديل
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="flex aspect-square items-center justify-center p-6">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="max-h-full rounded-lg object-contain"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-lg bg-muted text-muted-foreground">
                لا توجد صورة
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-2xl">{product.name}</CardTitle>
                <div className="mt-2 flex gap-2">
                  <Badge variant="secondary">{product.category.name}</Badge>
                  <Badge variant={product.is_active ? "default" : "outline"}>
                    {product.is_active ? "نشط" : "معطّل"}
                  </Badge>
                </div>
              </div>
              <div className="text-left">
                <p className="text-3xl font-bold text-primary">
                  {formatCurrency(product.price)}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {product.description && (
              <div>
                <h3 className="mb-1 text-sm font-medium text-muted-foreground">الوصف</h3>
                <p className="leading-relaxed">{product.description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 border-t pt-4">
              <div>
                <p className="text-sm text-muted-foreground">المخزون المتوفر</p>
                <p className="text-lg font-semibold">{product.stock}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">تاريخ الإضافة</p>
                <p className="text-lg font-semibold">{formatDate(product.created_at)}</p>
              </div>
            </div>
            <form
              className="flex flex-wrap items-end gap-3 border-t pt-4"
              onSubmit={(event) => {
                event.preventDefault()
                createOrder.mutate([{ product_id: product.id, quantity }], {
                  onSuccess: () => navigate({ to: "/orders" }),
                })
              }}
            >
              <div className="w-28">
                <label htmlFor="order-quantity" className="mb-2 block text-sm font-medium">الكمية</label>
                <Input
                  id="order-quantity"
                  type="number"
                  min={1}
                  max={product.stock}
                  value={quantity}
                  onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))}
                  disabled={product.stock < 1}
                />
              </div>
              <Button type="submit" disabled={createOrder.isPending || product.stock < 1}>
                <ShoppingCart className="ml-2 h-4 w-4" />
                {product.stock < 1 ? "غير متوفر" : "اطلب الآن"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
