import type { ReactNode } from "react"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useCreate, useUpdate, useDelete, useGet, useGetAll } from "@/hooks/api"
import { toastService } from "@/lib/toast"
import { useLoadingStore } from "@/stores/loading.store"

vi.mock("@/lib/toast", () => ({ toastService: { success: vi.fn(), error: vi.fn() } }))

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  }
}

beforeEach(() => { vi.clearAllMocks(); useLoadingStore.getState().reset() })
afterEach(cleanup)

describe("existing generic CRUD hook behavior", () => {
  it("keeps get and get-all response shapes, keys and loader behavior", async () => {
    const { wrapper, client } = setup()
    const record = { id: 7, status: "pending" }
    const list = { data: [record], meta: { current_page: 2, total: 20 } }
    const get = vi.fn().mockResolvedValue(record)
    const getAll = vi.fn().mockResolvedValue(list)
    const { result, unmount } = renderHook(() => ({
      detail: useGet(["existing", "detail", 7], get),
      list: useGetAll(["existing", "list", 2, "pending"], getAll),
    }), { wrapper })
    await waitFor(() => expect(result.current.detail.isSuccess && result.current.list.isSuccess).toBe(true))
    expect(client.getQueryData(["existing", "detail", 7])).toEqual(record)
    expect(result.current.list.data).toEqual(list)
    await waitFor(() => expect(useLoadingStore.getState().count).toBe(0))
    unmount()
    expect(useLoadingStore.getState().count).toBe(0)
  })

  it.each(["create", "update", "delete"] as const)("preserves %s callback, targeted invalidation and loading behavior", async (operation) => {
    const { wrapper, client } = setup()
    client.setQueryData(["existing", "list"], [])
    client.setQueryData(["unrelated"], { id: 1 })
    const fn = vi.fn().mockResolvedValue({ id: 7 })
    const onSuccess = vi.fn()
    const options = { invalidateKeys: [["existing", "list"]], successMessage: "Saved", onSuccess }
    const { result } = renderHook(() => {
      const create = useCreate(fn, options)
      const update = useUpdate(fn, options)
      const remove = useDelete(fn, options)
      return operation === "create" ? create : operation === "update" ? update : remove
    }, { wrapper })
    await act(async () => { await result.current.mutateAsync("input") })
    expect(fn).toHaveBeenCalledWith("input", expect.anything())
    expect(onSuccess).toHaveBeenCalledWith({ id: 7 }, "input")
    expect(toastService.success).toHaveBeenCalledWith("Saved")
    expect(client.getQueryState(["existing", "list"])?.isInvalidated).toBe(true)
    expect(client.getQueryState(["unrelated"])?.isInvalidated).toBe(false)
    expect(useLoadingStore.getState().count).toBe(0)
  })

  it("preserves mutation error callbacks/toasts and balances the loader", async () => {
    const { wrapper, client } = setup()
    client.setQueryData(["existing", "list"], [])
    const error = { message: "Temporary failure", statusCode: 503 }
    const onError = vi.fn()
    const { result } = renderHook(() => useCreate(vi.fn().mockRejectedValue(error), {
      invalidateKeys: [["existing", "list"]], errorMessage: "Unable to save", onError,
    }), { wrapper })
    await act(async () => { await expect(result.current.mutateAsync("input")).rejects.toEqual(error) })
    expect(onError).toHaveBeenCalledWith(error, "input")
    expect(toastService.error).toHaveBeenCalledWith("Unable to save", "Temporary failure")
    expect(client.getQueryState(["existing", "list"])?.isInvalidated).toBe(false)
    expect(useLoadingStore.getState().count).toBe(0)
  })
})
