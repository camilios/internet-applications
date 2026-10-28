import type { OrderStatus } from "@/lib/constants/order-status"
import type { Product } from "@/features/products/types"
import type { User } from "@/types/auth"

export interface OrderItem {
  id: number
  product: Product
  quantity: number
  unit_price: string
  subtotal: string
}

export interface Order {
  id: number
  user_id: number
  total: string
  status: OrderStatus
  items: OrderItem[]
  user?: User
  created_at: string
  updated_at: string
}

export interface OrderWithUser extends Order {
  user: User
}

export interface OrderItemInput {
  product_id: number
  quantity: number
}
