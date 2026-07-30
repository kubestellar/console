import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react'

interface PersistedStateOptions<T> {
  deserialize?: (raw: string) => T
  serialize?: (value: T) => string
  removeWhen?: (value: T) => boolean
}

function resolveDefaultValue<T>(defaultValue: T | (() => T)): T {
  return typeof defaultValue === 'function'
    ? (defaultValue as () => T)()
    : defaultValue
}

export function usePersistedState<T>(
  key: string,
  defaultValue: T | (() => T),
  options: PersistedStateOptions<T> = {},
): [T, Dispatch<SetStateAction<T>>] {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored === null) {
        return resolveDefaultValue(defaultValue)
      }
      const { deserialize } = optionsRef.current
      return deserialize ? deserialize(stored) : JSON.parse(stored) as T
    } catch {
      return resolveDefaultValue(defaultValue)
    }
  })

  const setPersistedState = useCallback<Dispatch<SetStateAction<T>>>(
    (value) => {
      setState((prev) => {
        const next = typeof value === 'function'
          ? (value as (previousState: T) => T)(prev)
          : value

        try {
          const { removeWhen, serialize } = optionsRef.current
          if (removeWhen?.(next)) {
            localStorage.removeItem(key)
          } else {
            const serialized = serialize ? serialize(next) : JSON.stringify(next)
            localStorage.setItem(key, serialized)
          }
        } catch {
          // localStorage unavailable/full — keep in-memory state unchanged.
        }

        return next
      })
    },
    [key],
  )

  return [state, setPersistedState]
}
