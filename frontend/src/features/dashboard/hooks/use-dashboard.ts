import { useGet } from "@/hooks/api"
import { dashboardApi } from "../api/dashboard.api"

export const dashboardKeys = {
  summary: ["dashboard", "summary"] as const,
}

export function useDashboard() {
  return useGet(dashboardKeys.summary, dashboardApi.getSummary)
}
