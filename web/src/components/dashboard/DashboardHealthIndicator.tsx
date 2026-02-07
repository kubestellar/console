import { CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDashboardHealth, type DashboardHealthStatus } from '../../hooks/useDashboardHealth'
import { cn } from '../../lib/cn'

interface StatusConfig {
  color: string
  bgColor: string
  borderColor: string
  icon: React.ComponentType<{ className?: string }>
}

const STATUS_CONFIGS: Record<DashboardHealthStatus, StatusConfig> = {
  healthy: {
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    icon: CheckCircle,
  },
  warning: {
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    icon: AlertTriangle,
  },
  critical: {
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    icon: AlertCircle,
  },
}

interface DashboardHealthIndicatorProps {
  className?: string
  showIcon?: boolean
  size?: 'sm' | 'md'
}

/**
 * Dashboard health indicator component
 * Shows aggregated health status with click-to-navigate behavior
 */
export function DashboardHealthIndicator({
  className,
  showIcon = true,
  size = 'sm',
}: DashboardHealthIndicatorProps) {
  const health = useDashboardHealth()
  const navigate = useNavigate()
  const config = STATUS_CONFIGS[health.status]
  const Icon = config.icon

  const handleClick = () => {
    if (health.navigateTo) {
      navigate(health.navigateTo)
    }
  }

  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs'
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1'

  // Build tooltip with detailed breakdown
  const tooltip = [health.message, ...health.details].join('\n')

  return (
    <button
      onClick={handleClick}
      disabled={!health.navigateTo}
      className={cn(
        'inline-flex items-center gap-1 rounded border font-medium transition-all',
        config.bgColor,
        config.color,
        config.borderColor,
        padding,
        textSize,
        health.navigateTo
          ? 'cursor-pointer hover:scale-105 hover:shadow-md'
          : 'cursor-default',
        className
      )}
      title={tooltip}
      aria-label={`System health status: ${health.message}`}
    >
      {showIcon && <Icon className={iconSize} />}
      <span>{health.message}</span>
    </button>
  )
}
