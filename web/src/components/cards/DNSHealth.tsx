import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCachedPods } from '../../hooks/useCachedData'
import { useCardLoadingState } from './CardDataContext'
import { RefreshIndicator } from '../ui/RefreshIndicator'

/** Namespaces that host DNS pods across distributions */
const DNS_NAMESPACES = ['kube-system', 'openshift-dns']

/** Pod name substrings that identify DNS pods */
const DNS_POD_PATTERNS = ['coredns', 'kube-dns', 'dns-default']

export function DNSHealth() {
  const { t } = useTranslation('cards')
  // Fetch from all namespaces so we catch DNS pods in both kube-system and openshift-dns
  const { pods, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, lastRefresh: podsLastRefresh } = useCachedPods()
  const hasData = pods.length > 0
  const { showSkeleton } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures })

  const dnsPods = useMemo(() => pods.filter(p => {
      // Only consider pods in known DNS namespaces
      if (!DNS_NAMESPACES.includes(p.namespace || '')) return false
      const name = p.name?.toLowerCase() || ''
      return DNS_POD_PATTERNS.some(pattern => name.includes(pattern))
    }), [pods])

  const byCluster = useMemo(() => {
    const map = new Map<string, typeof dnsPods>()
    for (const pod of dnsPods) {
      const cluster = pod.cluster || 'unknown'
      if (!map.has(cluster)) map.set(cluster, [])
      map.get(cluster)!.push(pod)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [dnsPods])

  if (showSkeleton) {
    return (
      <div className="space-y-2 p-1">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-10 rounded bg-muted/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (byCluster.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4">
        <div className="text-2xl mb-2">🌐</div>
        <div className="font-medium">{t('dnsHealth.noDnsPods')}</div>
        <div className="text-xs mt-1">{t('dnsHealth.dnsPodsHint')}</div>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-1">
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2 mb-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{t('dnsHealth.podsSummary', { pods: dnsPods.length, clusters: byCluster.length })}</span>
        </div>
        {/* #6217 part 3: freshness indicator. */}
        <RefreshIndicator
          isRefreshing={isRefreshing}
          lastUpdated={typeof podsLastRefresh === 'number' ? new Date(podsLastRefresh) : null}
          size="sm"
          showLabel={true}
          staleThresholdMinutes={5}
        />
      </div>
      {byCluster.map(([cluster, clusterPods]) => {
        const running = clusterPods.filter(p => p.status === 'Running')
        const totalRestarts = clusterPods.reduce((s, p) => s + (p.restarts || 0), 0)
        const allHealthy = running.length === clusterPods.length

        return (
          <div key={cluster} className="px-2 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className="flex flex-wrap items-center justify-between gap-y-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${allHealthy ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="text-sm font-medium">{cluster}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{t('dnsHealth.readyCount', { ready: running.length, total: clusterPods.length })}</span>
                {totalRestarts > 0 && (
                  <span className="text-orange-400">{t('dnsHealth.restarts', { count: totalRestarts })}</span>
                )}
              </div>
            </div>
            <div className="flex gap-1 mt-1 flex-wrap">
              {clusterPods.map(pod => {
                const rawVersion = pod.containers?.[0]?.image?.split(':')[1] || ''
                // Strip @sha256 digest suffix and normalize leading 'v' prefix
                const version = rawVersion.split('@')[0].replace(/^v+/, '')
                return (
                  <span
                    key={pod.name}
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      pod.status === 'Running' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                    }`}
                    title={pod.name}
                  >
                    {pod.status === 'Running' ? '✓' : '✗'} {version && `v${version}`}
                  </span>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
