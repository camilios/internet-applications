import { useEffect, useRef } from "react"
import { useQueryClient, type QueryFilters } from "@tanstack/react-query"
import { useRealtimeConnection } from "@/lib/realtime/realtime-context"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { dashboardKeys } from "@/features/dashboard/hooks/use-dashboard"
import { ROLES } from "@/lib/constants/roles"
import { toastService } from "@/lib/toast"
import { orderKeys } from "./use-orders"
import type { Order } from "../types"
import { announceOrderStatus } from "../realtime/order-status-notifications"

function eventOrderId(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("order_id" in payload)) return null
  const id = payload.order_id
  return typeof id === "number" && Number.isInteger(id) && id > 0 ? id : null
}

export function useAdminOrderRealtime() {
  const manager = useRealtimeConnection()
  const queryClient = useQueryClient()
  const isAdmin = useAuthStore((state) => state.isAuthenticated && state.user?.role === ROLES.ADMIN)
  const announcedEvents = useRef(new Set<string>())

  useEffect(() => {
    if (!manager || !isAdmin) return
    let active = true
    const resynchronize = () => {
      const filters: QueryFilters[] = [
        { queryKey: orderKeys.lists() },
        { queryKey: dashboardKeys.summary, exact: true },
      ]
      for (const filter of filters) {
        // Cancel even an initial fetch so a response started before the event cannot win.
        void queryClient.cancelQueries(filter).then(() => {
          const state = useAuthStore.getState()
          if (active && state.isAuthenticated && state.user?.role === ROLES.ADMIN) {
            return queryClient.invalidateQueries(filter)
          }
        })
      }
    }
    const unsubscribe = manager.subscribe({
      channel: "admin.orders",
      event: ".OrderCreated",
      isAllowed: (session) => session.role === ROLES.ADMIN,
      onEvent: (payload) => {
        const orderId = eventOrderId(payload)
        if (orderId === null) return
        resynchronize()
        if (!payload || typeof payload !== "object" || !("event_id" in payload) ||
          typeof payload.event_id !== "string" || payload.event_id.length === 0 ||
          announcedEvents.current.has(payload.event_id)) return
        announcedEvents.current.add(payload.event_id)
        if (announcedEvents.current.size > 100) {
          announcedEvents.current.delete(announcedEvents.current.values().next().value!)
        }
        toastService.info(`طلب جديد #${orderId}`, "يمكنك عرض تفاصيله من صفحة الطلبات")
      },
      onSubscribed: resynchronize,
    })
    return () => { active = false; unsubscribe() }
  }, [manager, queryClient, isAdmin])
}

export function useOrderStatusRealtime(order: Pick<Order, "id" | "user_id"> | undefined) {
  const manager = useRealtimeConnection()
  const queryClient = useQueryClient()
  const userId = useAuthStore((state) => state.isAuthenticated ? state.user?.id : undefined)
  const orderId = order?.id
  const ownerId = order?.user_id

  useEffect(() => {
    if (!manager || !orderId || !Number.isInteger(orderId) || ownerId !== userId || !userId) return
    let active = true
    const filters: QueryFilters[] = [
      { queryKey: orderKeys.detail(orderId), exact: true },
      { queryKey: orderKeys.lists() },
    ]
    const resynchronize = () => {
      for (const filter of filters) {
        void queryClient.cancelQueries(filter).then(() => {
          const state = useAuthStore.getState()
          if (active && state.isAuthenticated && state.user?.id === ownerId) {
            return queryClient.invalidateQueries(filter)
          }
        })
      }
    }
    const unsubscribe = manager.subscribe({
      channel: `orders.${orderId}`,
      event: ".OrderStatusUpdated",
      isAllowed: (session) => session.userId === ownerId,
      onEvent: (payload) => {
        if (eventOrderId(payload) !== orderId) return
        resynchronize()
        announceOrderStatus(manager, payload, orderId, userId)
      },
      onSubscribed: resynchronize,
    })
    return () => { active = false; unsubscribe() }
  }, [manager, queryClient, userId, orderId, ownerId])
}

/** Subscribe only to the owned orders displayed by the current paginated list. */
export function useOrderListStatusRealtime(orders: readonly Pick<Order, "id" | "user_id">[] | undefined) {
  const manager = useRealtimeConnection()
  const queryClient = useQueryClient()
  const userId = useAuthStore((state) => state.isAuthenticated && state.user?.role === ROLES.CUSTOMER ? state.user.id : undefined)
  // A REST refetch returns new objects. Keep subscriptions stable when the visible IDs are unchanged.
  const orderIds = [...new Set((orders ?? [])
    .filter((order) => order.user_id === userId && Number.isInteger(order.id) && order.id > 0)
    .map((order) => order.id))].sort((left, right) => left - right).join(",")

  useEffect(() => {
    if (!manager || !userId || !orderIds) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const pendingIds = new Set<number>()
    const resynchronize = (orderId: number) => {
      pendingIds.add(orderId)
      if (timer !== undefined) return
      // Coalesce the page's subscription-success/event burst into one list refetch.
      timer = setTimeout(() => {
        timer = undefined
        const state = useAuthStore.getState()
        if (!active || !state.isAuthenticated || state.user?.id !== userId || state.user.role !== ROLES.CUSTOMER) {
          pendingIds.clear()
          return
        }
        const filters: QueryFilters[] = [
          { queryKey: orderKeys.lists() },
          ...[...pendingIds].map((id) => ({ queryKey: orderKeys.detail(id), exact: true })),
        ]
        pendingIds.clear()
        for (const filter of filters) {
          void queryClient.cancelQueries(filter).then(() => {
            const state = useAuthStore.getState()
            if (active && state.isAuthenticated && state.user?.id === userId && state.user.role === ROLES.CUSTOMER) {
              return queryClient.invalidateQueries(filter)
            }
          })
        }
      }, 20)
    }
    const unsubscribe = orderIds.split(",").map(Number).map((orderId) => manager.subscribe({
      channel: `orders.${orderId}`,
      event: ".OrderStatusUpdated",
      isAllowed: (session) => session.userId === userId && session.role === ROLES.CUSTOMER,
      onEvent: (payload) => {
        if (eventOrderId(payload) !== orderId) return
        resynchronize(orderId)
        announceOrderStatus(manager, payload, orderId, userId)
      },
      onSubscribed: () => resynchronize(orderId),
    }))
    return () => {
      active = false
      if (timer !== undefined) clearTimeout(timer)
      pendingIds.clear()
      for (const release of unsubscribe) release()
    }
  }, [manager, queryClient, userId, orderIds])
}
