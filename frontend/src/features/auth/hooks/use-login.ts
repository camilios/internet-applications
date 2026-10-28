import { useMutation } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { authApi } from "../api/auth.api"
import { useAuthStore } from "../stores/auth.store"
import { useLoadingStore } from "@/stores/loading.store"
import { toastService } from "@/lib/toast"
import { getSafeRedirect } from "@/lib/utils/safe-redirect"
import type { ApiError } from "@/types/api"
import type { AuthTokenResponse, LoginCredentials } from "@/types/auth"

export function useLogin(redirectTo?: string) {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const start = useLoadingStore((s) => s.start)
  const stop = useLoadingStore((s) => s.stop)

  return useMutation<AuthTokenResponse, ApiError, LoginCredentials>({
    mutationFn: (credentials) => authApi.login(credentials),
    onMutate: () => start(),
    onSuccess: (data) => {
      setAuth(data.user, data.access_token)
      toastService.success("تم تسجيل الدخول بنجاح")
      void router.history.push(getSafeRedirect(redirectTo))
    },
    onError: (error) => {
      toastService.error("فشل تسجيل الدخول", error.message)
    },
    onSettled: () => stop(),
  })
}
