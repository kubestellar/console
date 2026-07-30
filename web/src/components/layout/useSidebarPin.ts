import { useState, useCallback } from 'react'

const STORAGE_KEY = 'sidebar-left-pinned'

export interface UseSidebarPinResult {
  /** Whether the sidebar is pinned (stays open) or auto-hides on mouse-leave */
  pinned: boolean
  /** Toggle pinned/auto-hide mode; persists state to localStorage */
  togglePinned: () => void
}

/**
 * Manages the sidebar pin/auto-hide state machine with localStorage persistence.
 *
 * - Pinned (true): sidebar stays expanded regardless of mouse position.
 * - Unpinned (false): sidebar auto-collapses after the mouse leaves.
 *
 * Default: pinned (true) — matches the existing behavior where localStorage is
 * absent (null !== 'false' → true).
 */
export function useSidebarPin(): UseSidebarPinResult {
  const [pinned, setPinned] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'false'
    } catch {
      return true
    }
  })

  const togglePinned = useCallback(() => {
    setPinned(prev => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        // Ignore storage errors (private browsing, quota exceeded)
      }
      return next
    })
  }, [])

  return { pinned, togglePinned }
}
