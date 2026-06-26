import { useState, useEffect } from 'react'

/**
 * Returns `value` after `delayMs` of stable input. Useful for decoupling
 * a fast-typing UI input from an expensive downstream computation
 * (filter pipeline, network request, etc).
 *
 * Pattern: bind the typed input to local React state for responsiveness,
 * pass the local state through this hook, and feed the debounced result
 * into the heavy work:
 *
 *   const [search, setSearch] = useState('')
 *   const debouncedSearch = useDebouncedValue(search, 250)
 *   const filtered = useMemo(() => filter(items, debouncedSearch), [items, debouncedSearch])
 *
 * The `<input value={search} onChange={...}/>` stays at typing speed
 * while `filter()` only runs after the user pauses for 250ms.
 *
 * Added in #6213 — KubescapeDetailModal, TrivyDetailModal,
 * KyvernoDetailModal, and ClusterLocations had bare onChange handlers
 * that re-ran their full filter pipelines on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    if (delayMs <= 0) {
      setDebounced(value)
      return
    }
    const handle = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(handle)
  }, [value, delayMs])

  return debounced
}
