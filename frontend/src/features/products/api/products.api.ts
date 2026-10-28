import { apiClient } from "@/lib/api/client"
import { endpoints } from "@/lib/api/endpoints"
import type { ApiResponse, PaginatedResponse } from "@/types/api"
import type {
  Product,
  ProductDetail,
  ProductFilters,
  ProductInput,
  ProductUpdateInput,
} from "../types"

/**
 * يبني FormData بالحقول الموجودة فقط.
 * الباك يتوقع is_active كـ "1" أو "0" داخل multipart.
 */
function toFormData(input: ProductUpdateInput) {
  const formData = new FormData()
  if (input.name !== undefined) formData.append("name", input.name)
  if (input.description !== undefined) formData.append("description", input.description ?? "")
  if (input.price !== undefined) formData.append("price", String(input.price))
  if (input.category_id !== undefined) formData.append("category_id", String(input.category_id))
  if (input.is_active !== undefined) formData.append("is_active", input.is_active ? "1" : "0")
  if (input.image) formData.append("image", input.image)
  return formData
}

export const productsApi = {
  getAll: async (filters: ProductFilters = {}) => {
    const { data } = await apiClient.get<PaginatedResponse<Product>>(endpoints.products.list, {
      params: filters,
    })
    return data
  },

  getById: async (id: number) => {
    const { data } = await apiClient.get<ApiResponse<ProductDetail>>(endpoints.products.detail(id))
    return data.data
  },

  create: async (input: ProductInput) => {
    const { data } = await apiClient.post<ApiResponse<Product>>(
      endpoints.products.create,
      toFormData(input),
      { headers: { "Content-Type": undefined } }
    )
    return data.data
  },

  update: async (id: number, input: ProductUpdateInput) => {
    if (input.image) {
      // Laravel ما يقرأ multipart مع PUT، فنرسل POST مع _method=PUT
      const formData = toFormData(input)
      formData.append("_method", "PUT")
      const { data } = await apiClient.post<ApiResponse<Product>>(
        endpoints.products.update(id),
        formData,
        { headers: { "Content-Type": undefined } }
      )
      return data.data
    }

    // بدون صورة نرسل JSON عادي
    const { image: _image, ...json } = input
    const { data } = await apiClient.put<ApiResponse<Product>>(endpoints.products.update(id), json)
    return data.data
  },

  /** الحذف في الباك تعطيل (is_active = false)، والمنتج ما ينحذف نهائياً */
  delete: async (id: number) => {
    await apiClient.delete(endpoints.products.delete(id))
  },
}
