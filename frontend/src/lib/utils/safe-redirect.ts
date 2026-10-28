const BLOCKED_PATHS = ["/login", "/register"]

/**
 * يمنع open redirect: نقبل فقط مسارات داخلية تبدأ بـ "/".
 * أي قيمة غريبة (مثل https://evil.com أو //evil.com) ترجع للـ fallback.
 */
export function getSafeRedirect(target: string | undefined, fallback = "/") {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.includes("\\")) {
    return fallback
  }
  const isBlocked = BLOCKED_PATHS.some((p) => target === p || target.startsWith(`${p}?`))
  return isBlocked ? fallback : target
}
