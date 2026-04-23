import { Network, ArrowRight } from 'lucide-react'
import { useCachedNetworkTraces } from '../../../hooks/useGadget'
import { useCardLoadingState, useCardDemoState } from '../CardDataContext'
import { ClusterBadge } from '../../ui/ClusterBadge'

interface NetworkTraceCardProps {
  config?: Record<string, unknown>
}

export function NetworkTraceCard({ config }: NetworkTraceCardProps) {
  const cluster = config?.cluster as string | undefined
  const namespace = config?.namespace as string | undefined
  const { shouldUseDemoData: isDemoMode } = useCardDemoState({ requires: 'agent' })

  const { data, isLoading, isRefreshing, isDemoData, isFailed, consecutiveFailures } = useCachedNetworkTraces(cluster, namespace)

  const hasData = data.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing: isDemoMode ? false : isRefreshing && hasData,
    isDemoData: isDemoMode || isDemoData,
    hasAnyData: hasData,
    isFailed,
    consecutiveFailures })

  const connections = [...data].slice(0, 20)

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
        <Network className="w-8 h-8 mb-2 opacity-50" />
        <div className="font-medium">No Network Traces</div>
        <div className="text-xs mt-1">Inspektor Gadget eBPF traces will appear here</div>
      </div>
    )
  }

  return (
    <div className="space-y-1 p-1 text-xs">
      <div className="text-muted-foreground mb-1">
        {connections.length} active connections
      </div>
      {connections.map((conn, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 truncate">
              <span className="font-medium text-foreground truncate">{conn.srcPod}</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="font-medium text-foreground truncate">{conn.dstPod}</span>
            </div>
            <div className="text-muted-foreground truncate">
              {conn.srcNamespace} → {conn.dstNamespace}:{conn.dstPort}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-muted-foreground">{conn.protocol}</div>
            <div className="text-muted-foreground">{formatBytes(conn.bytes)}</div>
          </div>
          <ClusterBadge cluster={conn.cluster} />
        </div>
      ))}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
