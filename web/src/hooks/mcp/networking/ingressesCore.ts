import { useCallback, useEffect, useRef, useState } from 'react'
import { reportAgentDataSuccess, isAgentUnavailable } from '../../useLocalAgent'
import { isDemoMode } from '../../../lib/demoMode'
import { useDemoMode } from '../../useDemoMode'
import { registerRefetch } from '../../../lib/modeTransition'
import { getStoredAuthToken } from '../../../lib/authToken'
import { getLocalAgentURL, agentFetch } from '../shared'
import { MCP_HOOK_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'
import { CONSECUTIVE_FAILURE_THRESHOLD } from '../../../lib/cache'
import { isClusterModeBackend } from '../../../lib/cache/fetcherUtils'
import type { Ingress } from '../types'
import { getDemoIngresses } from '../../useCachedData/demoData'

export function useIngresses(cluster?: string, namespace?: string) {
  const [ingresses, setIngresses] = useState<Ingress[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [isDemoFallback, setIsDemoFallback] = useState(false)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)
  const hasDataRef = useRef(false)
  hasDataRef.current = ingresses.length > 0
  const hasReceivedLiveDataRef = useRef(false)

  const refetch = useCallback(async () => {
    if (isDemoMode()) {
      const demoIngresses = getDemoIngresses().filter(i => (!cluster || i.cluster === cluster) && (!namespace || i.namespace === namespace))
      setIngresses(demoIngresses)
      setIsDemoFallback(true)
      setError(null)
      setConsecutiveFailures(0)
      setIsLoading(false)
      setIsRefreshing(false)
      return
    }

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
          headers: { Accept: 'application/json' },
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
      } catch {}
    }

    const token = await getStoredAuthToken()
    if (!token) {
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
          const response = await fetch(`/api/mcp/ingresses?${params}`, { signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS) })
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
      setError(err instanceof Error ? err.message : 'Network request failed')
      setConsecutiveFailures(prev => prev + 1)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()
    const unregisterRefetch = registerRefetch(`ingresses:${cluster || 'all'}:${namespace || 'all'}`, () => {
      refetch()
    })
    return () => unregisterRefetch()
  }, [refetch, cluster, namespace])

  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    refetch()
  }, [demoMode, refetch])

  return { ingresses, isLoading, isRefreshing, error, refetch, consecutiveFailures, isFailed: consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD, isDemoFallback }
}
