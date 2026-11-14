import { vi } from "vitest"
import type { RealtimeChannel, RealtimeClient } from "@/lib/realtime/connection-manager"

type Listener = (payload: unknown) => void

export class FakeChannel implements RealtimeChannel {
  listeners = new Map<string, Set<Listener>>()
  subscriptionListeners = new Set<() => void>()
  listen = vi.fn((event: string, listener: Listener) => {
    const listeners = this.listeners.get(event) ?? new Set<Listener>()
    listeners.add(listener)
    this.listeners.set(event, listeners)
  })
  stopListening = vi.fn((event: string, listener: Listener) => {
    this.listeners.get(event)?.delete(listener)
  })
  onSubscribed = (listener: () => void) => {
    this.subscriptionListeners.add(listener)
    return () => { this.subscriptionListeners.delete(listener) }
  }
  emit(event: string, payload: unknown) {
    for (const listener of this.listeners.get(event) ?? []) listener(payload)
  }
  succeed() {
    for (const listener of this.subscriptionListeners) listener()
  }
}

export class FakeClient implements RealtimeClient {
  channels = new Map<string, FakeChannel>()
  private = vi.fn((name: string) => {
    const channel = this.channels.get(name) ?? new FakeChannel()
    this.channels.set(name, channel)
    return channel
  })
  leave = vi.fn((name: string) => { this.channels.delete(name) })
  disconnect = vi.fn()
}
