import { create } from "zustand"

interface LoadingState {
  /** عدد العمليات الجارية (queries + mutations) */
  count: number
  /** هل في أي عملية جارية؟ */
  isLoading: boolean
  start: () => void
  stop: () => void
  reset: () => void
}

/**
 * Global Loading Store
 * كل useGet / useGetAll / useCreate / useUpdate / useDelete
 * يستدعي start() عند البدء و stop() عند الانتهاء.
 * الـ GlobalSpinner يقرأ isLoading ويعرض الـ overlay.
 */
export const useLoadingStore = create<LoadingState>((set, get) => ({
  count: 0,
  isLoading: false,

  start: () => {
    const next = get().count + 1
    set({ count: next, isLoading: true })
  },

  stop: () => {
    const next = Math.max(0, get().count - 1)
    set({ count: next, isLoading: next > 0 })
  },

  reset: () => set({ count: 0, isLoading: false }),
}))
