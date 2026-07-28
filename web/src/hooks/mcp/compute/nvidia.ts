// useNVIDIAOperators hook extracted from compute.ts so the hook
// implementation file stays under the max-lines limit (tracked by #15790,
// split by #21606). No behaviour change — this is the same hook that
// previously lived in compute.ts, re-exported from there for backward
// compatibility.

import { useState, useEffect, useCallback } from 'react'
import { fetchSSE } from '../../../lib/sseClient'
import { getStoredAuthToken } from '../../../lib/authToken'
import { agentFetch } from '../shared'
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

      // Try SSE streaming first
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
        } catch {
          // SSE failed, fall through to REST
        }
      }

      // REST fallback
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
