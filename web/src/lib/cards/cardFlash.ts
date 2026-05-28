import { useState, useRef, useEffect, useCallback } from 'react'
import { FLASH_ANIMATION_MS } from '../constants/network'

export const DEFAULT_FLASH_THRESHOLD_RATIO = 0.1
export const DEFAULT_FLASH_COOLDOWN_MS = 5_000

// ============================================================================
// useCardFlash - Track significant data changes for card flash animation
// ============================================================================

export type CardFlashType = 'none' | 'info' | 'warning' | 'error'

export interface UseCardFlashOptions {
  /** Threshold for considering a change "significant" (default: 0.1 = 10%) */
  threshold?: number
  /** Cooldown period in ms before allowing another flash (default: 5000) */
  cooldown?: number
  /** Flash type when value increases (default: 'info') */
  increaseType?: CardFlashType
  /** Flash type when value decreases (default: 'info') */
  decreaseType?: CardFlashType
}

export interface UseCardFlashResult {
  /** Current flash type to pass to CardWrapper */
  flashType: CardFlashType
  /** Reset the flash (call when animation ends) */
  resetFlash: () => void
}

/**
 * Hook to track significant numeric changes and trigger card flash animation.
 * Use this in card components to flash when important metrics change significantly.
 *
 * @param value - The numeric value to track
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * const { flashType } = useCardFlash(alertCount, {
 *   threshold: 0.2, // Flash if count changes by 20%
 *   increaseType: 'error', // Red flash when alerts increase
 *   decreaseType: 'info', // Purple flash when alerts decrease
 * })
 *
 * return (
 *   <CardWrapper flashType={flashType}>
 *     ...
 *   </CardWrapper>
 * )
 * ```
 */
export function useCardFlash(
  value: number,
  options: UseCardFlashOptions = {}
): UseCardFlashResult {
  const {
    threshold = DEFAULT_FLASH_THRESHOLD_RATIO,
    cooldown = DEFAULT_FLASH_COOLDOWN_MS,
    increaseType = 'info',
    decreaseType = 'info' } = options

  const [flashType, setFlashType] = useState<CardFlashType>('none')
  const prevValueRef = useRef<number | null>(null)
  const lastFlashTimeRef = useRef<number>(0)

  useEffect(() => {
    // Skip first render (no previous value to compare)
    if (prevValueRef.current === null) {
      prevValueRef.current = value
      return
    }

    const prevValue = prevValueRef.current
    prevValueRef.current = value

    // Skip if value is zero or unchanged
    if (value === 0 || value === prevValue) return

    // Check cooldown
    const now = Date.now()
    if (now - lastFlashTimeRef.current < cooldown) return

    // Calculate percentage change
    const change = Math.abs(value - prevValue) / Math.max(prevValue, 1)

    // Check if change exceeds threshold
    if (change >= threshold) {
      const type = value > prevValue ? increaseType : decreaseType
      setFlashType(type)
      lastFlashTimeRef.current = now

      // Auto-reset after animation completes
      setTimeout(() => setFlashType('none'), FLASH_ANIMATION_MS)
    }
  }, [value, threshold, cooldown, increaseType, decreaseType])

  const resetFlash = useCallback(() => {
    setFlashType('none')
  }, [])

  return { flashType, resetFlash }
}
