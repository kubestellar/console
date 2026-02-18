import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCachedPods } from '../../hooks/useCachedData'

export function DNSHealth() {
  const { t } = useTranslation('cards')
  const { pods, isLoading } = useCachedPods(undefined, 'kube-system')

  const dnsPods = useMemo(() => {
    return pods.filter(p =>
      p.name?.includes('coredns') || p.name?.includes('kube-dns')
    )
  }, [pods])

  const byCluster = useMemo(() => {
    const map = new Map<string, typeof dnsPods>()
    for (const pod of dnsPods) {
      const cluster = pod.cluster || 'unknown'
      if (!map.has(cluster)) map.set(cluster, [])
      map.get(cluster)!.push(pod)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [dnsPods])

  if (isLoading && pods.length === 0) {
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
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <span>{t('dnsHealth.podsSummary', { pods: dnsPods.length, clusters: byCluster.length })}</span>
      </div>
      {byCluster.map(([cluster, clusterPods]) => {
        const running = clusterPods.filter(p => p.status === 'Running')
        const totalRestarts = clusterPods.reduce((s, p) => s + (p.restarts || 0), 0)
        const allHealthy = running.length === clusterPods.length

        return (
          <div key={cluster} className="px-2 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${allHealthy ? 'bg-green-500' : 'bg-yellow-500'}`} />
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
                const version = pod.containers?.[0]?.image?.split(':')[1] || ''
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
