import { StrictMode, type ReactNode } from "react"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RealtimeProvider } from "@/app/providers/realtime-provider"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { useAdminOrderRealtime, useOrderListStatusRealtime, useOrderStatusRealtime } from "@/features/orders/hooks/use-order-realtime"
import { orderKeys, useOrder, useOrders } from "@/features/orders/hooks/use-orders"
import { ordersApi } from "@/features/orders/api/orders.api"
import { useProductRealtime } from "@/features/products/hooks/use-product-realtime"
import { productKeys } from "@/features/products/hooks/use-products"
import { dashboardKeys } from "@/features/dashboard/hooks/use-dashboard"
import type { Order } from "@/features/orders/types"
import type { User } from "@/types/auth"
import { FakeClient } from "./fakes"
import { toastService } from "@/lib/toast"

vi.mock("@/features/orders/api/orders.api", () => ({ ordersApi: {
  getById: vi.fn(), getMine: vi.fn(), adminGetAll: vi.fn(), create: vi.fn(), adminUpdateStatus: vi.fn(),
} }))
vi.mock("@/lib/toast", () => ({ toastService: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const customer: User = { id: 2, name: "Customer", email: "customer@example.test", role: "customer", created_at: "2026-01-01" }
const admin: User = { ...customer, id: 1, role: "admin" }
const order = (id: number, status: Order["status"] = "pending"): Order => ({
  id, user_id: customer.id, status, total: "10.00", items: [], created_at: "2026-01-01", updated_at: "2026-01-01",
})
const event = (orderId: number, status = "confirmed") => ({
  event_id: `00000000-0000-4000-8000-${String(orderId).padStart(12, "0")}`, order_id: orderId, occurred_at: "2026-11-14T00:00:00Z", status,
})

function setup(strict = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } })
  const clients: FakeClient[] = []
  const createClient = vi.fn(() => {
    const client = new FakeClient()
    clients.push(client)
    return client
  })
  const wrapper = ({ children }: { children: ReactNode }) => {
    const content = <QueryClientProvider client={queryClient}><RealtimeProvider createClient={createClient}>{children}</RealtimeProvider></QueryClientProvider>
    return strict ? <StrictMode>{content}</StrictMode> : content
  }
  return { queryClient, clients, createClient, wrapper }
}

beforeEach(() => {
  useAuthStore.getState().logout()
  vi.clearAllMocks()
})
afterEach(cleanup)

it("refetches only the customer's open product detail after a price change and on reconnect", async () => {
  useAuthStore.getState().setAuth(customer, "customer-token")
  const { wrapper, queryClient, clients } = setup()
  queryClient.setQueryData(productKeys.detail(99), { price: "6.00" })
  let price = "10.00"
  const { result, unmount } = renderHook(() => {
    useProductRealtime(7)
    const list = useQuery({ queryKey: productKeys.list({ search: "banana" }), queryFn: async () => ({ data: [{ id: 7, price }] }) })
    const detail = useQuery({ queryKey: productKeys.detail(7), queryFn: async () => ({ id: 7, name: "Banana", price }) })
    return { list, detail }
  }, { wrapper })
  await waitFor(() => expect(result.current.detail.data?.price).toBe("10.00"))
  await waitFor(() => expect(result.current.list.data?.data[0].price).toBe("10.00"))
  const channel = clients[0].channels.get("catalog.products")!
  price = "15.00"
  await act(async () => channel.emit(".ProductPriceUpdated", { product_id: 99 }))
  expect(result.current.detail.data?.price).toBe("10.00")
  expect(toastService.info).not.toHaveBeenCalled()
  act(() => channel.emit(".ProductPriceUpdated", { product_id: 7 }))
  await waitFor(() => expect(result.current.detail.data?.price).toBe("15.00"))
  expect(result.current.list.data?.data[0].price).toBe("10.00")
  expect(toastService.info).toHaveBeenCalledWith("تم تحديث سعر Banana", expect.any(String))
  expect(queryClient.getQueryState(productKeys.detail(99))?.isInvalidated).toBe(false)

  price = "17.00"
  act(() => channel.succeed())
  await waitFor(() => expect(result.current.detail.data?.price).toBe("17.00"))
  expect(result.current.list.data?.data[0].price).toBe("10.00")
  expect(toastService.info).toHaveBeenCalledTimes(1)
  unmount()
  expect(channel.listeners.get(".ProductPriceUpdated")?.size).toBe(0)
})

