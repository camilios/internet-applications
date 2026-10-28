import { apiClient } from "@/lib/api/client"
import { endpoints } from "@/lib/api/endpoints"
import type { PaginatedResponse } from "@/types/api"
import type { User } from "@/types/auth"

export const usersApi = {
  getAll: async (page = 1) => {
    const { data } = await apiClient.get<PaginatedResponse<User>>(endpoints.users.list, {
      params: { page },
    })
    return data
  },
}
