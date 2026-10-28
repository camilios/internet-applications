/**
 * Single source of truth for all API endpoints.
 * مطابقة لملف OpenAPI (for_frontend.json).
 * الـ base URL هو .../api، والمسارات هنا نسبية له (مثلاً /login).
 */
export const endpoints = {
  auth: {
    login: "/login",
    register: "/register",
    logout: "/logout",
    me: "/me",
  },
  dashboard: "/dashboard",
  users: {
    list: "/users",
  },
  categories: {
    list: "/categories",
    detail: (id: number) => `/categories/${id}`,
  },
  products: {
    list: "/products",
    detail: (id: number) => `/products/${id}`,
    create: "/products",
    update: (id: number) => `/products/${id}`,
    delete: (id: number) => `/products/${id}`, // يعطّل المنتج ولا يحذفه
  },
  orders: {
    list: "/orders",
    detail: (id: number) => `/orders/${id}`,
    create: "/orders",
    admin: {
      list: "/admin/orders",
      updateStatus: (id: number) => `/admin/orders/${id}/status`,
    },
  },
  notifications: {
    list: "/notifications",
    readAll: "/notifications/read-all",
    markRead: (id: string) => `/notifications/${id}/read`,
  },
} as const