it("refreshes the customer's filtered product list and announces only a visible changed price", async () => {
  useAuthStore.getState().setAuth(customer, "customer-token")
  const { wrapper, queryClient, clients } = setup()
  const detailKey = productKeys.detail(7)
  queryClient.setQueryData(detailKey, { id: 7, price: "10.00" })
  let price = "10.00"
  const { result } = renderHook(() => {
    useProductRealtime()
    return useQuery({
      queryKey: productKeys.list({ page: 2, search: "banana" }),
      queryFn: async () => ({ data: [{ id: 7, name: "Banana", price }], meta: { current_page: 2 } }),
    })
  }, { wrapper })
  await waitFor(() => expect(result.current.data?.data[0].price).toBe("10.00"))
  const channel = clients[0].channels.get("catalog.products")!
  await act(async () => channel.emit(".ProductPriceUpdated", { product_id: 99 }))
  expect(toastService.info).not.toHaveBeenCalled()
  price = "16.00"
  act(() => channel.emit(".ProductPriceUpdated", { product_id: 7 }))
  await waitFor(() => expect(result.current.data?.data[0].price).toBe("16.00"))
  expect(result.current.data?.meta.current_page).toBe(2)
  expect(toastService.info).toHaveBeenCalledExactlyOnceWith("تم تحديث سعر Banana", expect.any(String))
  expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(false)
})

it("does not subscribe to price changes for an admin viewing a product detail", () => {
  useAuthStore.getState().setAuth(admin, "admin-token")
  const { wrapper, createClient } = setup()
  renderHook(() => useProductRealtime(7), { wrapper })
  expect(createClient).not.toHaveBeenCalled()
})

