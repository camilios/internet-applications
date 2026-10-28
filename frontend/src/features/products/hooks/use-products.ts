import { keepPreviousData } from "@tanstack/react-query"
import { useGet, useGetAll, useCreate, useUpdate, useDelete } from "@/hooks/api"
import { productsApi } from "../api/products.api"
import type { ProductFilters, ProductInput, ProductUpdateInput } from "../types"

/**
 * Query Keys – مصدر واحد لكل مفاتيح المنتجات
 */
export const productKeys = {
  all: ["products"] as const,
  lists: () => [...productKeys.all, "list"] as const,
  list: (filters: ProductFilters) => [...productKeys.lists(), filters] as const,
  details: () => [...productKeys.all, "detail"] as const,
  detail: (id: number) => [...productKeys.details(), id] as const,
}

/** جلب قائمة المنتجات */
export function useProducts(filters: ProductFilters = {}) {
  return useGetAll(
    productKeys.list(filters),
    () => productsApi.getAll(filters),
    // نحتفظ بالصفحة السابقة أثناء تحميل الجديدة بدل ما يختفي الجدول
    { placeholderData: keepPreviousData }
  )
}

/** جلب منتج واحد مع المخزون */
export function useProduct(id: number) {
  return useGet(productKeys.detail(id), () => productsApi.getById(id), {
    enabled: !!id,
  })
}

/** إضافة منتج */
export function useCreateProduct() {
  return useCreate((input: ProductInput) => productsApi.create(input), {
    invalidateKeys: [productKeys.lists()],
    successMessage: "تم إضافة المنتج بنجاح",
    errorMessage: "فشل إضافة المنتج",
  })
}

/** تحديث منتج */
export function useUpdateProduct(id: number) {
  return useUpdate((input: ProductUpdateInput) => productsApi.update(id, input), {
    invalidateKeys: [productKeys.lists(), productKeys.detail(id)],
    successMessage: "تم تحديث المنتج بنجاح",
    errorMessage: "فشل تحديث المنتج",
  })
}

/** تعطيل منتج (الباك ما يحذفه نهائياً) */
export function useDeleteProduct() {
  return useDelete((id: number) => productsApi.delete(id), {
    invalidateKeys: [productKeys.lists()],
    successMessage: "تم تعطيل المنتج",
    errorMessage: "فشل تعطيل المنتج",
  })
}
