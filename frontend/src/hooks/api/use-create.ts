import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
} from "@tanstack/react-query"
import { useLoadingStore } from "@/stores/loading.store"
import { toastService } from "@/lib/toast"
import type { ApiError } from "@/types/api"

interface UseCreateOptions<TData, TVariables>
  extends Omit<
    UseMutationOptions<TData, ApiError, TVariables>,
    "mutationFn" | "onMutate" | "onSuccess" | "onError" | "onSettled"
  > {
  /** queryKeys لازم تتعمل invalidate بعد النجاح */
  invalidateKeys?: QueryKey[]
  /** رسالة نجاح مخصصة */
  successMessage?: string
  /** رسالة فشل مخصصة */
  errorMessage?: string
  /** إظهار Global Spinner (افتراضي: true) */
  showGlobalLoader?: boolean
  /** callback إضافي بعد النجاح */
  onSuccess?: (data: TData, variables: TVariables) => void
  onError?: (error: ApiError, variables: TVariables) => void
}

/**
 * useCreate – عملية إنشاء مع Toast + Global Spinner + Invalidate تلقائي.
 *
 * @example
 * const createProduct = useCreate({
 *   mutationFn: productsApi.create,
 *   invalidateKeys: [productKeys.lists()],
 *   successMessage: "تم إضافة المنتج بنجاح",
 * })
 *
 * createProduct.mutate({ name: "...", price: 100 })
 */
export function useCreate<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: UseCreateOptions<TData, TVariables> = {}
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
      // Invalidate القوائم
      invalidateKeys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key })
      })

      toastService.success(
        successMessage ?? "تمت الإضافة بنجاح"
      )

      onSuccess?.(data, variables)
    },
    onError: (error, variables) => {
      toastService.error(
        errorMessage ?? "فشلت عملية الإضافة",
        error?.message
      )
      onError?.(error, variables)
    },
    onSettled: () => {
      if (showGlobalLoader) stop()
    },
  })
}
