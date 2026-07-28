/**
 * useNVIDIAOperators hook.
 *
 * Extracted from compute.ts — see issue #15790 / #21606.
 */
import { useState, useEffect, useCallback } from 'react'
import { fetchSSE } from '../../../lib/sseClient'
import { agentFetch } from '../shared'
import { getStoredAuthToken } from '../../../lib/authToken'
import { isInClusterMode } from '../../useBackendHealth'
import { getClusterModeBaseUrl } from '../../../lib/cache/fetcherUtils'
import type { NVIDIAOperatorStatus } from '../types'

export function useNVIDIAOperators(cluster?: string) {
  const [operators, setOperators] = useState<NVIDIAOperatorStatus[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const params: Record<string, string> = {}
      if (cluster) params.cluster = cluster
      const agentBaseUrl = getClusterModeBaseUrl()
      if (!agentBaseUrl) {
        setOperators([])
        setError(null)
        return
      }
      const token = await getStoredAuthToken()
      if ((token && token !== 'demo-token') || isInClusterMode()) {
        try {
          const accumulated: NVIDIAOperatorStatus[] = []
          const result = await fetchSSE<NVIDIAOperatorStatus>({
            url: `${agentBaseUrl}/nvidia-operators/stream`,
            params,
            itemsKey: 'operators',
            onClusterData: (_clusterName, items) => {
              accumulated.push(...items)
              setOperators([...accumulated])
              setIsLoading(false)
            },
          })
          setOperators(result)
          setError(null)
          setIsLoading(false)
          return
        } catch { /* SSE failed, fall through to REST */ }
      }
      const urlParams = new URLSearchParams()
      if (cluster) urlParams.append('cluster', cluster)
      const resp = await agentFetch(`${agentBaseUrl}/nvidia-operators?${urlParams}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      if (data.operators) {
        setOperators(data.operators)
      } else if (data.operator) {
        setOperators([data.operator])
      } else {
        setOperators([])
      }
      setError(null)
    } catch {
      setError(null)
      setOperators([])
    } finally {
      setIsLoading(false)
    }
  }, [cluster])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { operators, isLoading, error, refetch }
}
