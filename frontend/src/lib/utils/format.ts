/**
 * Formatting helpers – keep them pure and reusable.
 */

export function formatCurrency(amount: number | string, currency = "SAR") {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number(amount))
}

export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions) {
  const d = typeof date === "string" ? new Date(date) : date
  return new Intl.DateTimeFormat("ar-SA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    // ar-SA يستخدم التقويم الهجري افتراضياً، نفرض الميلادي
    calendar: "gregory",
    ...options,
  }).format(d)
}

export function formatRelativeTime(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date
  const rtf = new Intl.RelativeTimeFormat("ar", { numeric: "auto" })
  const diff = d.getTime() - Date.now()
  const days = Math.round(diff / (1000 * 60 * 60 * 24))

  if (Math.abs(days) < 1) {
    const hours = Math.round(diff / (1000 * 60 * 60))
    if (Math.abs(hours) < 1) {
      const minutes = Math.round(diff / (1000 * 60))
      return rtf.format(minutes, "minute")
    }
    return rtf.format(hours, "hour")
  }
  return rtf.format(days, "day")
}
