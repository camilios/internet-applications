import { useGetAll } from "@/hooks/api"
import { categoriesApi } from "../api/categories.api"

export const categoryKeys = {
  all: ["categories"] as const,
}

/** التصنيفات تتغير نادراً، فنحتفظ بها 5 دقائق */
export function useCategories() {
  return useGetAll(categoryKeys.all, () => categoriesApi.getAll(), {
    showGlobalLoader: false,
    staleTime: 1000 * 60 * 5,
  })
}
