import { AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/cn'

interface LimitedAccessWarningProps {
  /** Show when there's an error (demo data mode) */
  hasError?: boolean
  /** Show when some clusters are unreachable */
  unreachableCount?: number
  /** Total cluster count for context */
  totalCount?: number
  /** Custom message */
  message?: string
  /** Size variant */
  size?: 'sm' | 'md'
  /** Additional className */
  className?: string
}

export function LimitedAccessWarning({
  hasError,
  unreachableCount = 0,
  totalCount,
  message,
  size = 'sm',
  className,
}: LimitedAccessWarningProps) {
  // Don't show if no conditions are met
  if (!hasError && unreachableCount === 0 && !message) {
    return null
  }

  const getText = () => {
    if (message) return message
    if (hasError) return 'Using demo data'
    if (unreachableCount > 0 && totalCount) {
      return `${unreachableCount} of ${totalCount} clusters offline`
    }
    if (unreachableCount > 0) {
      return `${unreachableCount} cluster${unreachableCount > 1 ? 's' : ''} offline`
    }
    return 'Limited access'
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1 text-yellow-400',
        size === 'sm' ? 'text-xs' : 'text-sm',
        className
      )}
      title="Some data may be incomplete or unavailable"
    >
      <AlertTriangle className={cn(size === 'sm' ? 'w-3 h-3' : 'w-4 h-4')} />
      <span>{getText()}</span>
    </div>
  )
}
