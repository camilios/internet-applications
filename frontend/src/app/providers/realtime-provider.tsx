import { useEffect, useState, type ReactNode } from "react"
import { useQueryClient, type Query } from "@tanstack/react-query"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { createEchoClient } from "@/lib/realtime/echo-client"
import { RealtimeContext } from "@/lib/realtime/realtime-context"
import {
  RealtimeConnectionManager,
  type RealtimeClientFactory,
  type RealtimeSession,
} from "@/lib/realtime/connection-manager"

function currentSession(): RealtimeSession | null {
  const { user, token, isAuthenticated } = useAuthStore.getState()
  return isAuthenticated && user && token ? { userId: user.id, role: user.role, token } : null
}

function isSessionQuery(query: Query) {
  return ["orders", "dashboard", "notifications", "users"].includes(String(query.queryKey[0]))
}

export function RealtimeProvider({
  children,
  createClient = createEchoClient,
}: {
  children: ReactNode
  createClient?: RealtimeClientFactory
}) {
  const queryClient = useQueryClient()
  const [manager] = useState(() => new RealtimeConnectionManager(createClient))

  useEffect(() => {
    let previous = currentSession()
    manager.setSession(previous)
    const unsubscribe = useAuthStore.subscribe(() => {
      const session = currentSession()
      manager.setSession(session)
      if (session?.userId !== previous?.userId || session?.role !== previous?.role) {
        // Order list keys are shared by both roles. Discard protected data on account changes.
        void queryClient.cancelQueries({ predicate: isSessionQuery })
        queryClient.removeQueries({ predicate: isSessionQuery })
      }
      previous = session
    })
    return () => {
      unsubscribe()
      manager.dispose()
    }
  }, [manager, queryClient])

  return <RealtimeContext.Provider value={manager}>{children}</RealtimeContext.Provider>
}
