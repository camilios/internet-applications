import { apiClient } from "@/lib/api/client"
import { endpoints } from "@/lib/api/endpoints"
import type { ApiResponse } from "@/types/api"

export interface DashboardSummary {
  total_products: number
  orders_today: number
  total_orders: number
  total_users: number | null
  total_sales: string
}

export const dashboardApi = {
  getSummary: async () => {
    const { data } = await apiClient.get<ApiResponse<DashboardSummary>>(endpoints.dashboard)
    return data.data
  },
}
