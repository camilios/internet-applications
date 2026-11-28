import { useEffect } from "react"
import { type QueryFilters, useQueryClient } from "@tanstack/react-query"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { ROLES } from "@/lib/constants/roles"
import { useRealtimeConnection } from "@/lib/realtime/realtime-context"
import { toastService } from "@/lib/toast"
import { formatCurrency } from "@/lib/utils/format"
import type { PaginatedResponse } from "@/types/api"
import type { Product } from "../types"
import { productKeys } from "./use-products"

export function useProductRealtime(productId?: number) {
  const manager = useRealtimeConnection()
  const queryClient = useQueryClient()
  const customerId = useAuthStore((state) =>
    state.isAuthenticated && state.user?.role === ROLES.CUSTOMER ? state.user.id : undefined,
  )

  useEffect(() => {
    if (!manager || !customerId || (productId !== undefined && (!Number.isSafeInteger(productId) || productId < 1))) return
    let active = true
    const filters: QueryFilters = productId === undefined
      ? { queryKey: productKeys.lists() }
      : { queryKey: productKeys.detail(productId), exact: true }
    const isCurrent = () => {
      const state = useAuthStore.getState()
      return active && state.isAuthenticated && state.user?.id === customerId && state.user.role === ROLES.CUSTOMER
    }
    const visibleProduct = (id: number) => {
      if (productId !== undefined) return queryClient.getQueryData<Product>(productKeys.detail(productId))
      for (const [, page] of queryClient.getQueriesData<PaginatedResponse<Product>>({ ...filters, type: "active" })) {
        const product = page?.data.find((item) => item.id === id)
        if (product) return product
      }
    }
    const resynchronize = async () => {
      // A request started before the price change could still return the old price.
      await queryClient.cancelQueries(filters)
      if (isCurrent()) await queryClient.invalidateQueries(filters)
    }
    const unsubscribe = manager.subscribe({
      channel: "catalog.products",
      event: ".ProductPriceUpdated",
      isAllowed: (session) => session.userId === customerId && session.role === ROLES.CUSTOMER,
      onEvent: (payload) => {
        if (!payload || typeof payload !== "object" || !("product_id" in payload)) return
        const id = payload.product_id
        if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) return
        if (productId !== undefined && id !== productId) return
        const before = visibleProduct(id)
        void resynchronize().then(() => {
          if (!isCurrent() || !before) return
          const after = visibleProduct(id)
          if (after && after.price !== before.price) {
            toastService.info(`تم تحديث سعر ${after.name}`, formatCurrency(after.price))
          }
        })
      },
      onSubscribed: () => {
        // Catch up on changes that happened while the socket was disconnected.
        void resynchronize()
      },
    })
    return () => { active = false; unsubscribe() }
  }, [manager, queryClient, customerId, productId])
}
