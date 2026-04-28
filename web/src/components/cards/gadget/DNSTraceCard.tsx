import { Globe, AlertCircle } from 'lucide-react'
import { useCachedDNSTraces } from '../../../hooks/useGadget'
import { useCardLoadingState, useCardDemoState } from '../CardDataContext'
import { ClusterBadge } from '../../ui/ClusterBadge'

interface DNSTraceCardProps {
  config?: Record<string, unknown>
}

export function DNSTraceCard({ config }: DNSTraceCardProps) {
  const cluster = config?.cluster as string | undefined
  const namespace = config?.namespace as string | undefined
  const { shouldUseDemoData: isDemoMode } = useCardDemoState({ requires: 'agent' })

  const { data, isLoading, isRefreshing, isDemoData, isFailed, consecutiveFailures } = useCachedDNSTraces(cluster, namespace)

  const hasData = data.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing: isDemoMode ? false : isRefreshing && hasData,
    isDemoData: isDemoMode || isDemoData,
    hasAnyData: hasData,
    isFailed,
    consecutiveFailures })

  const queries = [...data].slice(0, 20)
  const failures = data.filter(d => d.responseCode !== 'NOERROR')

  if (showSkeleton) {
    return (
      <div className="space-y-2 p-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-10 rounded bg-muted/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4">
        <Globe className="w-8 h-8 mb-2 opacity-50" />
        <div className="font-medium">No DNS Traces</div>
        <div className="text-xs mt-1">Inspektor Gadget DNS tracing will appear here</div>
      </div>
    )
  }

  return (
    <div className="space-y-1 p-1 text-xs">
      <div className="flex items-center gap-3 text-muted-foreground mb-1">
        <span>{queries.length} queries</span>
        {failures.length > 0 && (
          <span className="flex items-center gap-1 text-red-400">
            <AlertCircle className="w-3 h-3" />
            {failures.length} failures
          </span>
        )}
      </div>
      {queries.map((q, i) => {
        const isFailure = q.responseCode !== 'NOERROR'
        return (
          <div
            key={i}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
              isFailure ? 'bg-red-500/10 hover:bg-red-500/15' : 'bg-muted/30 hover:bg-muted/50'
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium text-foreground truncate">{q.query}</div>
              <div className="text-muted-foreground truncate">
                {q.pod} / {q.namespace}
              </div>
            </div>
            <div className="text-right shrink-0 space-y-0.5">
              <div className={isFailure ? 'text-red-400 font-medium' : 'text-green-400'}>
                {q.responseCode}
              </div>
              <div className="text-muted-foreground">{q.latencyMs.toFixed(1)}ms</div>
            </div>
            <ClusterBadge cluster={q.cluster} />
          </div>
        )
      })}
    </div>
  )
}
