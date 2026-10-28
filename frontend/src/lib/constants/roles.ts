export const ROLES = {
  CUSTOMER: "customer",
  ADMIN: "admin",
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export const ROLE_LABELS: Record<Role, string> = {
  customer: "زبون",
  admin: "مسؤول",
}
