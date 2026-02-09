/**
 * Unified Demo Provider
 *
 * Central provider for the unified demo system.
 * Manages demo mode state, mode switching with skeleton transitions,
 * and demo data generation for all components.
 */

import { useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react'
import { UnifiedDemoContext } from './UnifiedDemoContext'
import { useDemoMode, isDemoModeForced } from '../../../hooks/useDemoMode'
import {
  registerDemoData,
  generateDemoDataSync,
  clearDemoDataCache,
} from './demoDataRegistry'
import {
  triggerAllRefetches,
  incrementModeTransitionVersion,
} from '../../modeTransition'
import type { UnifiedDemoContextValue, DemoDataEntry, DemoDataState } from './types'

/**
 * Duration to show skeleton when switching modes (ms).
 * Ensures smooth visual transition between demo and live data.
 */
const MODE_SWITCH_SKELETON_DURATION = 500

/**
 * Custom event name for mode switch notifications.
 */
const MODE_SWITCH_EVENT = 'kc-demo-mode-switch'

interface UnifiedDemoProviderProps {
  children: ReactNode
}

/**
 * Provider component for the unified demo system.
 * Wrap your app with this to enable demo mode and skeleton states.
 */
export function UnifiedDemoProvider({ children }: UnifiedDemoProviderProps) {
  const { isDemoMode, toggleDemoMode, setDemoMode } = useDemoMode()
  const [isModeSwitching, setIsModeSwitching] = useState(false)
  const [modeVersion, setModeVersion] = useState(0)
  const previousModeRef = useRef(isDemoMode)
  const switchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialLoadTriggeredRef = useRef(false)

  // Track mode changes and trigger skeleton state
  // IMPORTANT: Only depend on isDemoMode, NOT modeVersion. The setModeVersion call
  // inside this effect would cause a re-render that triggers cleanup, which cancels
  // the timeout before it can clear isModeSwitching — leaving skeletons stuck forever.
  useEffect(() => {
    if (previousModeRef.current !== isDemoMode) {
      // Mode has changed - trigger skeleton state
      setIsModeSwitching(true)

      // Increment mode version - this invalidates all in-flight fetches
      setModeVersion(v => v + 1)

      // Increment global mode transition version to invalidate stale fetches
      incrementModeTransitionVersion()

      // Clear any existing timeout (from rapid toggles)
      if (switchTimeoutRef.current) {
        clearTimeout(switchTimeoutRef.current)
      }

      // Clear cache when switching modes
      clearDemoDataCache()

      // Dispatch custom event for cross-component coordination
      window.dispatchEvent(
        new CustomEvent(MODE_SWITCH_EVENT, {
          detail: {
            from: previousModeRef.current ? 'demo' : 'live',
            to: isDemoMode ? 'demo' : 'live',
            timestamp: Date.now(),
          },
        })
      )

      // End skeleton state after duration and trigger all registered refetches
      switchTimeoutRef.current = setTimeout(() => {
        setIsModeSwitching(false)
        switchTimeoutRef.current = null
        // Trigger all hooks to refetch data for the new mode
        triggerAllRefetches()
      }, MODE_SWITCH_SKELETON_DURATION)

      previousModeRef.current = isDemoMode
    }

    return () => {
      if (switchTimeoutRef.current) {
        clearTimeout(switchTimeoutRef.current)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode])

  // Trigger initial data load ONCE when provider mounts
  // This ensures all registered refetch functions run on page load
  // Use a short delay to allow all components to mount and register
  useEffect(() => {
    if (!initialLoadTriggeredRef.current) {
      initialLoadTriggeredRef.current = true
      // Short delay to allow hooks to register their refetch functions
      const timeoutId = setTimeout(() => {
        console.log('[UnifiedDemo] Triggering initial data load')
        triggerAllRefetches()
      }, 100)
      return () => clearTimeout(timeoutId)
    }
  }, [])

  // Get demo data for a component
  const getDemoData = useCallback(<T = unknown>(id: string): DemoDataState<T> => {
    if (isModeSwitching) {
      // Return loading state during mode switch
      return {
        data: undefined,
        isLoading: true,
        isDemoData: true,
      }
    }

    // Generate demo data synchronously
    return generateDemoDataSync<T>(id)
  }, [isModeSwitching])

  // Register a demo data generator
  const registerGenerator = useCallback(<T = unknown>(entry: DemoDataEntry<T>): void => {
    registerDemoData(entry)
  }, [])

  // Trigger data regeneration for a component
  const regenerate = useCallback((id: string): void => {
    clearDemoDataCache(id)
  }, [])

  // Trigger data regeneration for all components
  const regenerateAll = useCallback((): void => {
    clearDemoDataCache()
  }, [])

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo<UnifiedDemoContextValue>(() => ({
    isDemoMode,
    isForced: isDemoModeForced,
    toggleDemoMode,
    setDemoMode,
    isModeSwitching,
    modeVersion,
    getDemoData,
    registerGenerator,
    regenerate,
    regenerateAll,
  }), [
    isDemoMode,
    isModeSwitching,
    modeVersion,
    toggleDemoMode,
    setDemoMode,
    getDemoData,
    registerGenerator,
    regenerate,
    regenerateAll,
  ])

  return (
    <UnifiedDemoContext.Provider value={contextValue}>
      {children}
    </UnifiedDemoContext.Provider>
  )
}

/**
 * Hook to use unified data (demo or live) with skeleton support.
 * Automatically handles mode switching with skeleton states.
 *
 * CRITICAL: This hook filters out stale live data during mode switches.
 * Live data captured before a mode switch is discarded to prevent
 * race conditions where in-flight fetches complete after mode changes.
 *
 * @param id Component ID for demo data lookup
 * @param liveData Live data from hooks/API
 * @param isLiveLoading Whether live data is loading
 * @param options Additional options
 * @returns Unified data state with skeleton support
 */
export function useUnifiedData<T = unknown>(
  id: string,
  liveData: T | undefined,
  isLiveLoading: boolean,
  options: {
    /** Force skeleton display */
    forceSkeleton?: boolean
    /** Skip demo data even in demo mode */
    skipDemo?: boolean
    /** Live data error */
    error?: Error | null
  } = {}
): {
  data: T | undefined
  isLoading: boolean
  showSkeleton: boolean
  isDemoData: boolean
  error?: Error
  refetch: () => void
} {
  const { isDemoMode, isModeSwitching, getDemoData, regenerate, modeVersion } = useUnifiedDemoContext()
  const { forceSkeleton, skipDemo, error } = options

  // Track the mode version when we last accepted data
  // This helps discard stale data from before mode switch
  const lastModeVersionRef = useRef(modeVersion)

  // Determine if we should use demo data
  const useDemoData = isDemoMode && !skipDemo

  // Get demo data if in demo mode
  const demoState = useDemoData ? getDemoData<T>(id) : null

  // Detect mode version change - discard stale live data
  const modeJustChanged = lastModeVersionRef.current !== modeVersion
  if (modeJustChanged) {
    lastModeVersionRef.current = modeVersion
  }

  // Determine final data and loading state
  // Simple logic: during switch show skeleton, otherwise use appropriate data source
  let data: T | undefined
  if (isModeSwitching) {
    // During mode switch, force skeleton to prevent stale data flash
    data = undefined
  } else if (useDemoData) {
    // In demo mode, use demo data
    data = demoState?.data
  } else {
    // In live mode, use live data directly
    // The isModeSwitching guard above prevents stale data during transition
    data = liveData
  }

  const isLoading = useDemoData ? (demoState?.isLoading ?? true) : isLiveLoading
  const isDemoData = useDemoData && demoState?.data !== undefined

  // Show skeleton when:
  // 1. Force skeleton is true
  // 2. Mode is switching
  // 3. Data is loading and no cached data available
  const showSkeleton = forceSkeleton || isModeSwitching || (isLoading && data === undefined)

  // Refetch function
  const refetch = useCallback(() => {
    if (useDemoData) {
      regenerate(id)
    }
    // For live data, the caller should handle refetch
  }, [useDemoData, regenerate, id])

  return {
    data,
    isLoading,
    showSkeleton,
    isDemoData,
    error: useDemoData ? demoState?.error : (error ?? undefined),
    refetch,
  }
}

// Re-export the context hook
import { useUnifiedDemoContext } from './UnifiedDemoContext'
export { useUnifiedDemoContext }
