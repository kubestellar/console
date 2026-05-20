import { useState, useRef, useEffect, useCallback } from 'react'

/** Seconds before the panel auto-collapses */
const AUTO_COLLAPSE_SECONDS = 20
/** Interval between each countdown tick in milliseconds (1 second) */
const COUNTDOWN_TICK_MS = 1000

interface UseMissionSuggestionsTimerOptions {
  minimized: boolean
  hasSuggestions: boolean
  onAutoCollapse: () => void
}

/**
 * Hook managing the auto-collapse countdown timer for the mission suggestions panel.
 * Returns countdown state and mouse event handlers to pause/resume the timer.
 */
export function useMissionSuggestionsTimer({
  minimized,
  hasSuggestions,
  onAutoCollapse,
}: UseMissionSuggestionsTimerOptions) {
  const [countdown, setCountdown] = useState(AUTO_COLLAPSE_SECONDS)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Start / stop countdown timer
  const startCountdown = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          countdownRef.current = null
          // Timer-initiated collapse: do NOT persist to localStorage.
          // Only user-initiated minimize (explicit click) persists state.
          // This allows the panel to re-expand on next session/page load.
          onAutoCollapse()
          return AUTO_COLLAPSE_SECONDS
        }
        return prev - 1
      })
    }, COUNTDOWN_TICK_MS)
  }, [onAutoCollapse])

  // Manage countdown lifecycle based on minimized state
  useEffect(() => {
    if (!minimized && hasSuggestions) {
      setCountdown(AUTO_COLLAPSE_SECONDS)
      startCountdown()
    } else if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }, [minimized, hasSuggestions, startCountdown])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  // Pause countdown on hover, resume on leave
  const handleMouseEnter = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }

  const handleMouseLeave = () => {
    if (!minimized) startCountdown()
  }

  return {
    countdown,
    handleMouseEnter,
    handleMouseLeave,
  }
}
