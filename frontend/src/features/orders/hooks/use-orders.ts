import { keepPreviousData } from "@tanstack/react-query"
import { useCreate, useGet, useGetAll, useUpdate } from "@/hooks/api"
import type { OrderStatus } from "@/lib/constants/order-status"
import { ordersApi } from "../api/orders.api"
import type { OrderItemInput } from "../types"

export const orderKeys = {
  all: ["orders"] as const,
  lists: () => [...orderKeys.all, "list"] as const,
  list: (page: number, status?: OrderStatus) =>
    [...orderKeys.lists(), page, status] as const,
  details: () => [...orderKeys.all, "detail"] as const,
  detail: (id: number) => [...orderKeys.details(), id] as const,
}

export function useOrders(page: number, status?: OrderStatus, isAdmin = false) {
  return useGetAll(
    orderKeys.list(page, status),
    () => isAdmin ? ordersApi.adminGetAll(page, status) : ordersApi.getMine(page, status),
    { placeholderData: keepPreviousData }
  )
}

export function useOrder(id: number) {
  return useGet(orderKeys.detail(id), () => ordersApi.getById(id), {
    enabled: Number.isInteger(id) && id > 0,
  })
}

export function useUpdateOrderStatus(id: number) {
  return useUpdate(
    (status: OrderStatus) => ordersApi.adminUpdateStatus(id, status),
    {
      invalidateKeys: [orderKeys.lists(), orderKeys.detail(id)],
      successMessage: "تم تحديث حالة الطلب",
      errorMessage: "تعذر تحديث حالة الطلب",
    }
  )
}

export function useCreateOrder() {
  return useCreate(
    (items: OrderItemInput[]) => ordersApi.create(items),
    {
      invalidateKeys: [orderKeys.lists()],
      successMessage: "تم إنشاء طلبك بنجاح",
      errorMessage: "تعذر إنشاء الطلب",
    }
  )
}
