import { useMemo, useState } from 'react'
import { useCachedPods } from '../../hooks/useCachedData'

interface NamespaceUsage {
  namespace: string
  cluster: string
  podCount: number
  // CPU and memory are estimated from pod count
}

export function QuotaHeatmap() {
  const { pods, isLoading } = useCachedPods(undefined, undefined, { limit: 500 })
  const [selectedNs, setSelectedNs] = useState<string | null>(null)

  const namespaceData = useMemo(() => {
    const map = new Map<string, NamespaceUsage>()
    for (const pod of pods) {
      const key = `${pod.cluster || 'unknown'}/${pod.namespace || 'default'}`
      if (!map.has(key)) {
        map.set(key, {
          namespace: pod.namespace || 'default',
          cluster: pod.cluster || 'unknown',
          podCount: 0,
        })
      }
      map.get(key)!.podCount++
    }
    return Array.from(map.values()).sort((a, b) => b.podCount - a.podCount)
  }, [pods])

  const maxPods = useMemo(() => Math.max(1, ...namespaceData.map(d => d.podCount)), [namespaceData])

  if (isLoading && pods.length === 0) {
    return (
      <div className="grid grid-cols-6 gap-1 p-1">
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className="h-8 rounded bg-muted/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (namespaceData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4">
        <div className="text-2xl mb-2">📊</div>
        <div className="font-medium">No namespace data</div>
        <div className="text-xs mt-1">Namespace resource usage will appear here</div>
      </div>
    )
  }

  const getHeatColor = (ratio: number) => {
    if (ratio > 0.8) return 'bg-red-500/60 text-red-100'
    if (ratio > 0.5) return 'bg-yellow-500/40 text-yellow-100'
    if (ratio > 0.2) return 'bg-green-500/30 text-green-100'
    return 'bg-green-500/10 text-green-300'
  }

  return (
    <div className="space-y-2 p-1">
      <div className="text-xs text-muted-foreground">
        {namespaceData.length} namespaces across {new Set(namespaceData.map(d => d.cluster)).size} clusters
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 max-h-[350px] overflow-y-auto">
        {namespaceData.slice(0, 60).map(ns => {
          const ratio = ns.podCount / maxPods
          const isSelected = selectedNs === `${ns.cluster}/${ns.namespace}`
          return (
            <button
              key={`${ns.cluster}/${ns.namespace}`}
              onClick={() => setSelectedNs(isSelected ? null : `${ns.cluster}/${ns.namespace}`)}
              className={`p-1.5 rounded text-xs transition-all ${getHeatColor(ratio)} ${
                isSelected ? 'ring-2 ring-primary scale-105' : 'hover:scale-105'
              }`}
              title={`${ns.namespace} (${ns.cluster}): ${ns.podCount} pods`}
            >
              <div className="truncate font-medium">{ns.namespace}</div>
              <div className="text-[10px] opacity-75">{ns.podCount} pods</div>
            </button>
          )
        })}
      </div>
      {selectedNs && (() => {
        const ns = namespaceData.find(d => `${d.cluster}/${d.namespace}` === selectedNs)
        if (!ns) return null
        return (
          <div className="mt-2 p-2 rounded-lg bg-muted/30 text-xs">
            <div className="font-medium">{ns.namespace}</div>
            <div className="text-muted-foreground">Cluster: {ns.cluster}</div>
            <div className="text-muted-foreground">Pods: {ns.podCount}</div>
          </div>
        )
      })()}
      {namespaceData.length > 60 && (
        <div className="text-xs text-muted-foreground text-center">+{namespaceData.length - 60} more</div>
      )}
    </div>
  )
}
