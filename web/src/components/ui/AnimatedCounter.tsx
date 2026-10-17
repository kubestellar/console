import { useState, useRef, useEffect } from 'react'
import { TRANSITION_DELAY_MS } from '../../lib/constants/network'

/** Maximum numeric value to display in the badge before switching to overflow text (e.g. "99+") */
const BADGE_MAX_COUNT = 99
/** Duration of the exit animation before swapping the counter value in milliseconds */
const ANIMATION_EXIT_DELAY_MS = 150

// Animated counter component for the badge - exported for future use
interface AnimationState {
  isAnimating: boolean
  direction: 'up' | 'down'
}

export function AnimatedCounter({ value, className }: { value: number; className?: string }) {
  const [displayValue, setDisplayValue] = useState(value)
  const [animState, setAnimState] = useState<AnimationState>({ isAnimating: false, direction: 'up' })
  const prevValueRef = useRef(value)
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (value !== prevValueRef.current) {
      // Animation state must flip immediately when the badge count changes.
      setAnimState({ isAnimating: true, direction: value > prevValueRef.current ? 'up' : 'down' })
      const exitTimer = setTimeout(() => {
        setDisplayValue(value)
        prevValueRef.current = value
        enterTimerRef.current = setTimeout(() => {
          setAnimState(prev => ({ ...prev, isAnimating: false }))
          enterTimerRef.current = null
        }, TRANSITION_DELAY_MS)
      }, ANIMATION_EXIT_DELAY_MS)
      return () => {
        clearTimeout(exitTimer)
        if (enterTimerRef.current !== null) {
          clearTimeout(enterTimerRef.current)
          enterTimerRef.current = null
        }
      }
    }
  }, [value])

  const displayText = displayValue > BADGE_MAX_COUNT ? `${BADGE_MAX_COUNT}+` : displayValue.toString()

  return (
    <span
      className={`inline-block transition-all duration-200 ${className} ${
        animState.isAnimating
          ? animState.direction === 'up'
            ? 'animate-roll-up'
            : 'animate-roll-down'
          : ''
      }`}
    >
      {displayText}
    </span>
  )
}
