/**
 * أشكال الاستجابات حسب الـ OpenAPI.
 * - العنصر الواحد: { data: T }
 * - القوائم: { data: T[], links, meta } (شكل Laravel)
 * - الأخطاء: { message, errors? } للتحقق، أو { message, code } للبقية
 */

export interface ApiResponse<T> {
  data: T
}

export interface PaginationLinks {
  first: string | null
  last: string | null
  prev: string | null
  next: string | null
}

export interface PaginationMeta {
  current_page: number
  from: number | null
  last_page: number
  per_page: number
  to: number | null
  total: number
}

export interface PaginatedResponse<T> {
  data: T[]
  links?: PaginationLinks
  meta: PaginationMeta
}

export interface MessageResponse {
  message: string
}

/** الشكل الموحّد اللي يبنيه الـ API client */
export interface ApiError {
  message: string
  errors?: Record<string, string[]>
  code?: string
  statusCode?: number
}
