import { Terminal } from 'lucide-react'
import { useCachedProcessTraces } from '../../../hooks/useGadget'
import { useCardLoadingState, useCardDemoState } from '../CardDataContext'
import { ClusterBadge } from '../../ui/ClusterBadge'

interface ProcessTraceCardProps {
  config?: Record<string, unknown>
}

export function ProcessTraceCard({ config }: ProcessTraceCardProps) {
  const cluster = config?.cluster as string | undefined
  const namespace = config?.namespace as string | undefined
  const { shouldUseDemoData: isDemoMode } = useCardDemoState({ requires: 'agent' })

  const { data, isLoading, isRefreshing, isDemoData, isFailed, consecutiveFailures } = useCachedProcessTraces(cluster, namespace)

  const hasData = data.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing: isDemoMode ? false : isRefreshing && hasData,
    isDemoData: isDemoMode || isDemoData,
    hasAnyData: hasData,
    isFailed,
    consecutiveFailures })

  const processes = [...data].slice(0, 20)

  if (showSkeleton) {
    return (
      <div className="space-y-2 p-1">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-10 rounded bg-muted/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4">
        <Terminal className="w-8 h-8 mb-2 opacity-50" />
        <div className="font-medium">No Process Traces</div>
        <div className="text-xs mt-1">Inspektor Gadget process execution tracing will appear here</div>
      </div>
    )
  }

  return (
    <div className="space-y-1 p-1 text-xs">
      <div className="text-muted-foreground mb-1">
        {processes.length} process executions
      </div>
      {processes.map((proc, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
        >
          <Terminal className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-mono font-medium text-foreground truncate">
              {proc.binary} <span className="text-muted-foreground font-normal">{proc.args}</span>
            </div>
            <div className="text-muted-foreground truncate">
              {proc.pod} / {proc.container} ({proc.namespace})
            </div>
          </div>
          <div className="text-muted-foreground shrink-0">uid:{proc.uid}</div>
          <ClusterBadge cluster={proc.cluster} />
        </div>
      ))}
    </div>
  )
}
