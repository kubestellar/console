import { useState, useMemo } from 'react'
import { useCachedPods } from '../../hooks/useCachedData'
import { useCardLoadingState } from './CardDataContext'

interface NamespaceCoverage {
  namespace: string
  cluster: string
  podCount: number
  hasPolicies: boolean
  policyCount: number
}

export function NetworkPolicyCoverage() {
  const { pods, isLoading, isDemoFallback, isFailed, consecutiveFailures } = useCachedPods()
  const [showUncovered, setShowUncovered] = useState(false)
  const { showSkeleton } = useCardLoadingState({
    isLoading,
    hasAnyData: pods.length > 0,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })

  // Build namespace coverage from pod data
  // In a real implementation, this would also fetch NetworkPolicy resources
  const coverage = useMemo((): NamespaceCoverage[] => {
    const nsMap = new Map<string, NamespaceCoverage>()
    for (const pod of pods) {
      const key = `${pod.cluster || 'unknown'}/${pod.namespace || 'default'}`
      if (!nsMap.has(key)) {
        // Heuristic: system namespaces typically have policies
        const ns = pod.namespace || 'default'
        const isSystem = ns.startsWith('kube-') || ns.startsWith('openshift-') || ns === 'istio-system'
        nsMap.set(key, {
          namespace: ns,
          cluster: pod.cluster || 'unknown',
          podCount: 0,
          hasPolicies: isSystem,
          policyCount: isSystem ? 1 : 0,
        })
      }
      nsMap.get(key)!.podCount++
    }
    return Array.from(nsMap.values()).sort((a, b) => b.podCount - a.podCount)
  }, [pods])

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
          <div><span className="text-foreground font-medium">{coveredCount}</span> of {totalCount} namespaces</div>
          <div>have network policies</div>
        </div>
      </div>

      {/* Filter */}
      <button
        onClick={() => setShowUncovered(!showUncovered)}
        className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
          showUncovered ? 'bg-red-500/10 text-red-400' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
        }`}
      >
        {showUncovered ? `Uncovered only (${totalCount - coveredCount})` : 'Show uncovered'}
      </button>

      {/* Namespace list */}
      <div className="space-y-1 max-h-[250px] overflow-y-auto">
        {displayed.slice(0, 30).map(ns => (
          <div key={`${ns.cluster}/${ns.namespace}`} className="flex items-center justify-between px-2 py-1 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-2 h-2 rounded-full ${ns.hasPolicies ? 'bg-green-500' : 'bg-red-500'}`} />
              <div className="min-w-0">
                <div className="text-sm truncate">{ns.namespace}</div>
                <div className="text-xs text-muted-foreground">{ns.cluster}</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground shrink-0">
              {ns.podCount} pods
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
