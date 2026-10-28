export interface NotificationData {
  order_id: number
  status: string
  total: string
  message: string
}

export interface Notification {
  id: string
  type: string
  data: NotificationData
  read_at: string | null
  created_at: string
}
