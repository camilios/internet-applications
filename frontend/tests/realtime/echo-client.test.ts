import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createEchoClient } from "@/lib/realtime/echo-client"
import { useAuthStore } from "@/features/auth/stores/auth.store"

type AuthCallback = (error: Error | null, data: { auth: string } | null) => void
interface CapturedOptions {
  broadcaster: string
  wsHost: string
  wsPort: number
  forceTLS: boolean
  withoutInterceptors: boolean
  authorizer: (channel: { name: string }) => { authorize: (socket: string, callback: AuthCallback) => void }
}

const mocks = vi.hoisted(() => ({
  post: vi.fn(), bind: vi.fn(), unbind: vi.fn(), listen: vi.fn(), stopListening: vi.fn(),
  disconnect: vi.fn(), leave: vi.fn(), options: null as CapturedOptions | null,
}))
vi.mock("@/lib/api/client", () => ({ apiClient: { post: mocks.post } }))
vi.mock("laravel-echo", () => ({ default: class {
  constructor(options: CapturedOptions) { mocks.options = options }
  private() { return {
    subscription: { bind: mocks.bind, unbind: mocks.unbind }, listen: mocks.listen, stopListening: mocks.stopListening,
  } }
  leave = mocks.leave
  disconnect = mocks.disconnect
} }))

const session = { userId: 2, role: "customer", token: "session-token" }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("VITE_REVERB_APP_KEY", "public-app-key")
  vi.stubEnv("VITE_REVERB_HOST", "realtime.example.test")
  vi.stubEnv("VITE_REVERB_PORT", "443")
  vi.stubEnv("VITE_REVERB_SCHEME", "https")
  useAuthStore.getState().setAuth({ id: 2, role: "customer", name: "Customer", email: "c@example.test", created_at: "2026-01-01" }, session.token)
})
afterEach(() => { vi.unstubAllEnvs(); useAuthStore.getState().logout() })

describe("Echo authorization adapter", () => {
  it("uses Reverb options and the existing Axios authorization layer", async () => {
    mocks.post.mockResolvedValue({ data: { auth: "signed-channel" } })
    const client = createEchoClient(session)!
    const options = mocks.options!
    expect(options).toMatchObject({ broadcaster: "reverb", wsHost: "realtime.example.test", wsPort: 443, forceTLS: true, withoutInterceptors: true })
    const callback = vi.fn()
    options.authorizer({ name: "private-orders.7" }).authorize("10.20", callback)
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(null, { auth: "signed-channel" }))
    expect(mocks.post).toHaveBeenCalledWith("/broadcasting/auth", {
      socket_id: "10.20", channel_name: "private-orders.7",
    }, { signal: expect.any(AbortSignal) })
    const channel = client.private("orders.7")
    const resync = vi.fn()
    const remove = channel.onSubscribed(resync)
    expect(mocks.bind).toHaveBeenCalledWith("pusher:subscription_succeeded", resync)
    remove()
    expect(mocks.unbind).toHaveBeenCalledWith("pusher:subscription_succeeded", resync)
    client.disconnect()
  })

  it("aborts outstanding auth and rejects late responses after logout", async () => {
    let resolve: (data: { data: { auth: string } }) => void = () => {}
    mocks.post.mockImplementation(() => new Promise((done) => { resolve = done }))
    const client = createEchoClient(session)!
    const callback = vi.fn()
    mocks.options!.authorizer({ name: "private-orders.7" }).authorize("10.20", callback)
    const signal = mocks.post.mock.calls[0][2].signal as AbortSignal
    useAuthStore.getState().logout()
    client.disconnect()
    expect(signal.aborted).toBe(true)
    resolve({ data: { auth: "old-session-signature" } })
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(expect.any(Error), null))
    expect(callback).not.toHaveBeenCalledWith(null, expect.anything())
    expect(mocks.disconnect).toHaveBeenCalledOnce()
  })

  it("rejects stale sessions before making an authorization request and supports disabled configuration", () => {
    createEchoClient(session)
    useAuthStore.getState().logout()
    const callback = vi.fn()
    mocks.options!.authorizer({ name: "private-orders.7" }).authorize("10.20", callback)
    expect(mocks.post).not.toHaveBeenCalled()
    expect(callback).toHaveBeenCalledWith(expect.any(Error), null)
    vi.stubEnv("VITE_REVERB_APP_KEY", "")
    expect(createEchoClient(session)).toBeNull()
  })
})
