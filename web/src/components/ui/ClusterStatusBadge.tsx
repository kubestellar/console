import {
  CheckCircle,
  AlertTriangle,
  WifiOff,
  Lock,
  XCircle,
  ShieldAlert,
  AlertCircle,
  HelpCircle,
  Loader2,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  ClusterErrorType,
  formatLastSeen,
  getSuggestionForErrorType,
} from '../../lib/errorClassifier'

export type ClusterState =
  | 'healthy'
  | 'degraded'
  | 'loading'
  | 'unknown'
  | 'unreachable-timeout'
  | 'unreachable-auth'
  | 'unreachable-network'
  | 'unreachable-cert'
  | 'unreachable-unknown'

interface ClusterStatusBadgeProps {
  state: ClusterState
  nodeCount?: number
  readyNodes?: number
  lastSeen?: string | Date
  className?: string
  size?: 'sm' | 'md'
  showLabel?: boolean
}

interface StateConfig {
  color: string
  bgColor: string
  borderColor: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  suggestion?: string
}

const STATE_CONFIGS: Record<ClusterState, StateConfig> = {
  healthy: {
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    icon: CheckCircle,
    label: 'Healthy',
  },
  degraded: {
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    icon: AlertTriangle,
    label: 'Degraded',
  },
  loading: {
    // Distinct loading state (#5924) — rendered while a health probe is
    // in flight and we have no cached data yet.
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    icon: Loader2,
    label: 'Loading',
  },
  unknown: {
    // Distinct unknown state (#5923/#5924) — shown when the backend has
    // not yet produced an authoritative health signal so the UI no
    // longer silently pretends the cluster is healthy.
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/30',
    borderColor: 'border-muted/50',
    icon: HelpCircle,
    label: 'Unknown',
  },
  'unreachable-timeout': {
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    icon: WifiOff,
    label: 'Offline',
    suggestion: getSuggestionForErrorType('timeout'),
  },
  'unreachable-auth': {
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    icon: Lock,
    label: 'Auth Error',
    suggestion: getSuggestionForErrorType('auth'),
  },
  'unreachable-network': {
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    icon: XCircle,
    label: 'Network Error',
    suggestion: getSuggestionForErrorType('network'),
  },
  'unreachable-cert': {
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    icon: ShieldAlert,
    label: 'Cert Error',
    suggestion: getSuggestionForErrorType('certificate'),
  },
  'unreachable-unknown': {
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    icon: AlertCircle,
    label: 'Offline',
    suggestion: getSuggestionForErrorType('unknown'),
  },
}

/**
 * Determine cluster state based on health data.
 *
 * Supports the new `loading` and `unknown` states introduced in #5924 so
 * consumers can surface a distinct visual state while a health probe is
 * in flight or when no authoritative health signal is available yet
 * (instead of silently defaulting to healthy — see #5923).
 *
 * Pass `loading=true` explicitly when the calling component knows a
 * refresh is in progress; otherwise the helper falls back to inferring
 * `unknown` when `healthy` is undefined and no reachability signal is
 * available either.
 */
export function getClusterState(
  healthy: boolean | undefined,
  reachable?: boolean,
  nodeCount?: number,
  readyNodes?: number,
  errorType?: ClusterErrorType,
  loading?: boolean,
): ClusterState {
  // Loading takes precedence over everything else so users always see
  // the spinner when a fresh probe is in flight (#5924).
  if (loading) return 'loading'

  // If explicitly unreachable
  if (reachable === false) {
    switch (errorType) {
      case 'timeout':
        return 'unreachable-timeout'
      case 'auth':
        return 'unreachable-auth'
      case 'network':
        return 'unreachable-network'
      case 'certificate':
        return 'unreachable-cert'
      default:
        return 'unreachable-unknown'
    }
  }

  // If healthy
  if (healthy === true) {
    // Check if degraded (not all nodes ready)
    if (
      nodeCount !== undefined &&
      readyNodes !== undefined &&
      readyNodes < nodeCount
    ) {
      return 'degraded'
    }
    return 'healthy'
  }

  // Explicitly unhealthy and reachable — degraded
  if (healthy === false) return 'degraded'

  // No authoritative signal anywhere — surface as unknown rather than
  // defaulting to degraded/healthy (#5923).
  if (reachable === undefined) return 'unknown'

  // Reachable but `healthy` is undefined: degraded is the least
  // surprising fallback since at least one signal came back.
  return 'degraded'
}

/**
 * Cluster status badge component
 */
export function ClusterStatusBadge({
  state,
  nodeCount,
  readyNodes,
  lastSeen,
  className,
  size = 'sm',
  showLabel = true,
}: ClusterStatusBadgeProps) {
  const config = STATE_CONFIGS[state]
  const Icon = config.icon
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'
  const textSize = size === 'sm' ? 'text-2xs' : 'text-xs'

  // Build tooltip
  const tooltipParts: string[] = [config.label]
  if (state === 'degraded' && 
      typeof nodeCount === 'number' && nodeCount >= 0 && 
      typeof readyNodes === 'number' && readyNodes >= 0) {
    tooltipParts.push(`${readyNodes}/${nodeCount} nodes ready`)
  }
  if (config.suggestion) {
    tooltipParts.push(`Suggestion: ${config.suggestion}`)
  }
  if (state.startsWith('unreachable') && lastSeen) {
    tooltipParts.push(`Last seen: ${formatLastSeen(lastSeen)}`)
  }
  const tooltip = tooltipParts.join('\n')

  // Dynamic label for degraded state with proper validation
  let displayLabel = config.label
  if (state === 'degraded' && 
      typeof nodeCount === 'number' && nodeCount >= 0 && 
      typeof readyNodes === 'number' && readyNodes >= 0) {
    displayLabel = `${readyNodes}/${nodeCount} ready`
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border font-medium',
        config.bgColor,
        config.color,
        config.borderColor,
        size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1',
        textSize,
        className
      )}
      title={tooltip}
      role="status"
      aria-label={`Cluster status: ${tooltip.replace(/\n/g, ', ')}`}
    >
      <Icon
        className={cn(iconSize, state === 'loading' && 'animate-spin')}
        aria-hidden="true"
      />
      {showLabel && <span>{displayLabel}</span>}
    </span>
  )
}

/**
 * Simple status dot for compact display
 */
export function ClusterStatusDot({
  state,
  className,
  size = 'sm',
}: {
  state: ClusterState
  className?: string
  size?: 'sm' | 'md'
}) {
  const config = STATE_CONFIGS[state]
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3'

  // Map to solid colors for the dot
  // Yellow = offline, Orange = degraded, Green = healthy
  const dotColors: Record<ClusterState, string> = {
    healthy: 'bg-green-500',
    degraded: 'bg-orange-500',
    loading: 'bg-blue-500',
    unknown: 'bg-muted-foreground',
    'unreachable-timeout': 'bg-yellow-500',
    'unreachable-auth': 'bg-yellow-500',
    'unreachable-network': 'bg-yellow-500',
    'unreachable-cert': 'bg-yellow-500',
    'unreachable-unknown': 'bg-yellow-500',
  }

  return (
    <span
      className={cn('rounded-full', dotColors[state], dotSize, className)}
      title={config.label}
      role="status"
      aria-label={`Cluster status: ${config.label}`}
    />
  )
}
