import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
} from "@tanstack/react-query"
import { useLoadingStore } from "@/stores/loading.store"
import { toastService } from "@/lib/toast"
import type { ApiError } from "@/types/api"

interface UseDeleteOptions<TData, TVariables>
  extends Omit<
    UseMutationOptions<TData, ApiError, TVariables>,
    "mutationFn" | "onMutate" | "onSuccess" | "onError" | "onSettled"
  > {
  invalidateKeys?: QueryKey[]
  successMessage?: string
  errorMessage?: string
  showGlobalLoader?: boolean
  onSuccess?: (data: TData, variables: TVariables) => void
  onError?: (error: ApiError, variables: TVariables) => void
}

/**
 * useDelete – عملية حذف مع Toast + Global Spinner + Invalidate.
 *
 * @example
 * const deleteProduct = useDelete({
 *   mutationFn: productsApi.delete,
 *   invalidateKeys: [productKeys.lists()],
 *   successMessage: "تم حذف المنتج",
 * })
 *
 * deleteProduct.mutate(productId)
 */
export function useDelete<TData = void, TVariables = string>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: UseDeleteOptions<TData, TVariables> = {}
) {
  const {
    invalidateKeys = [],
    successMessage,
    errorMessage,
    showGlobalLoader = true,
    onSuccess,
    onError,
    ...mutationOptions
  } = options

  const queryClient = useQueryClient()
  const start = useLoadingStore((s) => s.start)
  const stop = useLoadingStore((s) => s.stop)

  return useMutation<TData, ApiError, TVariables>({
    mutationFn,
    ...mutationOptions,
    onMutate: () => {
      if (showGlobalLoader) start()
    },
    onSuccess: (data, variables) => {
      invalidateKeys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key })
      })

      toastService.success(
        successMessage ?? "تم الحذف بنجاح"
      )

      onSuccess?.(data, variables)
    },
    onError: (error, variables) => {
      toastService.error(
        errorMessage ?? "فشلت عملية الحذف",
        error?.message
      )
      onError?.(error, variables)
    },
    onSettled: () => {
      if (showGlobalLoader) stop()
    },
  })
}
