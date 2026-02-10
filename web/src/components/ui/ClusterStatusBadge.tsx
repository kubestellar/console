import {
  CheckCircle,
  AlertTriangle,
  WifiOff,
  Lock,
  XCircle,
  ShieldAlert,
  AlertCircle,
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
 * Determine cluster state based on health data
 */
export function getClusterState(
  healthy: boolean | undefined,
  reachable?: boolean,
  nodeCount?: number,
  readyNodes?: number,
  errorType?: ClusterErrorType
): ClusterState {
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
  if (healthy) {
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

  // Not healthy but reachable - degraded
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
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs'

  // Build tooltip
  const tooltipParts: string[] = [config.label]
  if (state === 'degraded' && nodeCount !== undefined && readyNodes !== undefined) {
    tooltipParts.push(`${readyNodes}/${nodeCount} nodes ready`)
  }
  if (config.suggestion) {
    tooltipParts.push(`Suggestion: ${config.suggestion}`)
  }
  if (state.startsWith('unreachable') && lastSeen) {
    tooltipParts.push(`Last seen: ${formatLastSeen(lastSeen)}`)
  }
  const tooltip = tooltipParts.join('\n')

  // Dynamic label for degraded state
  let displayLabel = config.label
  if (state === 'degraded' && nodeCount !== undefined && readyNodes !== undefined) {
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
    >
      <Icon className={iconSize} />
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
    />
  )
}
