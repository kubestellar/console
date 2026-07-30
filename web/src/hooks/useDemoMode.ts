/**
 * React hook for demo mode state management.
 *
 * This hook provides automatic re-renders when demo mode changes.
 * For non-React code, import directly from '../lib/demoMode'.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  isDemoMode as _isDemoMode,
  setDemoMode as _setDemoMode,
  toggleDemoMode as _toggleDemoMode,
  subscribeDemoMode,
  isNetlifyDeployment,
  isDemoModeForced,
  canToggleDemoMode,
  isDemoToken,
  hasRealToken,
  setDemoToken,
  getDemoMode,
  setGlobalDemoMode,
} from '../lib/demoMode'

// Re-export all utilities from the unified module for convenience
export {
  isNetlifyDeployment,
  isDemoModeForced,
  canToggleDemoMode,
  isDemoToken,
  hasRealToken,
  setDemoToken,
  getDemoMode,
  setGlobalDemoMode,
}

/**
 * Hook to manage demo mode state with automatic re-renders on changes.
 * When demo mode is enabled, the app shows demo/mock data instead of
 * connecting to the real MCP agent.
 *
 * Usage:
 * ```tsx
 * const { isDemoMode, toggleDemoMode, setDemoMode } = useDemoMode()
 * ```
 */
export function useDemoMode() {
  const [isDemoMode, setIsDemoModeState] = useState(_isDemoMode())

  useEffect(() => {
    const unsubscribe = subscribeDemoMode((value) => {
      setIsDemoModeState(value)
    })
    // Sync in case state changed between render and effect
    setIsDemoModeState(_isDemoMode())
    return unsubscribe
  }, [])

  const toggleDemoMode = useCallback(_toggleDemoMode, [])
  const setDemoMode = useCallback(_setDemoMode, [])

  return {
    isDemoMode,
    toggleDemoMode,
    setDemoMode,
  }
}
