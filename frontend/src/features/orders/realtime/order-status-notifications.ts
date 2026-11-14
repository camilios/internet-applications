import { useAuthStore } from "@/features/auth/stores/auth.store"
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/constants/order-status"
import { ROLES } from "@/lib/constants/roles"
import { toastService } from "@/lib/toast"
import type { RealtimeConnectionManager } from "@/lib/realtime/connection-manager"

const announced = new WeakMap<RealtimeConnectionManager, { generation: number; eventIds: Set<string> }>()
const eventIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Share delivery metadata across list/detail listeners and route remounts in one auth session. */
export function announceOrderStatus(
  manager: RealtimeConnectionManager,
  payload: unknown,
  orderId: number,
  ownerId: number,
) {
  const state = useAuthStore.getState()
  if (!state.isAuthenticated || !state.token || state.user?.role !== ROLES.CUSTOMER || state.user.id !== ownerId ||
    !payload || typeof payload !== "object" || !("order_id" in payload) || payload.order_id !== orderId ||
    !("event_id" in payload) || typeof payload.event_id !== "string" || !eventIdPattern.test(payload.event_id) ||
    !("status" in payload) || typeof payload.status !== "string" || !Object.hasOwn(ORDER_STATUS_LABELS, payload.status)) return

  const generation = manager.getSessionGeneration()
  let delivery = announced.get(manager)
  if (!delivery || delivery.generation !== generation) {
    delivery = { generation, eventIds: new Set() }
    announced.set(manager, delivery)
  }
  if (delivery.eventIds.has(payload.event_id)) return
  delivery.eventIds.add(payload.event_id)
  if (delivery.eventIds.size > 100) delivery.eventIds.delete(delivery.eventIds.values().next().value!)

  toastService.info(
    `تم تحديث حالة الطلب #${orderId}`,
    `الحالة الجديدة: ${ORDER_STATUS_LABELS[payload.status as OrderStatus]}`,
  )
}
