import Echo from "laravel-echo"
import Pusher from "pusher-js"
import { apiClient } from "@/lib/api/client"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import type { RealtimeClient, RealtimeSession } from "./connection-manager"

interface ChannelAuthorization {
  auth: string
  channel_data?: string
  shared_secret?: string
}

function isCurrentSession(session: RealtimeSession) {
  const state = useAuthStore.getState()
  return state.isAuthenticated && state.token === session.token &&
    state.user?.id === session.userId && state.user.role === session.role
}

export function createEchoClient(session: RealtimeSession): RealtimeClient | null {
  const key = import.meta.env.VITE_REVERB_APP_KEY
  if (!key) return null

  let active = true
  const requests = new Set<AbortController>()
  const secure = (import.meta.env.VITE_REVERB_SCHEME ?? window.location.protocol.replace(":", "")) === "https"
  const port = Number(import.meta.env.VITE_REVERB_PORT ?? (secure ? 443 : 8080))
  const echo = new Echo({
    broadcaster: "reverb",
    withoutInterceptors: true,
    Pusher,
    key,
    wsHost: import.meta.env.VITE_REVERB_HOST || window.location.hostname,
    wsPort: port,
    wssPort: port,
    forceTLS: secure,
    enabledTransports: ["ws", "wss"],
    // Preserve the existing Axios token, timeout and expired-session handling.
    authorizer: (channel: { name: string }) => ({
      authorize: (socketId: string, callback: (error: Error | null, data: ChannelAuthorization | null) => void) => {
        if (!active || !isCurrentSession(session)) {
          callback(new Error("Authentication session changed"), null)
          return
        }
        const controller = new AbortController()
        requests.add(controller)
        void apiClient.post<ChannelAuthorization>("/broadcasting/auth", {
          socket_id: socketId,
          channel_name: channel.name,
        }, { signal: controller.signal }).then(({ data }) => {
          if (active && isCurrentSession(session)) callback(null, data)
          else callback(new Error("Authentication session changed"), null)
        }).catch(() => {
          callback(new Error("Private channel authorization failed"), null)
        }).finally(() => requests.delete(controller))
      },
    }),
  })

  return {
    private: (name) => {
      const channel = echo.private(name)
      return {
        listen: (event, listener) => { channel.listen(event, listener) },
        stopListening: (event, listener) => { channel.stopListening(event, listener) },
        onSubscribed: (listener) => {
          // Bind directly so the exact subscription callback can be removed on cleanup.
          channel.subscription.bind("pusher:subscription_succeeded", listener)
          return () => channel.subscription.unbind("pusher:subscription_succeeded", listener)
        },
      }
    },
    leave: (name) => { echo.leave(name) },
    disconnect: () => {
      active = false
      for (const request of requests) request.abort()
      requests.clear()
      echo.disconnect()
    },
  }
}
