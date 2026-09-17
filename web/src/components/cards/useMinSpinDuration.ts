import { useState, useEffect, useRef } from 'react'
import { MIN_SPIN_DURATION } from './CardWrapper.constants'

/**
 * Keeps the refresh spinner visible for at least MIN_SPIN_DURATION so quick
 * refreshes don't produce a jarring flicker. Extracted from CardWrapper (#22959).
 *
 * @param isRefreshing whether a refresh is currently in progress (prop or child-reported)
 */
export function useMinSpinDuration(isRefreshing: boolean): boolean {
  const [isVisuallySpinning, setIsVisuallySpinning] = useState(false)
  const spinStartRef = useRef<number | null>(null)

  useEffect(() => {
    if (isRefreshing) {
      setIsVisuallySpinning(true)
      spinStartRef.current = Date.now()
    } else if (spinStartRef.current !== null) {
      const elapsed = Date.now() - spinStartRef.current
      const remaining = Math.max(0, MIN_SPIN_DURATION - elapsed)

      if (remaining > 0) {
        const timeout = setTimeout(() => {
          setIsVisuallySpinning(false)
          spinStartRef.current = null
        }, remaining)
        return () => clearTimeout(timeout)
      } else {
        setIsVisuallySpinning(false)
        spinStartRef.current = null
      }
    }
  }, [isRefreshing])

  return isVisuallySpinning
}
