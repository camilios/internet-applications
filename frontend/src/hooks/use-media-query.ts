import { useEffect, useState } from "react"

/**
 * Simple media query hook – works perfectly with Tailwind breakpoints.
 * القيمة الابتدائية تُحسب من الشاشة مباشرة (بدون flicker).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const media = window.matchMedia(query)
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches)

    setMatches(media.matches)
    media.addEventListener("change", listener)
    return () => media.removeEventListener("change", listener)
  }, [query])

  return matches
}

/**
 * Convenience hooks that match Tailwind defaults.
 */
export function useIsMobile() {
  return useMediaQuery("(max-width: 767px)")
}

export function useIsTablet() {
  return useMediaQuery("(min-width: 768px) and (max-width: 1023px)")
}

export function useIsDesktop() {
  return useMediaQuery("(min-width: 1024px)")
}
