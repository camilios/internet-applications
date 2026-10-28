import { createFileRoute } from "@tanstack/react-router"
import { ProductDetails } from "@/features/products/components/product-details"

export const Route = createFileRoute("/_authenticated/products/$productId")({
  component: ProductDetailsPage,
})

function ProductDetailsPage() {
  const { productId } = Route.useParams()
  return <ProductDetails productId={Number(productId)} />
}
