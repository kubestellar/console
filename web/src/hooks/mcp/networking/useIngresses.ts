import { useState, useEffect, useCallback, useRef } from 'react'
import { reportAgentDataSuccess, isAgentUnavailable } from '../../useLocalAgent'
import { isDemoMode } from '../../../lib/demoMode'
import { useDemoMode } from '../../useDemoMode'
import { registerRefetch } from '../../../lib/modeTransition'
import { kubectlProxy } from '../../../lib/kubectlProxy'
import { getStoredAuthToken } from '../../../lib/authToken'
import { REFRESH_INTERVAL_MS, MIN_REFRESH_INDICATOR_MS, getEffectiveInterval, getLocalAgentURL, agentFetch, clusterCacheRef } from '../shared'
import { subscribePolling } from '../pollingManager'
import { MCP_HOOK_TIMEOUT_MS, DEPLOY_ABORT_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'
import { CONSECUTIVE_FAILURE_THRESHOLD } from '../../../lib/cache'
import { isClusterModeBackend } from '../../../lib/cache/fetcherUtils'
import type { Ingress } from '../types'
import { getDemoIngresses } from '../../useCachedData/demoData'

// Hook to get Ingresses.
// Returns `isDemoFallback: true` when the hook is serving demo data so callers
// can render the Demo badge only for true demo output. See Issue 9357.
export function useIngresses(cluster?: string, namespace?: string) {
  const [ingresses, setIngresses] = useState<Ingress[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [isDemoFallback, setIsDemoFallback] = useState(false)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)
  // Track data presence in a ref so the useCallback doesn't need ingresses in deps
  const hasDataRef = useRef(false)
  hasDataRef.current = ingresses.length > 0
  const hasReceivedLiveDataRef = useRef(false)

  const refetch = useCallback(async () => {
    // If demo mode is enabled, use demo data so the Demo badge correctly
    // reflects the data source. Previously this hook relied on an empty live
    // response plus a hardcoded `isDemoData: true` in the card config,
    // producing false positive Demo badges on live data. See Issue 9357.
    if (isDemoMode()) {
      const demoIngresses = getDemoIngresses().filter(i =>
        (!cluster || i.cluster === cluster) && (!namespace || i.namespace === namespace)
      )
      setIngresses(demoIngresses)
      setIsDemoFallback(true)
      setError(null)
      setConsecutiveFailures(0)
      setIsLoading(false)
      setIsRefreshing(false)
      return
    }
    // Only show loading skeleton when we have no data yet; otherwise just
    // show refreshing indicator to prevent flickering (#11542).
    const hasExistingData = hasDataRef.current || hasReceivedLiveDataRef.current
    if (!hasExistingData) {
      setIsLoading(true)
    }
    setIsRefreshing(true)
    if (cluster && !isAgentUnavailable()) {
      try {
        const params = new URLSearchParams()
        params.append('cluster', cluster)
        if (namespace) params.append('namespace', namespace)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), MCP_HOOK_TIMEOUT_MS)
        const response = await agentFetch(`${getLocalAgentURL()}/ingresses?${params}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)
        if (response.ok) {
          const data = await response.json()
          setIngresses(data.ingresses || [])
          hasReceivedLiveDataRef.current = true
          setIsDemoFallback(false)
          setError(null)
          setConsecutiveFailures(0)
          setIsLoading(false)
          setIsRefreshing(false)
          reportAgentDataSuccess()
          return
        }
      } catch {
        // Fall through to API
      }
    }
    // Skip REST fallback when no token to prevent GA4 auth errors (#9957)
    const token = await getStoredAuthToken()
    if (!token) {
      // Only clear data if we never had any; preserve stale data otherwise (#11540)
      if (!hasReceivedLiveDataRef.current) {
        setIngresses([])
      }
      setIsLoading(false)
      setIsRefreshing(false)
      return
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      if (isClusterModeBackend()) {
        try {
          const response = await fetch(`/api/mcp/ingresses?${params}`, {
            signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS),
          })
          if (response.ok) {
            const data = await response.json()
            setIngresses(data.ingresses || [])
            hasReceivedLiveDataRef.current = true
            setIsDemoFallback(false)
            setError(null)
            setConsecutiveFailures(0)
            setIsLoading(false)
            setIsRefreshing(false)
            return
          }
        } catch (err) {
          console.error('[ingresses] Backend fetch failed:', err)
          // Error propagated via hook error state; log here for debugging
        }
        setIsLoading(false)
        setIsRefreshing(false)
        return
      }
      const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/ingresses?${params}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setIngresses(data.ingresses || [])
      hasReceivedLiveDataRef.current = true
      setIsDemoFallback(false)
      setError(null)
      setConsecutiveFailures(0)
    } catch (err: unknown) {
      // Surface error so UI can distinguish failure from empty (#11541).
      // Keep stale data intact to prevent empty state on transient failures (#11540).
      const message = err instanceof Error ? err.message : 'Network request failed'
      setError(message)
      setConsecutiveFailures(prev => prev + 1)
      // Don't flip isDemoFallback on error — preserve demo badge if no live data received (#11640)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`ingresses:${cluster || 'all'}:${namespace || 'all'}`, () => {
      refetch()
    })

    return () => unregisterRefetch()
  }, [refetch, cluster, namespace])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    refetch()
  }, [demoMode, refetch])

  return { ingresses, isLoading, isRefreshing, error, refetch, consecutiveFailures, isFailed: consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD, isDemoFallback }
}

