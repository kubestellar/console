import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCachedPods } from '../../hooks/useCachedData'
import { useNetworkPolicies } from '../../hooks/mcp/networking'
import { useCardLoadingState } from './CardDataContext'

/** Maximum number of namespaces to display before showing a truncation indicator */
const MAX_DISPLAYED_NAMESPACES = 30

interface NamespaceCoverage {
  namespace: string
  cluster: string
  podCount: number
  hasPolicies: boolean
  policyCount: number
}

export function NetworkPolicyCoverage() {
  const { t } = useTranslation('cards')
  const { pods, isLoading: podsLoading, isRefreshing, isDemoFallback, isFailed: podsFailed, consecutiveFailures: podsFailures } = useCachedPods()
  const { networkpolicies, isLoading: policiesLoading, isFailed: policiesFailed } = useNetworkPolicies()
  const [showUncovered, setShowUncovered] = useState(false)

  const isLoading = podsLoading || policiesLoading
  const isFailed = podsFailed && policiesFailed
  // Policies fetch failed but pods succeeded — fall back to heuristic with warning
  const isEstimated = policiesFailed && !podsLoading && pods.length > 0

  const { showSkeleton } = useCardLoadingState({
    isLoading,
    isRefreshing,
    hasAnyData: pods.length > 0,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures: podsFailures,
    errorMessage: isFailed ? t('networkPolicyCoverage.failedToLoad') : undefined })

  // Build a set of namespace keys that have real NetworkPolicy resources
  const policyNamespaceKeys = (() => {
    const keys = new Set<string>()
    for (const policy of networkpolicies) {
      const cluster = policy.cluster || 'unknown'
      const ns = policy.namespace || 'default'
      keys.add(`${cluster}/${ns}`)
    }
    return keys
  })()

  // Count policies per namespace key
  const policyCountByNs = (() => {
    const counts = new Map<string, number>()
    for (const policy of networkpolicies) {
      const key = `${policy.cluster || 'unknown'}/${policy.namespace || 'default'}`
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return counts
  })()

  // Build namespace coverage from pod data + real policy data
  const coverage = useMemo((): NamespaceCoverage[] => {
    const nsMap = new Map<string, NamespaceCoverage>()
    for (const pod of pods) {
      const ns = pod.namespace || 'default'
      const cluster = pod.cluster || 'unknown'
      const key = `${cluster}/${ns}`
      if (!nsMap.has(key)) {
        let hasPolicies: boolean
        let policyCount: number
        if (isEstimated) {
          // Fallback heuristic when policy API is unavailable
          const isSystem = ns.startsWith('kube-') || ns.startsWith('openshift-') || ns === 'istio-system'
          hasPolicies = isSystem
          policyCount = isSystem ? 1 : 0
        } else {
          // Use real NetworkPolicy data
          hasPolicies = policyNamespaceKeys.has(key)
          policyCount = policyCountByNs.get(key) || 0
        }
        nsMap.set(key, {
          namespace: ns,
          cluster,
          podCount: 0,
          hasPolicies,
          policyCount })
      }
      nsMap.get(key)!.podCount++
    }
    return Array.from(nsMap.values()).sort((a, b) => b.podCount - a.podCount)
  }, [pods, isEstimated, policyNamespaceKeys, policyCountByNs])

  const coveredCount = coverage.filter(c => c.hasPolicies).length
  const totalCount = coverage.length
  const coveragePercent = totalCount > 0 ? Math.round((coveredCount / totalCount) * 100) : 0

  const displayed = showUncovered ? coverage.filter(c => !c.hasPolicies) : coverage

  if (showSkeleton) {
    return (
      <div className="space-y-2 p-1">
        <div className="h-16 rounded bg-muted/50 animate-pulse" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-8 rounded bg-muted/50 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2 p-1">
      {/* Estimated coverage warning */}
      {isEstimated && (
        <div
          className="flex items-center gap-1.5 text-xs text-yellow-500 bg-yellow-500/10 rounded px-2 py-1"
          title={t('networkPolicyCoverage.estimatedTooltip')}
        >
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <span>{t('networkPolicyCoverage.estimated')}</span>
        </div>
      )}

      {/* Coverage donut */}
      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
            <circle
              cx="18" cy="18" r="14" fill="none"
              strokeWidth="3"
              strokeDasharray={`${coveragePercent * 0.88} 88`}
              strokeLinecap="round"
              className={coveragePercent > 70 ? 'text-green-500' : coveragePercent > 40 ? 'text-yellow-500' : 'text-red-500'}
              stroke="currentColor"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">
            {coveragePercent}%
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          <div>{t('networkPolicyCoverage.namespacesOf', { covered: coveredCount, total: totalCount })}</div>
          <div>{t('networkPolicyCoverage.haveNetworkPolicies')}</div>
        </div>
      </div>

      {/* Filter */}
      <button
        onClick={() => setShowUncovered(!showUncovered)}
        className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
          showUncovered ? 'bg-red-500/10 text-red-400' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
        }`}
      >
        {showUncovered ? t('networkPolicyCoverage.uncoveredOnly', { count: totalCount - coveredCount }) : t('networkPolicyCoverage.showUncovered')}
      </button>

      {/* Namespace list */}
      <div className="space-y-1 max-h-[250px] overflow-y-auto">
        {displayed.slice(0, MAX_DISPLAYED_NAMESPACES).map(ns => (
          <div key={`${ns.cluster}/${ns.namespace}`} className="flex flex-wrap items-center justify-between gap-y-2 px-2 py-1 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-2 h-2 rounded-full ${ns.hasPolicies ? 'bg-green-500' : 'bg-red-500'}`} />
              <div className="min-w-0">
                <div className="text-sm truncate">{ns.namespace}</div>
                <div className="text-xs text-muted-foreground">{ns.cluster}</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground shrink-0">
              {ns.policyCount > 0
                ? t('networkPolicyCoverage.policiesAndPods', { policies: ns.policyCount, pods: ns.podCount })
                : t('networkPolicyCoverage.podsCount', { count: ns.podCount })
              }
            </div>
          </div>
        ))}
        {displayed.length > MAX_DISPLAYED_NAMESPACES && (
          <div className="text-xs text-muted-foreground text-center py-1">
            {t('networkPolicyCoverage.showingOf', { shown: MAX_DISPLAYED_NAMESPACES, total: displayed.length })}
          </div>
        )}
      </div>
    </div>
  )
}
