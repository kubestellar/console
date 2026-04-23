import { ShieldAlert } from 'lucide-react'
import { useCachedSecurityAudit } from '../../../hooks/useGadget'
import { useCardLoadingState, useCardDemoState } from '../CardDataContext'
import { ClusterBadge } from '../../ui/ClusterBadge'

interface SecurityAuditCardProps {
  config?: Record<string, unknown>
}

export function SecurityAuditCard({ config }: SecurityAuditCardProps) {
  const cluster = config?.cluster as string | undefined
  const namespace = config?.namespace as string | undefined
  const { shouldUseDemoData: isDemoMode } = useCardDemoState({ requires: 'agent' })

  const { data, isLoading, isRefreshing, isDemoData, isFailed, consecutiveFailures } = useCachedSecurityAudit(cluster, namespace)

  const hasData = data.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing: isDemoMode ? false : isRefreshing && hasData,
    isDemoData: isDemoMode || isDemoData,
    hasAnyData: hasData,
    isFailed,
    consecutiveFailures })

  const audits = [...data].slice(0, 20)

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
        <ShieldAlert className="w-8 h-8 mb-2 opacity-50" />
        <div className="font-medium">No Security Audit Events</div>
        <div className="text-xs mt-1">Seccomp violations and capability checks will appear here</div>
      </div>
    )
  }

  return (
    <div className="space-y-1 p-1 text-xs">
      <div className="text-muted-foreground mb-1">
        {audits.length} security events
      </div>
      {audits.map((event, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/15 transition-colors"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-foreground truncate">
              {event.syscall} <span className="text-red-400">({event.action})</span>
            </div>
            <div className="text-muted-foreground truncate">
              {event.pod} / {event.namespace} — {event.capability}
            </div>
          </div>
          <ClusterBadge cluster={event.cluster} />
        </div>
      ))}
    </div>
  )
}
