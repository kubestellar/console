import { AlertCircle, Clock, Globe, Lock, ShieldAlert, WifiOff, XCircle } from 'lucide-react'
import type { ClusterInfo } from '../../hooks/mcp/types'
import { cn } from '../../lib/cn'
import { formatLastSeen, getSuggestionForErrorType } from '../../lib/errorClassifier'
import { getClusterHealthState, isClusterUnreachable } from './utils'

interface ClusterStatusDetailsProps {
  cluster: ClusterInfo
  className?: string
}

// Render the appropriate error icon inline rather than returning a
// component reference — the react-hooks plugin flags component aliases
// created during render (see #5925 follow-up).
function renderErrorIcon(errorType: string | undefined, className: string) {
  switch (errorType) {
    case 'auth':
      return <Lock className={className} aria-hidden="true" />
    case 'certificate':
      return <ShieldAlert className={className} aria-hidden="true" />
    case 'network':
      return <XCircle className={className} aria-hidden="true" />
    case 'timeout':
      return <WifiOff className={className} aria-hidden="true" />
    default:
      return <AlertCircle className={className} aria-hidden="true" />
  }
}

/**
 * Compact panel that surfaces the extra diagnostic fields the backend
 * already populates but that were previously hidden from the UI:
 *
 * - unreachable reason (#5925)
 * - external reachability (#5926)
 * - freshness / last-seen timestamp (#5927)
 *
 * This is rendered in the cluster detail modal and can be reused by
 * other cluster status panels.
 */
export function ClusterStatusDetails({ cluster, className }: ClusterStatusDetailsProps) {
  const healthState = getClusterHealthState(cluster)
  const unreachable = isClusterUnreachable(cluster)
  const errorType = cluster.errorType

  // Pretty label for the error type. Falls back to "Unknown error" when
  // the backend couldn't classify the failure.
  const errorLabel = errorType
    ? errorType.charAt(0).toUpperCase() + errorType.slice(1)
    : 'Unknown'

  // Only show the panel when there's at least one field worth surfacing.
  const hasFreshness = !!cluster.lastSeen
  const hasExternalReachability = cluster.externallyReachable !== undefined
  const hasUnreachableReason = unreachable && (errorType || cluster.errorMessage)
  const isNeverConnected = cluster.neverConnected === true
  const isUnknown = healthState === 'unknown'

  if (
    !hasFreshness &&
    !hasExternalReachability &&
    !hasUnreachableReason &&
    !isNeverConnected &&
    !isUnknown
  ) {
    return null
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card/30 p-3 text-xs space-y-2',
        className,
      )}
      role="status"
      aria-label="Cluster status details"
    >
      {hasUnreachableReason && (
        <div className="flex items-start gap-2 text-red-300">
          {renderErrorIcon(errorType, 'w-4 h-4 mt-0.5 flex-shrink-0')}
          <div className="flex-1 min-w-0">
            <div className="font-medium">
              Unreachable: {errorLabel}
            </div>
            {cluster.errorMessage && (
              <div className="text-muted-foreground break-words">
                {cluster.errorMessage}
              </div>
            )}
            {errorType && (
              <div className="text-muted-foreground/80 mt-0.5">
                Suggestion: {getSuggestionForErrorType(errorType)}
              </div>
            )}
          </div>
        </div>
      )}

      {isNeverConnected && !hasUnreachableReason && (
        <div className="flex items-start gap-2 text-yellow-300">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <div className="font-medium">Never connected</div>
            <div className="text-muted-foreground">
              No successful health probe since startup — this context may point at a cluster that no longer exists.
            </div>
          </div>
        </div>
      )}

      {isUnknown && !hasUnreachableReason && !isNeverConnected && (
        <div className="flex items-start gap-2 text-muted-foreground">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-foreground">Health unknown</div>
            <div>
              No authoritative health signal yet. Waiting for the next probe.
            </div>
          </div>
        </div>
      )}

      {hasExternalReachability && (
        <div className="flex items-center gap-2">
          <Globe
            className={cn(
              'w-4 h-4 flex-shrink-0',
              cluster.externallyReachable ? 'text-green-400' : 'text-yellow-400',
            )}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <span className="text-muted-foreground">External reachability:</span>{' '}
            <span
              className={cn(
                'font-medium',
                cluster.externallyReachable ? 'text-green-300' : 'text-yellow-300',
              )}
            >
              {cluster.externallyReachable ? 'Reachable' : 'Not reachable from outside'}
            </span>
          </div>
        </div>
      )}

      {hasFreshness && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <span>Last seen:</span>{' '}
            <span
              className="text-foreground font-medium"
              title={typeof cluster.lastSeen === 'string' ? cluster.lastSeen : undefined}
            >
              {formatLastSeen(cluster.lastSeen)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
