/**
 * useDataSource - Unified data fetching hook for cards
 *
 * Supports multiple data source types:
 * - hook: Use a registered data hook (e.g., useClusters, usePods)
 * - api: Direct API fetch with optional polling
 * - static: Static data array
 * - context: Read from React context
 */

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import type { CardDataSource } from '../../types'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../constants'
import { useKeepAliveActive } from '../../../../hooks/useKeepAliveActive'

// Hook registry - populated by registerDataHook
// `isDemoData` is optional: hooks that propagate demo-fallback state return
// `true` when the data being returned came from a demo/mock source. This lets
// UnifiedCard show the Demo badge only for true demo output. Hooks that do
// not know their data source may omit this field. See Issues 9356 and 9357.
const dataHookRegistry: Record<
  string,
  (params?: Record<string, unknown>) => {
    data: unknown[] | unknown | undefined
    isLoading: boolean
    error: Error | null
    refetch?: () => void
    isDemoData?: boolean
  }
> = {}

/**
 * Registry version counter -- incremented every time a hook is registered.
 * Components can subscribe via useDataHookRegistryVersion() to remount
 * when the registry changes, keeping React hook counts stable.
 */
let registryVersion = 0
const registryListeners = new Set<() => void>()

/**
 * Subscribe to registry version changes (used by useDataHookRegistryVersion)
 */
export function subscribeRegistryChange(listener: () => void): () => void {
  registryListeners.add(listener)
  return () => { registryListeners.delete(listener) }
}

/**
 * Get current registry version snapshot (used by useDataHookRegistryVersion)
 */
export function getRegistryVersion(): number {
  return registryVersion
}

/**
 * React hook that returns the current registry version.
 * When hooks are registered (e.g. after dynamic import), this triggers
 * a re-render so parent components can remount children with a fresh
 * hook count -- avoiding "Rendered more hooks than previous render" crashes.
 */
export function useDataHookRegistryVersion(): number {
  return useSyncExternalStore(subscribeRegistryChange, getRegistryVersion)
}

/**
 * Register a data hook for use in card configs
 *
 * @example
 * registerDataHook('useCachedPodIssues', useCachedPodIssues)
 */
export function registerDataHook(
  name: string,
  hook: (params?: Record<string, unknown>) => {
    data: unknown[] | unknown | undefined
    isLoading: boolean
    error: Error | null
    refetch?: () => void
    isDemoData?: boolean
  }
) {
  dataHookRegistry[name] = hook
  registryVersion++
  registryListeners.forEach(l => l())
}

/**
 * Get a registered data hook
 */
export function getDataHook(name: string) {
  return dataHookRegistry[name]
}

/**
 * List all registered data hooks
 */
export function getRegisteredDataHooks(): string[] {
  return Object.keys(dataHookRegistry)
}

export interface UseDataSourceResult {
  data: unknown[] | unknown | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
  /**
   * `true` when the underlying data hook explicitly reports that the returned
   * data is demo/mock. `undefined` when the hook does not report demo status
   * (in which case callers should fall back to the card config's
   * `isDemoData` metadata). `false` means the hook explicitly reports live
   * data — this should override any hardcoded config metadata. See Issues
   * 9356 and 9357.
   */
  isDemoData?: boolean
}

export interface UseDataSourceOptions {
  /** Skip fetching data (useful when overrideData is provided) */
  skip?: boolean
}

const EMPTY_RESULT: UseDataSourceResult = {
  data: undefined,
  isLoading: false,
  error: null,
  refetch: () => {} }

/**
 * Unified data source hook
 *
 * IMPORTANT: This hook must be used with a stable config reference.
 * Changing config.type between renders will cause issues due to React's
 * rules of hooks. Each data source type has its own component wrapper
 * that should be used instead if dynamic switching is needed.
 */
export function useDataSource(
  config: CardDataSource,
  options?: UseDataSourceOptions
): UseDataSourceResult {
  const skip = options?.skip ?? false

  // Call ALL hooks unconditionally - they check internally if they should be active
  // This satisfies React's rules of hooks
  // When skip is true, pass null to all hooks to make them return empty results
  const hookResult = useHookDataSourceInternal(
    !skip && config.type === 'hook' ? config.hook : null,
    !skip && config.type === 'hook' ? config.params : undefined
  )

  const apiResult = useApiDataSourceInternal(
    !skip && config.type === 'api' ? config.endpoint : null,
    !skip && config.type === 'api' ? config.method : 'GET',
    !skip && config.type === 'api' ? config.params : undefined,
    !skip && config.type === 'api' ? config.pollInterval : undefined
  )

  const staticResult = useStaticDataSourceInternal(
    !skip && config.type === 'static' ? (config.data ?? null) : null
  )

  const contextResult = useContextDataSourceInternal(
    !skip && config.type === 'context' ? config.contextKey : null
  )

  // If skip is true, return empty result
  if (skip) {
    return EMPTY_RESULT
  }

  // Return the appropriate result based on config type
  switch (config.type) {
    case 'hook':
      return hookResult
    case 'api':
      return apiResult
    case 'static':
      return staticResult
    case 'context':
      return contextResult
    default: {
      // Exhaustive check
      const _exhaustiveCheck: never = config
      return {
        data: undefined,
        isLoading: false,
        error: new Error(`Unknown data source type: ${(_exhaustiveCheck as CardDataSource).type}`),
        refetch: () => {} }
    }
  }
}