describe("order query synchronization", () => {
  it("refetches filtered admin orders without changing pagination, other detail caches or CRUD keys", async () => {
    useAuthStore.getState().setAuth(admin, "admin-token")
    const { wrapper, queryClient, clients } = setup()
    const otherOrder = order(99)
    const product = { id: 1, name: "Untouched" }
    queryClient.setQueryData(orderKeys.detail(99), otherOrder)
    queryClient.setQueryData(["products", "detail", 1], product)
    queryClient.setQueryData(dashboardKeys.summary, { total_orders: 1 })
    const meta = { current_page: 2, from: 16, last_page: 3, per_page: 15, to: 16, total: 31 }
    vi.mocked(ordersApi.adminGetAll).mockResolvedValue({ data: [{ ...order(7), user: customer }], meta })
    const { result, unmount } = renderHook(() => {
      useAdminOrderRealtime()
      return useOrders(2, "pending", true)
    }, { wrapper })
    await waitFor(() => expect(result.current.data?.data[0].id).toBe(7))
    const channel = clients[0].channels.get("admin.orders")!
    act(() => channel.succeed())
    expect(toastService.info).not.toHaveBeenCalled()
    vi.mocked(ordersApi.adminGetAll).mockResolvedValue({ data: [{ ...order(8), user: customer }], meta: { ...meta, total: 32 } })
    act(() => channel.emit(".OrderCreated", event(8)))
    await waitFor(() => expect(result.current.data?.data[0].id).toBe(8))
    expect(toastService.info).toHaveBeenCalledWith("طلب جديد #8", "يمكنك عرض تفاصيله من صفحة الطلبات")
    act(() => {
      channel.emit(".OrderCreated", event(8))
      channel.succeed()
    })
    expect(toastService.info).toHaveBeenCalledTimes(1)
    expect(ordersApi.adminGetAll).toHaveBeenLastCalledWith(2, "pending")
    expect(result.current.data?.meta).toEqual({ ...meta, total: 32 })
    expect(orderKeys.list(2, "pending")).toEqual(["orders", "list", 2, "pending"])
    expect(queryClient.getQueryState(dashboardKeys.summary)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryData(orderKeys.detail(99))).toBe(otherOrder)
    expect(queryClient.getQueryData(["products", "detail", 1])).toBe(product)
    expect(queryClient.getQueryState(["products", "detail", 1])?.isInvalidated).toBe(false)
    unmount()
    expect(channel.subscriptionListeners.size).toBe(0)
    expect(channel.listeners.get(".OrderCreated")?.size).toBe(0)
    expect(clients[0].disconnect).toHaveBeenCalledOnce()
  })

  it("updates only the owner's detail through REST and recovers events missed while disconnected", async () => {
    useAuthStore.getState().setAuth(customer, "customer-token")
    const { wrapper, queryClient, clients } = setup()
    queryClient.setQueryData(orderKeys.detail(99), order(99))
    queryClient.setQueryData(orderKeys.list(1), { data: [order(7)], meta: { current_page: 1 } })
    const otherOrder = queryClient.getQueryData(orderKeys.detail(99))
    vi.mocked(ordersApi.getById).mockResolvedValue(order(7))
    const { result } = renderHook(() => {
      const query = useOrder(7)
      useOrderStatusRealtime(query.data)
      return query
    }, { wrapper })
    await waitFor(() => expect(clients[0]?.channels.has("orders.7")).toBe(true))
    const channel = clients[0].channels.get("orders.7")!
    act(() => channel.succeed())
    await waitFor(() => expect(result.current.isFetching).toBe(false))
    expect(toastService.info).not.toHaveBeenCalled()
    vi.mocked(ordersApi.getById).mockResolvedValue(order(7, "confirmed"))
    act(() => channel.emit(".OrderStatusUpdated", event(7)))
    await waitFor(() => expect(result.current.data?.status).toBe("confirmed"))
    expect(toastService.info).toHaveBeenCalledWith("تم تحديث حالة الطلب #7", "الحالة الجديدة: مؤكد")
    expect(queryClient.getQueryState(orderKeys.list(1))?.isInvalidated).toBe(true)

    // No event arrived while offline. Resubscription must fetch the latest authoritative state.
    vi.mocked(ordersApi.getById).mockResolvedValue(order(7, "delivered"))
    act(() => channel.succeed())
    await waitFor(() => expect(result.current.data?.status).toBe("delivered"))
    act(() => {
      channel.emit(".OrderStatusUpdated", event(7, "pending"))
      channel.emit(".OrderStatusUpdated", event(7, "pending"))
      channel.emit(".OrderStatusUpdated", event(99, "cancelled"))
    })
    await waitFor(() => expect(result.current.isFetching).toBe(false))
    expect(result.current.data?.status).toBe("delivered")
    expect(toastService.info).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData(orderKeys.detail(99))).toBe(otherOrder)
    expect(queryClient.getQueryState(orderKeys.detail(99))?.isInvalidated).toBe(false)
  })

  it("cleans the old order subscription on ID changes and refuses other users' order channels", () => {
    useAuthStore.getState().setAuth(customer, "customer-token")
    const { wrapper, clients } = setup()
    const { rerender, unmount } = renderHook(({ selected }) => useOrderStatusRealtime(selected), {
      wrapper, initialProps: { selected: order(7) },
    })
    const firstClient = clients[0]
    const first = firstClient.channels.get("orders.7")!
    rerender({ selected: order(8) })
    expect(firstClient.leave).toHaveBeenCalledWith("orders.7")
    expect(first.subscriptionListeners.size).toBe(0)
    expect(first.listeners.get(".OrderStatusUpdated")?.size).toBe(0)
    expect(clients[1].channels.has("orders.8")).toBe(true)
    rerender({ selected: { ...order(9), user_id: 999 } })
    expect(clients[1].leave).toHaveBeenCalledWith("orders.8")
    expect(clients).toHaveLength(2)
    unmount()
  })

  it("keeps one active shared connection under StrictMode and disconnects/removes protected cache on logout", () => {
    useAuthStore.getState().setAuth(admin, "admin-token")
    const { wrapper, clients, queryClient } = setup(true)
    const { rerender } = renderHook(() => {
      useAdminOrderRealtime()
      useAdminOrderRealtime()
    }, { wrapper })
    expect(clients.filter((client) => client.disconnect.mock.calls.length === 0)).toHaveLength(1)
    const current = clients.at(-1)!
    const channel = current.channels.get("admin.orders")!
    expect(channel.listen).toHaveBeenCalledTimes(1)
    rerender()
    expect(channel.listen).toHaveBeenCalledTimes(1)
    queryClient.setQueryData(orderKeys.detail(7), order(7))
    queryClient.setQueryData(dashboardKeys.summary, { total_orders: 1 })
    queryClient.setQueryData(["products", "detail", 1], { id: 1 })
    act(() => useAuthStore.getState().logout())
    expect(current.disconnect).toHaveBeenCalledOnce()
    expect(queryClient.getQueryData(orderKeys.detail(7))).toBeUndefined()
    expect(queryClient.getQueryData(dashboardKeys.summary)).toBeUndefined()
    expect(queryClient.getQueryData(["products", "detail", 1])).toEqual({ id: 1 })
  })

  it("resynchronizes an initial request that began before the event", async () => {
    useAuthStore.getState().setAuth(admin, "admin-token")
    const { wrapper, clients } = setup()
    let resolveOld: (value: Awaited<ReturnType<typeof ordersApi.adminGetAll>>) => void = () => {}
    vi.mocked(ordersApi.adminGetAll).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
    const meta = { current_page: 1, from: 1, last_page: 1, per_page: 15, to: 1, total: 1 }
    vi.mocked(ordersApi.adminGetAll).mockResolvedValue({ data: [{ ...order(8), user: customer }], meta })
    const { result } = renderHook(() => { useAdminOrderRealtime(); return useOrders(1, undefined, true) }, { wrapper })
    act(() => clients[0].channels.get("admin.orders")!.emit(".OrderCreated", event(8)))
    await waitFor(() => expect(result.current.data?.data[0].id).toBe(8))
    await act(async () => resolveOld({ data: [{ ...order(7), user: customer }], meta }))
    expect(result.current.data?.data[0].id).toBe(8)
  })

  it("updates the customer's visible orders list through REST and invalidates only the matching detail", async () => {
    useAuthStore.getState().setAuth(customer, "customer-token")
    const { wrapper, queryClient, clients } = setup()
    const meta = { current_page: 2, from: 16, last_page: 3, per_page: 15, to: 16, total: 31 }
    queryClient.setQueryData(orderKeys.detail(7), order(7))
    queryClient.setQueryData(orderKeys.detail(99), order(99))
    const otherOrder = queryClient.getQueryData(orderKeys.detail(99))
    vi.mocked(ordersApi.getMine).mockResolvedValue({ data: [order(7)], meta })
    const { result } = renderHook(() => {
      const query = useOrders(2)
      useOrderListStatusRealtime(query.data?.data)
      return query
    }, { wrapper })
    await waitFor(() => expect(clients[0]?.channels.has("orders.7")).toBe(true))
    const channel = clients[0].channels.get("orders.7")!
    vi.mocked(ordersApi.getMine).mockResolvedValue({ data: [order(7, "confirmed")], meta })
    act(() => channel.emit(".OrderStatusUpdated", event(7)))
    await waitFor(() => expect(result.current.data?.data[0].status).toBe("confirmed"))
    expect(toastService.info).toHaveBeenCalledWith("تم تحديث حالة الطلب #7", "الحالة الجديدة: مؤكد")
    expect(result.current.data?.meta).toEqual(meta)
    expect(ordersApi.getMine).toHaveBeenLastCalledWith(2, undefined)
    expect(queryClient.getQueryState(orderKeys.detail(7))?.isInvalidated).toBe(true)
    expect(queryClient.getQueryData(orderKeys.detail(99))).toBe(otherOrder)
    expect(queryClient.getQueryState(orderKeys.detail(99))?.isInvalidated).toBe(false)
    expect(clients).toHaveLength(1)
    expect(clients[0].private).toHaveBeenCalledTimes(1)
  })

  it("removes changed orders from the active status filter using authoritative pagination", async () => {
    useAuthStore.getState().setAuth(customer, "customer-token")
    const { wrapper, queryClient, clients } = setup()
    const meta = { current_page: 1, from: 1, last_page: 1, per_page: 15, to: 1, total: 1 }
    const confirmed = { data: [], meta: { ...meta, from: null, to: null, total: 0 } }
    queryClient.setQueryData(orderKeys.list(1, "confirmed"), confirmed)
    vi.mocked(ordersApi.getMine).mockResolvedValue({ data: [order(7)], meta })
    const { result } = renderHook(() => {
      const query = useOrders(1, "pending")
      useOrderListStatusRealtime(query.data?.data)
      return query
    }, { wrapper })
    await waitFor(() => expect(clients[0]?.channels.has("orders.7")).toBe(true))
    const client = clients[0]
    const channel = client.channels.get("orders.7")!
    const empty = { data: [], meta: { ...meta, from: null, to: null, total: 0 } }
    vi.mocked(ordersApi.getMine).mockResolvedValue(empty)
    act(() => channel.emit(".OrderStatusUpdated", event(7)))
    await waitFor(() => expect(result.current.data).toEqual(empty))
    expect(ordersApi.getMine).toHaveBeenLastCalledWith(1, "pending")
    expect(queryClient.getQueryData(orderKeys.list(1, "confirmed"))).toEqual(confirmed)
    expect(queryClient.getQueryState(orderKeys.list(1, "confirmed"))?.isInvalidated).toBe(true)
    expect(client.leave).toHaveBeenCalledWith("orders.7")
    expect(channel.listeners.get(".OrderStatusUpdated")?.size).toBe(0)
  })

  it("keeps owned visible subscriptions stable and cleans previous-page listeners and pending events", async () => {
    useAuthStore.getState().setAuth(customer, "customer-token")
    const { wrapper, queryClient, clients } = setup()
    queryClient.setQueryData(orderKeys.list(1), { data: [order(7)], meta: { current_page: 1 } })
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const firstPage = [order(7), order(8), { ...order(99), user_id: 999 }]
    const { rerender, unmount } = renderHook(({ visible }) => useOrderListStatusRealtime(visible), {
      wrapper, initialProps: { visible: firstPage },
    })
    const firstClient = clients[0]
    expect([...firstClient.channels.keys()].sort()).toEqual(["orders.7", "orders.8"])
    rerender({ visible: [order(8), order(7), order(7)] })
    expect(firstClient.private).toHaveBeenCalledTimes(2)
    const previousChannel = firstClient.channels.get("orders.7")!
    const lateEvent = [...previousChannel.listeners.get(".OrderStatusUpdated")!][0]
    rerender({ visible: [order(9)] })
    expect(firstClient.leave).toHaveBeenCalledWith("orders.7")
    expect(firstClient.leave).toHaveBeenCalledWith("orders.8")
    expect(previousChannel.subscriptionListeners.size).toBe(0)
    expect([...clients[1].channels.keys()]).toEqual(["orders.9"])
    act(() => lateEvent(event(7)))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)) })
    expect(invalidate).not.toHaveBeenCalled()
    const currentChannel = clients[1].channels.get("orders.9")!
    act(() => currentChannel.emit(".OrderStatusUpdated", event(9)))
    unmount()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(invalidate).not.toHaveBeenCalled()
    expect(currentChannel.listeners.get(".OrderStatusUpdated")?.size).toBe(0)
    expect(clients[1].disconnect).toHaveBeenCalledOnce()
  })

  it("resynchronizes missed list updates on subscription success without polling and ignores mismatched events", async () => {
    useAuthStore.getState().setAuth(customer, "customer-token")
    const { wrapper, clients } = setup()
    const meta = { current_page: 1, from: 1, last_page: 1, per_page: 15, to: 1, total: 1 }
    vi.mocked(ordersApi.getMine).mockResolvedValue({ data: [order(7)], meta })
    const { result } = renderHook(() => {
      const query = useOrders(1)
      useOrderListStatusRealtime(query.data?.data)
      return query
    }, { wrapper })
    await waitFor(() => expect(clients[0]?.channels.has("orders.7")).toBe(true))
    const channel = clients[0].channels.get("orders.7")!
    vi.mocked(ordersApi.getMine).mockResolvedValue({ data: [order(7, "delivered")], meta })
    act(() => channel.succeed())
    await waitFor(() => expect(result.current.data?.data[0].status).toBe("delivered"))
    const calls = vi.mocked(ordersApi.getMine).mock.calls.length
    act(() => channel.emit(".OrderStatusUpdated", event(99)))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)) })
    expect(ordersApi.getMine).toHaveBeenCalledTimes(calls)
    expect(result.current.data?.data[0].status).toBe("delivered")
    expect(clients[0].private).toHaveBeenCalledTimes(1)
  })

  it("does not subscribe to customer order lists under an admin session and disconnects on logout", () => {
    useAuthStore.getState().setAuth(admin, "admin-token")
    const { wrapper, clients } = setup()
    renderHook(() => useOrderListStatusRealtime([order(7), { ...order(8), user_id: admin.id }]), { wrapper })
    expect(clients).toHaveLength(0)
    act(() => useAuthStore.getState().setAuth(customer, "customer-token"))
    expect([...clients[0].channels.keys()]).toEqual(["orders.7"])
    act(() => useAuthStore.getState().logout())
    expect(clients[0].disconnect).toHaveBeenCalledOnce()
  })

  it("shares customer status toast deduplication across both hooks, route remounts and reconnects, resetting on a new auth session", () => {
    useAuthStore.getState().setAuth(customer, "customer-token")
    const { wrapper, clients } = setup()
    const { rerender } = renderHook(({ view }) => {
      useOrderStatusRealtime(view !== "list" ? order(7) : undefined)
      useOrderListStatusRealtime(view !== "detail" ? [order(7)] : undefined)
    }, { wrapper, initialProps: { view: "both" } })
    let channel = clients.at(-1)!.channels.get("orders.7")!
    act(() => channel.succeed())
    expect(toastService.info).not.toHaveBeenCalled()
    act(() => {
      channel.emit(".OrderStatusUpdated", event(7))
      channel.emit(".OrderStatusUpdated", event(7))
      channel.succeed()
    })
    expect(toastService.info).toHaveBeenCalledTimes(1)
    rerender({ view: "list" })
    act(() => clients.at(-1)!.channels.get("orders.7")!.emit(".OrderStatusUpdated", event(7)))
    rerender({ view: "detail" })
    channel = clients.at(-1)!.channels.get("orders.7")!
    act(() => { channel.succeed(); channel.emit(".OrderStatusUpdated", event(7)) })
    expect(toastService.info).toHaveBeenCalledTimes(1)

    act(() => useAuthStore.getState().setAuth(customer, "refreshed-token"))
    act(() => clients.at(-1)!.channels.get("orders.7")!.emit(".OrderStatusUpdated", event(7)))
    expect(toastService.info).toHaveBeenCalledTimes(2)
    act(() => useAuthStore.getState().logout())
    act(() => useAuthStore.getState().setAuth(customer, "refreshed-token"))
    act(() => clients.at(-1)!.channels.get("orders.7")!.emit(".OrderStatusUpdated", event(7)))
    expect(toastService.info).toHaveBeenCalledTimes(3)
  })

  it("ignores malformed customer toast payloads while retaining safe REST synchronization", async () => {
    useAuthStore.getState().setAuth(customer, "customer-token")
    const { wrapper, clients } = setup()
    const meta = { current_page: 1, from: 1, last_page: 1, per_page: 15, to: 1, total: 1 }
    vi.mocked(ordersApi.getMine).mockResolvedValue({ data: [order(7)], meta })
    const { result } = renderHook(() => {
      const query = useOrders(1)
      useOrderListStatusRealtime(query.data?.data)
      return query
    }, { wrapper })
    await waitFor(() => expect(clients[0]?.channels.has("orders.7")).toBe(true))
    const channel = clients[0].channels.get("orders.7")!
    act(() => channel.succeed())
    await waitFor(() => expect(result.current.isFetching).toBe(false))
    expect(toastService.info).not.toHaveBeenCalled()
    vi.mocked(ordersApi.getMine).mockResolvedValue({ data: [order(7, "confirmed")], meta })
    act(() => {
      channel.emit(".OrderStatusUpdated", event(99))
      channel.emit(".OrderStatusUpdated", { ...event(7), status: "unknown" })
      channel.emit(".OrderStatusUpdated", { ...event(7), status: "__proto__" })
      for (const eventId of [undefined, 42, "", "   ", "not-an-event-uuid"]) {
        channel.emit(".OrderStatusUpdated", { ...event(7), event_id: eventId })
      }
      channel.emit(".OrderStatusUpdated", { ...event(7), status: undefined })
    })
    await waitFor(() => expect(result.current.data?.data[0].status).toBe("confirmed"))
    expect(toastService.info).not.toHaveBeenCalled()
    act(() => channel.emit(".OrderStatusUpdated", event(7)))
    expect(toastService.info).toHaveBeenCalledOnce()
  })

  it("rejects customer status toasts for another owner, an admin-owned order and events after logout", () => {
    useAuthStore.getState().setAuth(customer, "customer-token")
    const { wrapper, clients } = setup()
    const { rerender } = renderHook(({ selected }) => useOrderStatusRealtime(selected), {
      wrapper, initialProps: { selected: { ...order(7), user_id: 999 } },
    })
    expect(clients).toHaveLength(0)
    rerender({ selected: order(7) })
    const channel = clients.at(-1)!.channels.get("orders.7")!
    const lateEvent = [...channel.listeners.get(".OrderStatusUpdated")!][0]
    act(() => useAuthStore.getState().logout())
    act(() => lateEvent(event(7)))
    expect(toastService.info).not.toHaveBeenCalled()
    act(() => useAuthStore.getState().setAuth(admin, "admin-token"))
    rerender({ selected: { ...order(7), user_id: admin.id } })
    act(() => clients.at(-1)!.channels.get("orders.7")!.emit(".OrderStatusUpdated", event(7)))
    expect(toastService.info).not.toHaveBeenCalled()
  })
})
