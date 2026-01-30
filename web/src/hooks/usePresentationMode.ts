import { useState, useEffect, useCallback } from 'react'

const PRESENTATION_MODE_KEY = 'kc-presentation-mode'
const ACCESSIBILITY_SETTINGS_KEY = 'accessibility-settings'

// Global state for presentation mode to ensure consistency across components
let globalPresentationMode = false
const listeners = new Set<(value: boolean) => void>()

// Initialize from localStorage
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem(PRESENTATION_MODE_KEY)
  globalPresentationMode = stored === 'true'
}

function notifyListeners() {
  listeners.forEach(listener => listener(globalPresentationMode))
}

function getSystemPrefersReducedMotion(): boolean {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }
  return false
}

function applyPresentationClasses(active: boolean) {
  const root = document.documentElement
  if (active) {
    root.classList.add('presentation-mode', 'reduce-motion')
  } else {
    root.classList.remove('presentation-mode')
    // Only remove reduce-motion if accessibility settings haven't explicitly set it
    try {
      const a11y = JSON.parse(localStorage.getItem(ACCESSIBILITY_SETTINGS_KEY) || '{}')
      if (!a11y.reduceMotion) {
        root.classList.remove('reduce-motion')
      }
    } catch {
      root.classList.remove('reduce-motion')
    }
  }
}

// Apply on initial load if presentation mode was persisted
if (typeof window !== 'undefined' && globalPresentationMode) {
  applyPresentationClasses(true)
}

/**
 * Hook to manage presentation mode state.
 * When enabled, all CSS animations are disabled, star field is hidden,
 * and polling intervals are slowed down to reduce visual noise during screen sharing.
 */
export function usePresentationMode() {
  const [isPresentationMode, setIsPresentationMode] = useState(globalPresentationMode)
  const [systemReducedMotion, setSystemReducedMotion] = useState(getSystemPrefersReducedMotion)

  useEffect(() => {
    const handleChange = (value: boolean) => {
      setIsPresentationMode(value)
    }
    listeners.add(handleChange)
    setIsPresentationMode(globalPresentationMode)
    return () => {
      listeners.delete(handleChange)
    }
  }, [])

  // Listen for OS-level prefers-reduced-motion changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setSystemReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Apply CSS classes when mode changes
  useEffect(() => {
    const active = isPresentationMode || systemReducedMotion
    applyPresentationClasses(active)
  }, [isPresentationMode, systemReducedMotion])

  const togglePresentationMode = useCallback(() => {
    globalPresentationMode = !globalPresentationMode
    localStorage.setItem(PRESENTATION_MODE_KEY, String(globalPresentationMode))
    notifyListeners()
  }, [])

  return {
    isPresentationMode,
    isReducedMotion: isPresentationMode || systemReducedMotion,
    togglePresentationMode,
  }
}

/**
 * Get current presentation mode state without subscribing to changes.
 * Useful for non-React code like polling interval calculations.
 */
export function getPresentationMode(): boolean {
  return globalPresentationMode
}
