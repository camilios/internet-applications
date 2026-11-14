import { describe, expect, it, vi } from "vitest"
import { RealtimeConnectionManager } from "@/lib/realtime/connection-manager"
import { FakeClient } from "./fakes"

const admin = { userId: 1, role: "admin", token: "token-1" }

describe("shared real-time connection lifecycle", () => {
  it("shares one transport/listener and preserves other subscribers until final cleanup", () => {
    const client = new FakeClient()
    const factory = vi.fn(() => client)
    const manager = new RealtimeConnectionManager(factory)
    manager.setSession(admin)
    const first = vi.fn()
    const second = vi.fn()
    const settings = {
      channel: "admin.orders", event: ".OrderCreated",
      isAllowed: () => true, onSubscribed: vi.fn(),
    }
    const releaseFirst = manager.subscribe({ ...settings, onEvent: first })
    const releaseSecond = manager.subscribe({ ...settings, onEvent: second })
    const channel = client.channels.get("admin.orders")!
    expect(factory).toHaveBeenCalledTimes(1)
    expect(client.private).toHaveBeenCalledTimes(1)
    expect(channel.listen).toHaveBeenCalledTimes(1)

    channel.succeed()
    channel.emit(".OrderCreated", { order_id: 20 })
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    releaseFirst()
    releaseFirst()
    channel.emit(".OrderCreated", { order_id: 21 })
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)
    expect(client.leave).not.toHaveBeenCalled()
    releaseSecond()
    expect(channel.stopListening).toHaveBeenCalledTimes(1)
    expect(channel.subscriptionListeners.size).toBe(0)
    expect(client.leave).toHaveBeenCalledWith("admin.orders")
    expect(client.disconnect).toHaveBeenCalledTimes(1)
  })

  it("resynchronizes every successful subscription, including reconnects and late subscribers", () => {
    const client = new FakeClient()
    const manager = new RealtimeConnectionManager(() => client)
    manager.setSession(admin)
    const resync = vi.fn()
    const settings = {
      channel: "orders.7", event: ".OrderStatusUpdated",
      isAllowed: () => true, onEvent: vi.fn(), onSubscribed: resync,
    }
    manager.subscribe(settings)
    const channel = client.channels.get("orders.7")!
    channel.succeed()
    channel.succeed()
    expect(resync).toHaveBeenCalledTimes(2)
    const lateResync = vi.fn()
    manager.subscribe({ ...settings, onSubscribed: lateResync })
    expect(lateResync).toHaveBeenCalledTimes(1)
    manager.dispose()
  })

  it("replaces authenticated transports and never attaches forbidden stale subscriptions", () => {
    const clients: FakeClient[] = []
    const factory = vi.fn(() => {
      const client = new FakeClient()
      clients.push(client)
      return client
    })
    const manager = new RealtimeConnectionManager(factory)
    const listener = vi.fn()
    manager.subscribe({
      channel: "admin.orders", event: ".OrderCreated",
      isAllowed: (session) => session.role === "admin",
      onEvent: listener, onSubscribed: vi.fn(),
    })
    expect(factory).not.toHaveBeenCalled()
    manager.setSession(admin)
    const oldChannel = clients[0].channels.get("admin.orders")!
    const oldListener = [...oldChannel.listeners.get(".OrderCreated")!][0]
    manager.setSession({ ...admin, token: "token-2" })
    expect(clients[0].disconnect).toHaveBeenCalledOnce()
    expect(factory).toHaveBeenCalledTimes(2)
    oldListener({ order_id: 1 })
    expect(listener).not.toHaveBeenCalled()
    manager.setSession({ userId: 2, role: "customer", token: "token-3" })
    expect(clients[1].disconnect).toHaveBeenCalledOnce()
    expect(factory).toHaveBeenCalledTimes(2)
    manager.setSession(null)
    manager.dispose()
  })
})
