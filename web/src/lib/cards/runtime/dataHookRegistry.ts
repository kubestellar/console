/**
 * Data Hook Registry - Maps hook names to actual hooks
 */

export type DataHookResult<T> = {
  data: T[]
  isLoading: boolean
  isRefreshing: boolean
  error?: string
  refetch: () => void
  isFailed?: boolean
  consecutiveFailures?: number
  lastRefresh?: Date
}

// This will be populated by registerDataHook()
export const dataHookRegistry = new Map<string, () => DataHookResult<unknown>>()

export function registerDataHook<T>(name: string, hook: () => DataHookResult<T>) {
  dataHookRegistry.set(name, hook as () => DataHookResult<unknown>)
}

// Noop data hook used when the requested hook is not registered.
// This ensures hooks are called unconditionally to satisfy the Rules of Hooks.
export const NOOP_HOOK_RESULT: DataHookResult<unknown> = {
  data: [],
  isLoading: false,
  isRefreshing: false,
  error: undefined,
  refetch: () => {} }
export const noopDataHook = () => NOOP_HOOK_RESULT
