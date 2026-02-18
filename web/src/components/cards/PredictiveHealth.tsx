import { useState, useMemo } from 'react'
import { useCachedNodes, useCachedPods } from '../../hooks/useCachedData'
import { useCardLoadingState } from './CardDataContext'

interface Prediction {
  id: string
  cluster: string
  resource: string
  severity: 'critical' | 'warning' | 'info'
  message: string
  confidence: number
  timeToExhaustion?: string
}

export function PredictiveHealth() {
  const { nodes, isLoading: nodesLoading, isDemoFallback: nodesDemoFallback, isFailed: nodesFailed, consecutiveFailures: nodesFailures } = useCachedNodes()
  const { pods, isLoading: podsLoading, isDemoFallback: podsDemoFallback, isFailed: podsFailed, consecutiveFailures: podsFailures } = useCachedPods()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const isLoading = nodesLoading || podsLoading
  const { showSkeleton } = useCardLoadingState({
    isLoading,
    hasAnyData: nodes.length > 0 || pods.length > 0,
    isDemoData: nodesDemoFallback || podsDemoFallback,
    isFailed: nodesFailed || podsFailed,
    consecutiveFailures: Math.max(nodesFailures, podsFailures),
  })

  const predictions = useMemo((): Prediction[] => {
    if (nodes.length === 0 && pods.length === 0) return []

    const results: Prediction[] = []
    // Group nodes by cluster
    const clusterNodes = new Map<string, typeof nodes>()
    for (const node of nodes) {
      const c = node.cluster || 'unknown'
      if (!clusterNodes.has(c)) clusterNodes.set(c, [])
      clusterNodes.get(c)!.push(node)
    }

    // Analyze per-cluster patterns
    for (const [cluster, cNodes] of clusterNodes) {
      const clusterPods = pods.filter(p => p.cluster === cluster)
      const podDensity = cNodes.length > 0 ? clusterPods.length / cNodes.length : 0

      // High pod density warning
      if (podDensity > 80) {
        results.push({
          id: `pod-density-${cluster}`,
          cluster,
          resource: 'Pods',
          severity: podDensity > 100 ? 'critical' : 'warning',
          message: `Pod density is ${Math.round(podDensity)} pods/node — consider adding nodes`,
          confidence: 0.85,
          timeToExhaustion: podDensity > 100 ? '< 24h' : '3-7 days',
        })
      }

      // Node pressure detection
      const pressuredNodes = cNodes.filter(n => {
        const conditions = (n.conditions || []) as Array<{ type: string; status: string }>
        return conditions.some(c => c.type !== 'Ready' && c.status === 'True')
      })
      if (pressuredNodes.length > 0) {
        results.push({
          id: `pressure-${cluster}`,
          cluster,
          resource: 'Nodes',
          severity: pressuredNodes.length > 1 ? 'critical' : 'warning',
          message: `${pressuredNodes.length} node(s) under pressure — risk of pod eviction`,
          confidence: 0.92,
          timeToExhaustion: '< 1h',
        })
      }

      // Unschedulable nodes
      const cordoned = cNodes.filter(n => n.unschedulable)
      if (cordoned.length > 0 && cordoned.length / cNodes.length > 0.3) {
        results.push({
          id: `cordoned-${cluster}`,
          cluster,
          resource: 'Capacity',
          severity: 'warning',
          message: `${cordoned.length}/${cNodes.length} nodes cordoned — reduced scheduling capacity`,
          confidence: 0.95,
        })
      }

      // Restart storm detection
      const highRestarts = clusterPods.filter(p => (p.restarts || 0) > 5)
      if (highRestarts.length > 3) {
        results.push({
          id: `restarts-${cluster}`,
          cluster,
          resource: 'Stability',
          severity: highRestarts.length > 10 ? 'critical' : 'warning',
          message: `${highRestarts.length} pods with high restart counts — potential instability`,
          confidence: 0.78,
        })
      }
    }

    return results.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 }
      return order[a.severity] - order[b.severity]
    })
  }, [nodes, pods])

  if (showSkeleton) {
    return (
      <div className="space-y-2 p-1">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded bg-muted/50 animate-pulse" />
        ))}
      </div>
    )
  }

  const severityStyles = {
    critical: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', dot: 'bg-red-500' },
    warning: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', dot: 'bg-yellow-500' },
    info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', dot: 'bg-blue-500' },
  }

  return (
    <div className="space-y-2 p-1">
      {/* Summary */}
      <div className="flex gap-2 text-xs">
        <span className="text-red-400">{predictions.filter(p => p.severity === 'critical').length} critical</span>
        <span className="text-yellow-400">{predictions.filter(p => p.severity === 'warning').length} warnings</span>
        <span className="text-muted-foreground">{predictions.length} total predictions</span>
      </div>

      {predictions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-sm">
          <div className="text-2xl mb-2">✨</div>
          <div className="font-medium">All Clear</div>
          <div className="text-xs mt-1">No resource exhaustion predicted</div>
        </div>
      ) : (
        <div className="space-y-1 max-h-[350px] overflow-y-auto">
          {predictions.map(pred => {
            const style = severityStyles[pred.severity]
            const isExpanded = expandedId === pred.id
            return (
              <button
                key={pred.id}
                onClick={() => setExpandedId(isExpanded ? null : pred.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${style.bg} ${style.border} hover:brightness-110`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${style.dot}`} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{pred.resource}</div>
                      <div className="text-xs text-muted-foreground truncate">{pred.message}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">{pred.cluster}</span>
                    {pred.timeToExhaustion && (
                      <span className={`text-xs ${style.text}`}>{pred.timeToExhaustion}</span>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className="mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
                    <div>Confidence: {Math.round(pred.confidence * 100)}%</div>
                    {pred.timeToExhaustion && <div>Estimated time to exhaustion: {pred.timeToExhaustion}</div>}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
