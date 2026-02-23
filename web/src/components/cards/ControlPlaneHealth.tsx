import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCachedPods } from '../../hooks/useCachedData'
import { useClusters } from '../../hooks/useMCP'
import { useCardLoadingState } from './CardDataContext'

const CP_LABELS: Record<string, string[]> = {
  'API Server': ['component=kube-apiserver', 'app=openshift-kube-apiserver'],
  'Scheduler': ['component=kube-scheduler'],
  'Controller Mgr': ['component=kube-controller-manager'],
  'etcd': ['component=etcd'],
  'CoreDNS': ['k8s-app=kube-dns'],
}

export function ControlPlaneHealth() {
  const { t } = useTranslation('cards')
  const { pods, isLoading, isDemoFallback, isFailed, consecutiveFailures } = useCachedPods(undefined, 'kube-system')
  const { clusters } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)

  useCardLoadingState({
    isLoading,
    hasAnyData: pods.length > 0,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })

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

  const managedCluster = componentStatus.every(c => c.total === 0) && clusters.length > 0

  if (isLoading && pods.length === 0) {
    return (
      <div className="space-y-2 p-1">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-8 rounded bg-muted/50 animate-pulse" />
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
        <div key={comp.name} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
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
