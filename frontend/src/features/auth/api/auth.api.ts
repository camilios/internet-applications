import { apiClient } from "@/lib/api/client"
import { endpoints } from "@/lib/api/endpoints"
import type { ApiResponse } from "@/types/api"
import type { AuthTokenResponse, LoginCredentials, RegisterCredentials, User } from "@/types/auth"

export const authApi = {
  login: async (credentials: LoginCredentials) => {
    const { data } = await apiClient.post<AuthTokenResponse>(endpoints.auth.login, {
      email: credentials.email,
      password: credentials.password,
    })
    return data
  },

  register: async (credentials: RegisterCredentials) => {
    const { data } = await apiClient.post<AuthTokenResponse>(endpoints.auth.register, {
      name: credentials.name,
      email: credentials.email,
      password: credentials.password,
      password_confirmation: credentials.passwordConfirmation,
    })
    return data
  },

  me: async () => {
    const { data } = await apiClient.get<ApiResponse<User>>(endpoints.auth.me)
    return data.data
  },

  logout: async () => {
    await apiClient.post(endpoints.auth.logout)
  },
}
