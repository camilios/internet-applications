import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { authApi } from "../api/auth.api"
import { useAuthStore } from "../stores/auth.store"
import { useLoadingStore } from "@/stores/loading.store"
import { toastService } from "@/lib/toast"
import type { ApiError } from "@/types/api"
import type { AuthTokenResponse, RegisterCredentials } from "@/types/auth"

export function useRegister() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const start = useLoadingStore((s) => s.start)
  const stop = useLoadingStore((s) => s.stop)

  return useMutation<AuthTokenResponse, ApiError, RegisterCredentials>({
    mutationFn: (credentials) => authApi.register(credentials),
    onMutate: () => start(),
    onSuccess: (data) => {
      // الباك يسجّل الدخول تلقائياً بعد التسجيل
      setAuth(data.user, data.access_token)
      toastService.success("تم إنشاء الحساب بنجاح")
      navigate({ to: "/" })
    },
    onError: (error) => {
      toastService.error("فشل إنشاء الحساب", error.message)
    },
    onSettled: () => stop(),
  })
}
