/**
 * Shared data-fetching hook for Enterprise Compliance summary cards.
 */
import { authFetch, safeJson } from '../../../lib/api'
import { useCache } from '../../../lib/cache'
import { ENTERPRISE_SUMMARY_CACHE_PREFIX } from '../EnterpriseComplianceCards.constants'

export function useSummaryData<T extends Record<string, unknown>>(endpoint: string) {
  const {
    data,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    error,
  } = useCache<T | null>({
    key: `${ENTERPRISE_SUMMARY_CACHE_PREFIX}${endpoint}`,
    category: 'rbac',
    initialData: null,
    fetcher: async () => {
      const response = await authFetch(endpoint)
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`)
      }
      return safeJson<T>(response)
    },
  })

  return {
    data,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    error,
  }
}
