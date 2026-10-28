import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { endpoints } from "@/lib/api/endpoints"
import type { ApiError } from "@/types/api"

/**
 * Central API client.
 * - Attaches JWT automatically
 * - Handles expired session globally (logout + redirect)
 * - Normalizes errors
 */

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api"

/** في هذه الطلبات الـ 401 يعني بيانات غلط، مو انتهاء جلسة */
const AUTH_FORM_URLS: string[] = [endpoints.auth.login, endpoints.auth.register]

type UnauthorizedHandler = () => void
let onUnauthorized: UnauthorizedHandler | null = null

/** يُستدعى من main.tsx ليتمكن الـ client من التنقل عبر الـ router بدون reload */
export function setUnauthorizedHandler(handler: UnauthorizedHandler) {
  onUnauthorized = handler
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  timeout: 15000,
})

// Request interceptor – attach token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor – handle auth errors & normalize
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    const url = error.config?.url ?? ""
    const isSessionExpired = error.response?.status === 401 && !AUTH_FORM_URLS.includes(url)

    if (isSessionExpired) {
      useAuthStore.getState().logout()
      onUnauthorized?.()
    }

    const apiError: ApiError = {
      message:
        error.response?.data?.message ??
        error.message ??
        "حدث خطأ غير متوقع",
      errors: error.response?.data?.errors,
      statusCode: error.response?.status,
    }

    return Promise.reject(apiError)
  }
)

export default apiClient
