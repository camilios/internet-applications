import { useGetAll, useUpdate } from "@/hooks/api"
import { notificationsApi } from "../api/notifications.api"

export const notificationKeys = {
  all: ["notifications"] as const,
  list: () => [...notificationKeys.all, "list"] as const,
}

export function useNotifications() {
  return useGetAll(notificationKeys.list(), () => notificationsApi.getAll(), {
    showGlobalLoader: false,
    staleTime: 30_000,
  })
}

export function useMarkNotificationRead() {
  return useUpdate(
    (id: string) => notificationsApi.markRead(id),
    {
      invalidateKeys: [notificationKeys.list()],
      showGlobalLoader: false,
      successMessage: "تم تعليم الإشعار كمقروء",
      errorMessage: "تعذر تحديث الإشعار",
    }
  )
}

export function useMarkAllNotificationsRead() {
  return useUpdate(
    () => notificationsApi.markAllRead(),
    {
      invalidateKeys: [notificationKeys.list()],
      showGlobalLoader: false,
      successMessage: "تم تعليم الإشعارات كمقروءة",
      errorMessage: "تعذر تحديث الإشعارات",
    }
  )
}
