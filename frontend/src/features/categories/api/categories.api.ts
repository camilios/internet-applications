import { apiClient } from "@/lib/api/client"
import { endpoints } from "@/lib/api/endpoints"
import type { PaginatedResponse } from "@/types/api"
import type { Category } from "../types"

export const categoriesApi = {
  /** يجمع كل الصفحات، لأن قائمة التصنيفات مرقّمة */
  getAll: async (): Promise<Category[]> => {
    const all: Category[] = []
    let page = 1
    let lastPage = 1

    do {
      const { data } = await apiClient.get<PaginatedResponse<Category>>(
        endpoints.categories.list,
        { params: { page } }
      )
      all.push(...data.data)
      lastPage = data.meta.last_page
      page += 1
    } while (page <= lastPage)

    return all
  },
}
