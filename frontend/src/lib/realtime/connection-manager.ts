export interface RealtimeSession {
  userId: number
  role: string
  token: string
}

type EventListener = (payload: unknown) => void

export interface RealtimeChannel {
  listen: (event: string, listener: EventListener) => void
  stopListening: (event: string, listener: EventListener) => void
  onSubscribed: (listener: () => void) => () => void
}

export interface RealtimeClient {
  private: (channel: string) => RealtimeChannel
  leave: (channel: string) => void
  disconnect: () => void
}

export type RealtimeClientFactory = (session: RealtimeSession) => RealtimeClient | null

interface Subscription {
  channel: string
  event: string
  isAllowed: (session: RealtimeSession) => boolean
  onEvent: EventListener
  onSubscribed: () => void
}

interface EventGroup {
  listener: EventListener
  subscribers: Map<symbol, Subscription>
}

interface ChannelGroup {
  channel: RealtimeChannel
  events: Map<string, EventGroup>
  subscribed: boolean
  removeSubscriptionListener: () => void
}

export function sameSession(left: RealtimeSession | null, right: RealtimeSession | null) {
  return left?.userId === right?.userId && left?.role === right?.role && left?.token === right?.token
}

/** Owns transport resources only. Server data remains in the existing QueryClient. */
export class RealtimeConnectionManager {
  private session: RealtimeSession | null = null
  private sessionGeneration = 0
  private client: RealtimeClient | null = null
  private subscriptions = new Map<symbol, Subscription>()
  private channels = new Map<string, ChannelGroup>()
  private readonly createClient: RealtimeClientFactory

  constructor(createClient: RealtimeClientFactory) {
    this.createClient = createClient
  }

  setSession(session: RealtimeSession | null) {
    if (sameSession(this.session, session)) return
    this.disconnect()
    this.session = session
    this.sessionGeneration++
    for (const [id, subscription] of this.subscriptions) this.attach(id, subscription)
  }

  getSessionGeneration() {
    return this.sessionGeneration
  }

  subscribe(subscription: Subscription) {
    const id = Symbol(subscription.channel)
    this.subscriptions.set(id, subscription)
    this.attach(id, subscription)

    return () => {
      if (!this.subscriptions.delete(id)) return
      const group = this.channels.get(subscription.channel)
      const event = group?.events.get(subscription.event)
      if (!group || !event || !event.subscribers.delete(id)) return

      if (event.subscribers.size === 0) {
        group.channel.stopListening(subscription.event, event.listener)
        group.events.delete(subscription.event)
      }
      if (group.events.size === 0) {
        group.removeSubscriptionListener()
        this.client?.leave(subscription.channel)
        this.channels.delete(subscription.channel)
      }
      if (this.channels.size === 0) {
        this.client?.disconnect()
        this.client = null
      }
    }
  }

  dispose() {
    this.disconnect()
    this.session = null
    this.subscriptions.clear()
  }

  private attach(id: symbol, subscription: Subscription) {
    const session = this.session
    if (!session || !subscription.isAllowed(session)) return
    if (!this.client) {
      try {
        this.client = this.createClient(session)
      } catch {
        console.warn("Real-time connection could not be initialized")
        return
      }
    }
    if (!this.client) return

    let group = this.channels.get(subscription.channel)
    if (!group) {
      const channel = this.client.private(subscription.channel)
      group = {
        channel,
        events: new Map(),
        subscribed: false,
        removeSubscriptionListener: () => {},
      }
      const currentGroup = group
      this.channels.set(subscription.channel, group)
      group.removeSubscriptionListener = channel.onSubscribed(() => {
        if (this.channels.get(subscription.channel) !== currentGroup || this.session !== session) return
        currentGroup.subscribed = true
        for (const event of currentGroup.events.values()) {
          for (const subscriber of event.subscribers.values()) subscriber.onSubscribed()
        }
      })
    }

    let event = group.events.get(subscription.event)
    if (!event) {
      const currentGroup = group
      const subscribers = new Map<symbol, Subscription>()
      const listener: EventListener = (payload) => {
        if (this.channels.get(subscription.channel) !== currentGroup || this.session !== session) return
        for (const subscriber of subscribers.values()) subscriber.onEvent(payload)
      }
      event = { listener, subscribers }
      group.events.set(subscription.event, event)
      group.channel.listen(subscription.event, listener)
    }
    event.subscribers.set(id, subscription)
    if (group.subscribed) subscription.onSubscribed()
  }

  private disconnect() {
    for (const [name, group] of this.channels) {
      group.removeSubscriptionListener()
      for (const [event, listener] of group.events) {
        group.channel.stopListening(event, listener.listener)
      }
      this.client?.leave(name)
    }
    this.channels.clear()
    this.client?.disconnect()
    this.client = null
  }
}
