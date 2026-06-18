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
import type { NetworkPolicy } from '../types'

// Hook to get NetworkPolicies
export function useNetworkPolicies(cluster?: string, namespace?: string) {
  const [networkpolicies, setNetworkPolicies] = useState<NetworkPolicy[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)
  // Track data presence in a ref so the useCallback doesn't need networkpolicies in deps
  const hasDataRef = useRef(false)
  hasDataRef.current = networkpolicies.length > 0
  const hasReceivedLiveDataRef = useRef(false)

  const refetch = useCallback(async () => {
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
        const response = await agentFetch(`${getLocalAgentURL()}/networkpolicies?${params}`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        clearTimeout(timeoutId)
        if (response.ok) {
          const data = await response.json()
          setNetworkPolicies(data.networkpolicies || [])
          hasReceivedLiveDataRef.current = true
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
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      if (isClusterModeBackend()) {
        try {
          const response = await fetch(`/api/mcp/networkpolicies?${params}`, {
            signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS),
          })
          if (response.ok) {
            const data = await response.json()
            setNetworkPolicies(data.networkpolicies || [])
            hasReceivedLiveDataRef.current = true
            setError(null)
            setConsecutiveFailures(0)
            setIsLoading(false)
            setIsRefreshing(false)
            return
          }
        } catch (err) {
          console.error('[networkpolicies] Backend fetch failed:', err)
          // Error propagated via hook error state; log here for debugging
        }
        setIsLoading(false)
        setIsRefreshing(false)
        return
      }
      const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/networkpolicies?${params}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setNetworkPolicies(data.networkpolicies || [])
      hasReceivedLiveDataRef.current = true
      setError(null)
      setConsecutiveFailures(0)
    } catch (err: unknown) {
      // Surface error so UI can distinguish failure from empty (#11541).
      // Keep stale data intact to prevent empty state on transient failures (#11540).
      const message = err instanceof Error ? err.message : 'Network request failed'
      setError(message)
      setConsecutiveFailures(prev => prev + 1)
      // Don't clear stale data on error — preserve last-known state for UI continuity
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`network-policies:${cluster || 'all'}:${namespace || 'all'}`, () => {
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

  return { networkpolicies, isLoading, isRefreshing, error, refetch, consecutiveFailures, isFailed: consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD }
}
