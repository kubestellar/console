import { useState, useEffect, useRef } from 'react'

/**
 * Hook that returns true briefly when a value changes.
 * Useful for triggering flash animations on value updates.
 */
export function useFlashOnChange<T>(value: T, duration = 1000): boolean {
  const [isFlashing, setIsFlashing] = useState(false)
  const prevValueRef = useRef<T>(value)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    // Skip initial render and only flash on actual changes
    if (prevValueRef.current !== value && prevValueRef.current !== undefined) {
      setIsFlashing(true)

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      // Remove flash after duration
      timeoutRef.current = setTimeout(() => {
        setIsFlashing(false)
      }, duration)
    }

    prevValueRef.current = value

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [value, duration])

  return isFlashing
}
