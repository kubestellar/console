import { cn } from '@/lib/cn'
import { CheckCircle, AlertTriangle, AlertCircle, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'

export type HealthStatus = 'healthy' | 'degraded' | 'critical' | 'offline'

interface HealthIndicator {
  status: HealthStatus
  message?: string
  clusterConnectivity?: {
    total: number
    connected: number
    offline: number
  }
}

interface DashboardGridProps {
  children: ReactNode
  className?: string
  cols?: 1 | 2 | 3 | 4 | 12
  health?: HealthIndicator
  showHealthIndicator?: boolean
}

const COLS_MAP = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'grid-cols-4',
  12: 'grid-cols-12',
} as const

const HEALTH_STATUS_CONFIGS = {
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
  critical: {
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    icon: AlertCircle,
    label: 'Critical',
  },
  offline: {
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    icon: WifiOff,
    label: 'Offline',
  },
} as const

export function DashboardGrid({
  children,
  className,
  cols = 2,
  health,
  showHealthIndicator = true,
}: DashboardGridProps) {
  const showHealth = health && showHealthIndicator && health.status !== 'healthy'
  const config = health ? HEALTH_STATUS_CONFIGS[health.status] : null
  const Icon = config?.icon

  return (
    <div className="space-y-3">
      {showHealth && config && Icon && (
        <div className="flex items-center justify-between gap-3">
          <div
            className={cn(
              'inline-flex items-center gap-2 rounded border px-2 py-1 text-xs font-medium',
              config.bgColor,
              config.color,
              config.borderColor
            )}
            role="status"
            aria-label={`Dashboard health: ${config.label}`}
          >
            <Icon className="h-3 w-3" aria-hidden="true" />
            <span>{health.message || config.label}</span>
          </div>

          {health.clusterConnectivity && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                Clusters: {health.clusterConnectivity.connected}/{health.clusterConnectivity.total}
              </span>
              {health.clusterConnectivity.offline > 0 && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs font-medium',
                    'bg-red-500/10 text-red-400 border border-red-500/30'
                  )}
                >
                  <WifiOff className="h-2 w-2" />
                  {health.clusterConnectivity.offline} offline
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div
        className={cn(
          'grid gap-4',
          COLS_MAP[cols],
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}
