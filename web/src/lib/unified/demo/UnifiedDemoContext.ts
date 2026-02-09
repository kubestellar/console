/**
 * Unified Demo Context
 *
 * Provides React context for the unified demo system.
 * Components use this context to access demo data and skeleton states.
 */

import { createContext, useContext } from 'react'
import type { UnifiedDemoContextValue, DemoDataState } from './types'

/**
 * Default demo data state (loading).
 */
function createDefaultDemoDataState<T = unknown>(): DemoDataState<T> {
  return {
    data: undefined,
    isLoading: true,
    isDemoData: true,
  }
}

/**
 * Default context value (demo mode off, no generators).
 */
const defaultContextValue: UnifiedDemoContextValue = {
  isDemoMode: false,
  isForced: false,
  toggleDemoMode: () => {
    console.warn('UnifiedDemoProvider not mounted')
  },
  setDemoMode: () => {
    console.warn('UnifiedDemoProvider not mounted')
  },
  isModeSwitching: false,
  modeVersion: 0,
  getDemoData: <T = unknown>() => createDefaultDemoDataState<T>(),
  registerGenerator: () => {
    console.warn('UnifiedDemoProvider not mounted')
  },
  regenerate: () => {
    console.warn('UnifiedDemoProvider not mounted')
  },
  regenerateAll: () => {
    console.warn('UnifiedDemoProvider not mounted')
  },
}

/**
 * React context for unified demo system.
 */
export const UnifiedDemoContext = createContext<UnifiedDemoContextValue>(defaultContextValue)

/**
 * Hook to access the unified demo context.
 * @returns The demo context value
 */
export function useUnifiedDemoContext(): UnifiedDemoContextValue {
  return useContext(UnifiedDemoContext)
}

/**
 * Hook to check if demo mode is active.
 * @returns Whether demo mode is on
 */
export function useIsDemoMode(): boolean {
  const { isDemoMode } = useContext(UnifiedDemoContext)
  return isDemoMode
}

/**
 * Hook to check if mode is switching (should show skeleton).
 * @returns Whether mode is switching
 */
export function useIsModeSwitching(): boolean {
  const { isModeSwitching } = useContext(UnifiedDemoContext)
  return isModeSwitching
}

/**
 * Hook to get the current mode version.
 * Increments on each mode switch. Used to detect stale data.
 * @returns Current mode version
 */
export function useModeVersion(): number {
  const { modeVersion } = useContext(UnifiedDemoContext)
  return modeVersion
}
