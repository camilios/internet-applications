import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
} from "@tanstack/react-query"
import { useEffect } from "react"
import { useLoadingStore } from "@/stores/loading.store"
import { toastService } from "@/lib/toast"
import type { ApiError } from "@/types/api"

interface UseGetOptions<TData>
  extends Omit<UseQueryOptions<TData, ApiError>, "queryKey" | "queryFn"> {
  /** إظهار الـ Global Spinner أثناء الجلب (افتراضي: true) */
  showGlobalLoader?: boolean
  /** إظهار توست عند الفشل (افتراضي: true) */
  showErrorToast?: boolean
  /** رسالة خطأ مخصصة */
  errorMessage?: string
}

/**
 * useGet – جلب عنصر واحد بالـ id.
 *
 * @example
 * const { data, isLoading } = useGet({
 *   queryKey: productKeys.detail(id),
 *   queryFn: () => productsApi.getById(id),
 *   enabled: !!id,
 * })
 */
export function useGet<TData>(
  queryKey: QueryKey,
  queryFn: () => Promise<TData>,
  options: UseGetOptions<TData> = {}
) {
  const {
    showGlobalLoader = true,
    showErrorToast = true,
    errorMessage,
    ...queryOptions
  } = options

  const start = useLoadingStore((s) => s.start)
  const stop = useLoadingStore((s) => s.stop)

  const query = useQuery<TData, ApiError>({
    queryKey,
    queryFn,
    ...queryOptions,
  })

  // ربط الـ Global Spinner: start و stop دايماً بالتزامن (كل start له stop واحد)
  useEffect(() => {
    if (!showGlobalLoader || !query.isFetching) return
    start()
    return stop
  }, [query.isFetching, showGlobalLoader, start, stop])

  // توست عند الفشل
  useEffect(() => {
    if (query.isError && showErrorToast) {
      toastService.error(
        errorMessage ?? "فشل جلب البيانات",
        query.error?.message
      )
    }
  }, [query.isError, query.error, showErrorToast, errorMessage])

  return query
}
