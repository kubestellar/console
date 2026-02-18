import { useMemo } from 'react'
import { useCachedPods } from '../../hooks/useCachedData'
import { useCardLoadingState } from './CardDataContext'

export function EtcdStatus() {
  const { pods, isLoading, isDemoFallback, isFailed, consecutiveFailures } = useCachedPods(undefined, 'kube-system')
  const { showSkeleton } = useCardLoadingState({
    isLoading,
    hasAnyData: pods.length > 0,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })

  const etcdPods = useMemo(() => {
    return pods.filter(p => p.name?.includes('etcd') && !p.name?.includes('operator'))
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
        <div className="text-2xl mb-2">🗄️</div>
        <div className="font-medium">etcd Managed by Provider</div>
        <div className="text-xs text-center mt-1">etcd is managed by your cloud provider or not visible in kube-system</div>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-1">
      <div className="text-xs text-muted-foreground">
        {etcdPods.length} etcd members across {byCluster.length} clusters
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
                <span>{running.length}/{clusterPods.length} members</span>
                {totalRestarts > 0 && <span className="text-orange-400">{totalRestarts} restarts</span>}
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
    </div>
  )
}
