import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCachedPods } from '../../hooks/useCachedData'
import { useClusters } from '../../hooks/useMCP'
import { Skeleton } from '../ui/Skeleton'
import { useCardLoadingState } from './CardDataContext'

/** Namespaces that host control-plane pods across distributions */
const CP_NAMESPACES = [
  'kube-system',
  'openshift-kube-apiserver',
  'openshift-kube-controller-manager',
  'openshift-kube-scheduler',
  'openshift-etcd',
]

const CP_LABELS: Record<string, string[]> = {
  'API Server': ['component=kube-apiserver', 'app=openshift-kube-apiserver'],
  'Scheduler': ['component=kube-scheduler', 'app=openshift-kube-scheduler'],
  'Controller Mgr': ['component=kube-controller-manager', 'app=openshift-kube-controller-manager'],
  'etcd': ['component=etcd', 'app=etcd'],
  'CoreDNS': ['k8s-app=kube-dns'] }

export function ControlPlaneHealth() {
  const { t } = useTranslation('cards')
  // Fetch from all namespaces so we catch control-plane pods in both
  // kube-system (vanilla K8s) and openshift-* namespaces (OpenShift)
  const { pods: allPods, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures } = useCachedPods()
  const { deduplicatedClusters: allClusters } = useClusters()
  // (#11145) Exclude clusters confirmed unreachable — unreachable primary
  // contexts should not influence health determination. Clusters with
  // reachable: undefined (not yet checked) are still included.
  const clusters = useMemo(() =>
    (allClusters || []).filter(c => c.reachable !== false),
    [allClusters]
  )
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)

  // Pre-filter to control-plane namespaces for efficiency
  const pods = allPods.filter(p => CP_NAMESPACES.includes(p.namespace || ''))

  const hasData = pods.length > 0
  const { showSkeleton } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures })

  const clusterNames = useMemo(() => {
    const names = new Set(pods.map(p => p.cluster).filter(Boolean))
    return Array.from(names).sort()
  }, [pods])

  const filtered = selectedCluster ? pods.filter(p => p.cluster === selectedCluster) : pods

  const componentStatus = useMemo(() => {
    return Object.entries(CP_LABELS).map(([name, labels]) => {
      const matching = filtered.filter(pod => {
        const podLabels = pod.labels
        if (!podLabels) {
          return labels.some(l => {
            const [, val] = l.split('=')
            return pod.name?.includes(val)
          })
        }
        return labels.some(l => {
          const [key, val] = l.split('=')
          return podLabels[key] === val
        })
      })
      const ready = matching.filter(p => p.status === 'Running')
      const totalRestarts = matching.reduce((sum, p) => sum + (p.restarts || 0), 0)
      return { name, total: matching.length, ready: ready.length, restarts: totalRestarts }
    })
  }, [filtered])

  // Only declare "managed cluster" when data has fully and successfully loaded
  // (not loading, not failed, not demo) and no control-plane pods were found.
  // Without the !isFailed guard, a cluster that exhausted its retry budget
  // (MAX_FAILURES) would show the cloud-provider UI instead of an error state,
  // because isLoading drops to false after retries are exhausted while isFailed
  // becomes true.
  const managedCluster = componentStatus.every(c => c.total === 0)
    && clusters.length > 0
    && !isLoading
    && !isFailed
    && !isDemoFallback

  if (showSkeleton) {
    return (
      <div className="space-y-2 p-1">
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} variant="rounded" height={32} />
        ))}
      </div>
    )
  }

  if (managedCluster) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4">
        <div className="text-2xl mb-2">☁️</div>
        <div className="font-medium">{t('controlPlaneHealth.managedCluster')}</div>
        <div className="text-xs text-center mt-1">{t('controlPlaneHealth.managedClusterDescription')}</div>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-1">
      {clusterNames.length > 1 && (
        <div className="flex gap-1 flex-wrap mb-2">
          <button
            onClick={() => setSelectedCluster(null)}
            className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
              !selectedCluster ? 'bg-primary text-primary-foreground' : 'bg-muted/50 hover:bg-muted text-muted-foreground'
            }`}
          >
            {t('controlPlaneHealth.all')}
          </button>
          {clusterNames.map(name => (
            <button
              key={name}
              onClick={() => setSelectedCluster(name ?? null)}
              className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                selectedCluster === name ? 'bg-primary text-primary-foreground' : 'bg-muted/50 hover:bg-muted text-muted-foreground'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      {componentStatus.map(comp => (
        <div key={comp.name} className="flex flex-wrap items-center justify-between gap-y-2 px-2 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              comp.total === 0 ? 'bg-muted-foreground/30' :
              comp.ready === comp.total ? 'bg-green-500' :
              comp.ready > 0 ? 'bg-yellow-500' : 'bg-red-500'
            }`} />
            <span className="text-sm font-medium">{comp.name}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{comp.ready}/{comp.total}</span>
            {comp.restarts > 0 && (
              <span className="text-orange-400">{t('controlPlaneHealth.restarts', { count: comp.restarts })}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
