import { useState, useEffect, useCallback } from "react"
import { getStorageItem, setStorageItem } from "@/lib/utils/storage"

/**
 * React state synced with localStorage.
 * الكتابة للتخزين تصير في effect (مو داخل state updater).
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() =>
    getStorageItem(key, initialValue)
  )

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    setStoredValue((prev) => (value instanceof Function ? value(prev) : value))
  }, [])

  useEffect(() => {
    setStorageItem(key, storedValue)
  }, [key, storedValue])

  // مزامنة بين الـ tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === key && e.newValue) {
        try {
          setStoredValue(JSON.parse(e.newValue))
        } catch {
          // ignore invalid JSON
        }
      }
    }
    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [key])

  return [storedValue, setValue] as const
}
