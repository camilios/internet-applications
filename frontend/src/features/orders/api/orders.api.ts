import { apiClient } from "@/lib/api/client"
import { endpoints } from "@/lib/api/endpoints"
import type { OrderStatus } from "@/lib/constants/order-status"
import type { ApiResponse, PaginatedResponse } from "@/types/api"
import type { Order, OrderItemInput, OrderWithUser } from "../types"

export const ordersApi = {
  getMine: async (page = 1, status?: OrderStatus) => {
    const { data } = await apiClient.get<PaginatedResponse<Order>>(endpoints.orders.list, {
      params: { page, status },
    })
    return data
  },

  getById: async (id: number) => {
    const { data } = await apiClient.get<ApiResponse<Order>>(endpoints.orders.detail(id))
    return data.data
  },

  /**
   * الـ Idempotency-Key مطلوب من الباك (UUID v4).
   * مرّر نفس المفتاح عند إعادة المحاولة لنفس الطلب، عشان ما يتكرر الطلب.
   */
  create: async (items: OrderItemInput[], idempotencyKey: string = crypto.randomUUID()) => {
    const { data } = await apiClient.post<ApiResponse<Order>>(
      endpoints.orders.create,
      { items },
      { headers: { "Idempotency-Key": idempotencyKey } }
    )
    return data.data
  },

  // ─── Admin ───
  adminGetAll: async (page = 1, status?: OrderStatus) => {
    const { data } = await apiClient.get<PaginatedResponse<OrderWithUser>>(
      endpoints.orders.admin.list,
      { params: { page, status } }
    )
    return data
  },

  adminUpdateStatus: async (id: number, status: OrderStatus) => {
    const { data } = await apiClient.patch<ApiResponse<Order>>(
      endpoints.orders.admin.updateStatus(id),
      { status }
    )
    return data.data
  },
}
