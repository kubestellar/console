import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { PodInfo } from '../../hooks/mcp/types'
import { useCachedPods } from '../../hooks/useCachedData'
import { useCardLoadingState } from './CardDataContext'

/**
 * Detects whether a pod is an etcd member using multiple signals:
 * - Pod name contains 'etcd' (but not 'operator' or 'backup')
 * - Labels: component=etcd, tier=control-plane with app=etcd
 * - Container names: any container named 'etcd' or 'etcd-container'
 */
function isEtcdPod(pod: PodInfo): boolean {
  const name = pod.name?.toLowerCase() || ''
  const labels = pod.labels || {}

  // Exclude operator/backup pods regardless of detection method
  if (name.includes('operator') || name.includes('backup')) return false

  // Signal 1: Pod name contains 'etcd'
  if (name.includes('etcd')) return true

  // Signal 2: Labels indicate etcd (component=etcd or app.kubernetes.io/name=etcd)
  if (labels['component'] === 'etcd') return true
  if (labels['app.kubernetes.io/name'] === 'etcd') return true
  if (labels['app'] === 'etcd' && labels['tier'] === 'control-plane') return true

  // Signal 3: Container named 'etcd' inside the pod
  if (pod.containers?.some(c => c.name === 'etcd' || c.name === 'etcd-container')) return true

  return false
}

/** Check if a cluster appears to be managed (no kube-system pods visible at all) */
function isManagedCluster(allPods: PodInfo[], cluster: string): boolean {
  return !allPods.some(p => (p.cluster || 'unknown') === cluster && p.namespace === 'kube-system')
}

export function EtcdStatus() {
  const { t } = useTranslation('cards')
  // Fetch from all namespaces so we catch etcd pods outside kube-system
  const { pods, isLoading, isDemoFallback, isFailed, consecutiveFailures } = useCachedPods()
  const { showSkeleton } = useCardLoadingState({
    isLoading,
    hasAnyData: pods.length > 0,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })

  const etcdPods = useMemo(() => {
    return pods.filter(isEtcdPod)
  }, [pods])

  const byCluster = useMemo(() => {
    const map = new Map<string, typeof etcdPods>()
    for (const pod of etcdPods) {
      const cluster = pod.cluster || 'unknown'
      if (!map.has(cluster)) map.set(cluster, [])
      map.get(cluster)!.push(pod)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [etcdPods])

  // Determine distinct clusters that have pods but no etcd detected
  const clustersWithoutEtcd = useMemo(() => {
    const allClusters = new Set(pods.map(p => p.cluster || 'unknown'))
    const etcdClusters = new Set(etcdPods.map(p => p.cluster || 'unknown'))
    return Array.from(allClusters).filter(c => !etcdClusters.has(c))
  }, [pods, etcdPods])

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
    // Distinguish: are we seeing pods at all? If yes, etcd is truly not detected.
    // If no pods at all, we likely have no data.
    const hasAnyPods = pods.length > 0
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4">
        <div className="text-2xl mb-2">{hasAnyPods ? '🔍' : '🗄️'}</div>
        <div className="font-medium">
          {hasAnyPods ? t('etcdStatus.notDetected') : t('etcdStatus.managedByProvider')}
        </div>
        <div className="text-xs text-center mt-1">
          {hasAnyPods ? t('etcdStatus.notDetectedDescription') : t('etcdStatus.managedDescription')}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-1">
      <div className="text-xs text-muted-foreground">
        {t('etcdStatus.membersSummary', { members: etcdPods.length, clusters: byCluster.length })}
      </div>
      {byCluster.map(([cluster, clusterPods]) => {
        const running = clusterPods.filter(p => p.status === 'Running')
        const totalRestarts = clusterPods.reduce((s, p) => s + (p.restarts || 0), 0)
        const allHealthy = running.length === clusterPods.length

        return (
          <div key={cluster} className="px-2 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${allHealthy ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm font-medium">{cluster}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{t('etcdStatus.membersCount', { ready: running.length, total: clusterPods.length })}</span>
                {totalRestarts > 0 && <span className="text-orange-400">{t('etcdStatus.restarts', { count: totalRestarts })}</span>}
              </div>
            </div>
            <div className="flex gap-1 mt-1 flex-wrap">
              {clusterPods.map(pod => {
                const version = pod.containers?.[0]?.image?.split(':')[1]?.split('-')[0] || ''
                return (
                  <span
                    key={pod.name}
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      pod.status === 'Running' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                    }`}
                    title={pod.name}
                  >
                    {pod.status === 'Running' ? '✓' : '✗'} {version}
                  </span>
                )
              })}
            </div>
          </div>
        )
      })}
      {clustersWithoutEtcd.length > 0 && (
        <div className="mt-1 px-2 py-1.5 rounded-lg bg-muted/20 text-xs text-muted-foreground">
          <span className="font-medium">{clustersWithoutEtcd.join(', ')}</span>
          {' — '}
          {clustersWithoutEtcd.some(c => isManagedCluster(pods, c))
            ? t('etcdStatus.managedByProvider')
            : t('etcdStatus.notDetected')}
        </div>
      )}
    </div>
  )
}
