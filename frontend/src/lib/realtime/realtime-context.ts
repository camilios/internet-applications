import { createContext, useContext } from "react"
import type { RealtimeConnectionManager } from "./connection-manager"

export const RealtimeContext = createContext<RealtimeConnectionManager | null>(null)

export function useRealtimeConnection() {
  return useContext(RealtimeContext)
}
