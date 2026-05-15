import { createCachedHook } from '../lib/cache'
import { agentFetch } from './mcp/shared'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { isAgentUnavailable } from './useLocalAgent'

/**
 * Quality metrics for the AI-Driven Bug Discovery & Remediation system.
 */
export interface QualityStats {
  bugsFoundCount: number
  remediationsFixed: number
  driftEventsCount: number
  healthScore: number
  progressPct: string
}

const INITIAL: QualityStats = {
  bugsFoundCount: 0,
  remediationsFixed: 0,
  driftEventsCount: 0,
  healthScore: 100,
  progressPct: '0%'
}

const DEMO: QualityStats = {
  bugsFoundCount: 1418,
  remediationsFixed: 12,
  driftEventsCount: 4,
  healthScore: 94,
  progressPct: '15%'
}

/**
 * Hook to fetch quality dashboard statistics with unified caching.
 */
export const useCachedQuality = createCachedHook<QualityStats>({
  key: 'quality-stats',
  initialData: INITIAL,
  demoData: DEMO,
  fetcher: async () => {
    if (isAgentUnavailable()) {
      return INITIAL
    }

    try {
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/predictions/stats`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      
      // Adapt backend stats to UI-friendly QualityStats interface.
      // If backend returns zero/empty (fresh session), we use the data we have.
      return {
        bugsFoundCount: data.totalPredictions || 0,
        remediationsFixed: data.accurateFeedback || 0,
        driftEventsCount: data.inaccurateFeedback || 0,
        healthScore: data.accuracyRate ? Math.round(data.accuracyRate * 100) : 100,
        progressPct: data.progressPct || '0%'
      }
    } catch (err) {
      console.error('[useCachedQuality] failed to fetch stats:', err)
      throw err
    }
  }
})
