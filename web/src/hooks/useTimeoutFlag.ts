import { useState, useEffect } from 'react'

/**
 * Returns a boolean that starts as `false` and flips to `true` after `ms` milliseconds.
 * If `skip` is true the flag is immediately true (useful for demo mode bypass).
 */
export function useTimeoutFlag(ms: number, skip = false): boolean {
  const [flag, setFlag] = useState(skip)

  useEffect(() => {
    if (skip) return
    const timer = setTimeout(() => setFlag(true), ms)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- mount-only by design

  return flag
}

/**
 * Returns a boolean that becomes `true` after `ms` when `condition` is true.
 * Resets to `false` when `condition` flips to false.
 */
export function useConditionalTimeout(condition: boolean, ms: number): boolean {
  const [flag, setFlag] = useState(false)

  useEffect(() => {
    if (condition) {
      setFlag(false)
      const timer = setTimeout(() => setFlag(true), ms)
      return () => clearTimeout(timer)
    }
    setFlag(false)
  }, [condition, ms])

  return flag
}
