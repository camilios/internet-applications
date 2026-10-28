import { apiClient } from "@/lib/api/client"
import { endpoints } from "@/lib/api/endpoints"
import type { MessageResponse, PaginatedResponse } from "@/types/api"
import type { Notification } from "../types"

export const notificationsApi = {
  getAll: async (page = 1) => {
    const { data } = await apiClient.get<PaginatedResponse<Notification>>(
      endpoints.notifications.list,
      { params: { page } }
    )
    return data
  },

  markRead: async (id: string) => {
    const { data } = await apiClient.patch<MessageResponse>(endpoints.notifications.markRead(id))
    return data
  },

  markAllRead: async () => {
    const { data } = await apiClient.patch<MessageResponse>(endpoints.notifications.readAll)
    return data
  },
}
