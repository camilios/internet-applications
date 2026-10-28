import type { Category } from "@/features/categories/types"

/** المنتج كما يرجعه GET /products */
export interface Product {
  id: number
  name: string
  description: string | null
  price: string
  image_url: string | null
  category: Category
  is_active: boolean
  created_at: string
  updated_at: string
}

/** GET /products/{id} فيه المخزون المتاح لحظياً من خدمة gRPC */
export interface ProductDetail extends Product {
  stock: number
}

export interface ProductFilters {
  page?: number
  per_page?: number
  search?: string
  category_id?: number
}

export interface ProductInput {
  name: string
  description?: string | null
  price: number
  category_id: number
  is_active?: boolean
  image?: File
}

export type ProductUpdateInput = Partial<ProductInput>
