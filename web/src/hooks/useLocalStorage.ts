import { useState, useEffect, useCallback } from 'react'

export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  options?: { serialize?: (v: T) => string; deserialize?: (s: string) => T }
): [T, (value: T | ((prev: T) => T)) => void] {
  const serialize = options?.serialize ?? JSON.stringify
  const deserialize = options?.deserialize ?? JSON.parse

  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored !== null ? deserialize(stored) : defaultValue
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, serialize(value))
    } catch {
      // Storage quota exceeded — silently ignore
    }
  }, [key, value, serialize])

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === key) {
        try {
          setValue(e.newValue !== null ? deserialize(e.newValue) : defaultValue)
        } catch {
          setValue(defaultValue)
        }
      }
    }

    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [key, defaultValue, deserialize])

  const setStoredValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(newValue)
  }, [])

  return [value, setStoredValue]
}