/**
 * Hook-based data source (internal - always runs but skips if hookName is null)
 */
function useHookDataSourceInternal(
  hookName: string | null,
  params?: Record<string, unknown>
): UseDataSourceResult {
  // Check if the named hook exists in the registry.
  // NOTE: We intentionally do NOT call the registered hook here when it
  // is absent. Registered hooks are React hooks (they use useState,
  // useEffect, etc.). Calling them conditionally -- only after the
  // dynamic-import populates the registry -- violates React's rules of
  // hooks and causes "Rendered more hooks than during the previous render"
  // crashes.
  //
  // Instead, we return a loading result when the hook is missing, and
  // rely on the parent component using useDataHookRegistryVersion() as a
  // key to remount this entire subtree once the registry is populated.
  // After remount, the hook exists from the very first render, keeping
  // hook counts stable across all renders of this component instance.
  const registeredHook = hookName ? dataHookRegistry[hookName] : null

  if (!hookName) {
    return EMPTY_RESULT
  }

  if (!registeredHook) {
    // Hook not yet registered (dynamic import in progress) -- show loading
    return {
      data: undefined,
      isLoading: true,
      error: null,
      refetch: () => {} }
  }

  // Hook is registered -- call it. This is safe because after a key-based
  // remount, the hook exists on every render of this component instance.
  const hookResult = registeredHook(params)

  return {
    data: hookResult.data,
    isLoading: hookResult.isLoading,
    error: hookResult.error,
    refetch: hookResult.refetch ?? (() => {}),
    isDemoData: hookResult.isDemoData }
}

/**
 * API-based data source (internal - always runs but skips if endpoint is null)
 */
function useApiDataSourceInternal(
  endpoint: string | null,
  method: 'GET' | 'POST' = 'GET',
  params?: Record<string, unknown>,
  pollInterval?: number
): UseDataSourceResult {
  const [data, setData] = useState<unknown[] | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(!!endpoint)
  const [error, setError] = useState<Error | null>(null)

  // Pause polling when this component is on an inactive KeepAlive route (#5856)
  const keepAliveActive = useKeepAliveActive()
  // Track active state in a ref so in-flight fetches can check before setState (#5891)
  const keepAliveActiveRef = useRef(keepAliveActive)
  keepAliveActiveRef.current = keepAliveActive

  // Stringify params for stable dependency comparison
  const paramsKey = params ? JSON.stringify(params) : ''

  const fetchData = useCallback(async () => {
    if (!endpoint || !keepAliveActiveRef.current) return

    try {
      setIsLoading(true)
      setError(null)

      let url = endpoint
      if (method === 'GET' && params) {
        const searchParams = new URLSearchParams()
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            searchParams.set(key, String(value))
          }
        })
        url = `${endpoint}?${searchParams.toString()}`
      }

      const response = await fetch(url, {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } : undefined,
        body: method === 'POST' && params ? JSON.stringify(params) : undefined,
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`)
      }

      // Use .catch() on .json() to prevent Firefox from firing unhandledrejection
      // before the outer try/catch processes the rejection (microtask timing issue).
      const json = await response.json().catch(() => null)
      if (!json) throw new Error('Invalid JSON response from API')
      // Assume response is array or has data array property
      const resultData = Array.isArray(json) ? json : json.data ?? json.items ?? []
      // Skip state update if route became inactive while fetch was in flight (#5891)
      if (!keepAliveActiveRef.current) return
      setData(resultData)
    } catch (err: unknown) {
      if (!keepAliveActiveRef.current) return
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      if (keepAliveActiveRef.current) setIsLoading(false)
    }
  }, [endpoint, method, paramsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Initial fetch (only if endpoint is provided)
  useEffect(() => {
    if (endpoint && keepAliveActive) {
      fetchData()
    }
  }, [endpoint, fetchData, keepAliveActive])

  // Polling (only if endpoint and pollInterval are provided, and route is active)
  useEffect(() => {
    if (!endpoint || !pollInterval || pollInterval <= 0 || !keepAliveActive) return

    const interval = setInterval(fetchData, pollInterval)
    return () => clearInterval(interval)
  }, [endpoint, fetchData, pollInterval, keepAliveActive])

  // Return empty result if no endpoint
  if (!endpoint) {
    return EMPTY_RESULT
  }

  return { data, isLoading, error, refetch: fetchData }
}

/**
 * Static data source (internal - always runs but skips if data is null)
 */
function useStaticDataSourceInternal(staticData: unknown[] | null): UseDataSourceResult {
  return (() => {
      if (!staticData) return EMPTY_RESULT
      return {
        data: staticData,
        isLoading: false,
        error: null,
        refetch: () => {} }
    })()
}

/**
 * Context-based data source (internal - always runs but skips if contextKey is null)
 * 
 * Note: Context registry is a future feature for advanced use cases where card data
 * should be read from React context providers. For most cards, use 'hook' or 'api'
 * data sources instead. When implemented, this will follow a similar pattern to the
 * hook registry (see registerDataHook above).
 */
function useContextDataSourceInternal(contextKey: string | null): UseDataSourceResult {
  return (() => {
      if (!contextKey) return EMPTY_RESULT
      return {
        data: undefined,
        isLoading: false,
        error: new Error(`Context data source not yet implemented: ${contextKey}`),
        refetch: () => {} }
    })()
}

export default useDataSource
