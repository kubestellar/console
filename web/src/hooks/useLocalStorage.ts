import { useState, useEffect, useCallback, useRef } from 'react'

export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  options?: { serialize?: (v: T) => string; deserialize?: (s: string) => T }
): [T, (value: T | ((prev: T) => T)) => void] {
  const serialize = options?.serialize ?? JSON.stringify
  const deserialize = options?.deserialize ?? JSON.parse
  const lastObservedStorage = useRef<string | null>(null)

  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      lastObservedStorage.current = stored
      return stored !== null ? deserialize(stored) : defaultValue
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    try {
      const serializedValue = serialize(value)
      const storedValue = localStorage.getItem(key)

      if (
        storedValue !== null
        && storedValue !== lastObservedStorage.current
        && storedValue !== serializedValue
      ) {
        // Another same-tab caller wrote localStorage directly after this hook
        // initialized. Preserve that newer storage value instead of clobbering
        // it with stale React state; the next navigation or storage event will
        // rehydrate hook state from localStorage.
        return
      }

      if (storedValue !== serializedValue) {
        localStorage.setItem(key, serializedValue)
      }
      lastObservedStorage.current = serializedValue
    } catch {
      // Storage quota exceeded — silently ignore
    }
  }, [key, value, serialize, deserialize])

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === key) {
        try {
          lastObservedStorage.current = e.newValue
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
    setValue((previousValue) => {
      const nextValue = typeof newValue === 'function'
        ? (newValue as (prev: T) => T)(previousValue)
        : newValue
      try {
        const serializedValue = serialize(nextValue)
        localStorage.setItem(key, serializedValue)
        lastObservedStorage.current = serializedValue
      } catch {
        // Storage quota exceeded - keep React state in sync even if persistence fails.
      }
      return nextValue
    })
  }, [key, serialize])

  return [value, setStoredValue]
}
