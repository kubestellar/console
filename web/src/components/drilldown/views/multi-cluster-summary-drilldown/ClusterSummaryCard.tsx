import type { LucideIcon } from 'lucide-react'
import { CheckCircle, AlertTriangle, WifiOff } from 'lucide-react'
import { cn } from '@/lib/cn'

type HealthStatus = 'healthy' | 'degraded' | 'offline'

const HEALTH_CONFIG = {
  healthy: { icon: CheckCircle, color: 'text-green-400' },
  degraded: { icon: AlertTriangle, color: 'text-yellow-400' },
  offline: { icon: WifiOff, color: 'text-red-400' },
} as const

interface ClusterSummaryCardProps {
  icon: LucideIcon
  iconClassName: string
  label: string
  value: number
  valueClassName?: string
  healthStatus?: HealthStatus
}

export function ClusterSummaryCard({
  icon: Icon,
  iconClassName,
  label,
  value,
  valueClassName,
  healthStatus,
}: ClusterSummaryCardProps) {
  const healthConfig = healthStatus ? HEALTH_CONFIG[healthStatus] : null
  const HealthIcon = healthConfig?.icon

  return (
    <div className="glass rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={cn('w-5 h-5', iconClassName)} />
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        {HealthIcon && (
          <HealthIcon
            className={cn('w-4 h-4', healthConfig?.color)}
            aria-label={`Status: ${healthStatus}`}
          />
        )}
      </div>
      <div className={cn('text-2xl font-bold', valueClassName)}>{value}</div>
    </div>
  )
}
