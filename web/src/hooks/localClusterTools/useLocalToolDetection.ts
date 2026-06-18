import { useCallback, useEffect, useMemo, useState } from 'react'
import { LOCAL_AGENT_HTTP_URL } from '../../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants/network'
import { agentFetch } from '../mcp/shared'
import { DEMO_TOOLS } from './localClusterDemoData'
import type { LocalClusterTool } from './types'

interface UseLocalToolDetectionArgs {
  isConnected: boolean
  isDemoMode: boolean
  setGlobalError: (message: string | null) => void
}

export function useLocalToolDetection({ isConnected, isDemoMode, setGlobalError }: UseLocalToolDetectionArgs) {
  const [tools, setTools] = useState<LocalClusterTool[]>([])
  const [error, setError] = useState<string | null>(null)

  const fetchTools = useCallback(async () => {
    if (isDemoMode && !isConnected) {
      setTools(DEMO_TOOLS)
      setError(null)
      setGlobalError(null)
      return
    }

    if (!isConnected) {
      setTools([])
      return
    }

    try {
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/local-cluster-tools`, {
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (response.ok) {
        const data = await response.json()
        setTools(data.tools || [])
        setError(null)
        setGlobalError(null)
      }
    } catch (err: unknown) {
      console.error('Failed to fetch local cluster tools:', err)
      const message = 'Failed to fetch cluster tools'
      setError(message)
      setGlobalError(message)
    }
  }, [isConnected, isDemoMode, setGlobalError])

  useEffect(() => {
    if (!isConnected && !isDemoMode) {
      setTools([])
    }
  }, [isConnected, isDemoMode])

  const installedTools = useMemo(() => tools.filter(tool => tool.installed), [tools])

  return {
    tools,
    installedTools,
    error,
    fetchTools,
  }
}
