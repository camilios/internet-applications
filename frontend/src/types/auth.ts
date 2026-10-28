import type { Role } from "@/lib/constants/roles"

export interface User {
  id: number
  name: string
  email: string
  role: Role
  created_at: string
}

/** استجابة /login و /register (بدون غلاف data) */
export interface AuthTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: User
}

export interface LoginCredentials {
  email: string
  password: string
}

/** الفورم يستخدم camelCase، والـ api يحوّلها لـ password_confirmation */
export interface RegisterCredentials {
  name: string
  email: string
  password: string
  passwordConfirmation: string
}
