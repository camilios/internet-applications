import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
} from "@tanstack/react-query"
import { useEffect } from "react"
import { useLoadingStore } from "@/stores/loading.store"
import { toastService } from "@/lib/toast"
import type { ApiError } from "@/types/api"

interface UseGetAllOptions<TData>
  extends Omit<UseQueryOptions<TData, ApiError>, "queryKey" | "queryFn"> {
  showGlobalLoader?: boolean
  showErrorToast?: boolean
  errorMessage?: string
}

/**
 * useGetAll – جلب قائمة (مع pagination / filters).
 *
 * @example
 * const { data, isLoading } = useGetAll({
 *   queryKey: productKeys.list(filters),
 *   queryFn: () => productsApi.getAll(filters),
 * })
 */
export function useGetAll<TData>(
  queryKey: QueryKey,
  queryFn: () => Promise<TData>,
  options: UseGetAllOptions<TData> = {}
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
