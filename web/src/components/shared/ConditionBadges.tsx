import { cn } from '../../lib/cn'

export interface Condition {
  type: string
  status: string
  reason?: string
  message?: string
}

interface ConditionBadgesProps {
  conditions: Condition[]
  className?: string
}

/**
 * Displays Kubernetes resource conditions as colored badges.
 * Ready=True is green, pressure conditions with True are orange warnings,
 * and Ready=False or other issues are red.
 */
export function ConditionBadges({ conditions, className }: ConditionBadgesProps) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {conditions.map((cond, i) => (
        <span
          key={i}
          className={cn(
            'text-xs px-2 py-1 rounded',
            getConditionStyle(cond)
          )}
          title={cond.message || cond.reason}
        >
          {cond.type}: {cond.status}
        </span>
      ))}
    </div>
  )
}

/**
 * Get the appropriate style class for a condition badge
 */
export function getConditionStyle(condition: Condition): string {
  const { type, status } = condition

  if (type === 'Ready') {
    return status === 'True'
      ? 'bg-green-500/20 text-green-400'
      : 'bg-red-500/20 text-red-400'
  }

  // Pressure conditions (DiskPressure, MemoryPressure, PIDPressure, NetworkUnavailable)
  // These are bad when True
  if (status === 'True') {
    return 'bg-orange-500/20 text-orange-400'
  }

  return 'bg-secondary text-muted-foreground'
}

/**
 * Check if conditions indicate the resource has issues
 */
export function hasConditionIssues(conditions: Condition[]): boolean {
  return conditions.some(c =>
    (c.type === 'Ready' && c.status !== 'True') ||
    ((c.type === 'DiskPressure' || c.type === 'MemoryPressure' ||
      c.type === 'PIDPressure' || c.type === 'NetworkUnavailable') &&
      c.status === 'True')
  )
}

/**
 * Get a summary of issue conditions for display
 */
export function getConditionIssuesSummary(conditions: Condition[]): string {
  return conditions
    .filter(c =>
      (c.type === 'Ready' && c.status !== 'True') ||
      ((c.type === 'DiskPressure' || c.type === 'MemoryPressure' ||
        c.type === 'PIDPressure' || c.type === 'NetworkUnavailable') &&
        c.status === 'True')
    )
    .map(c => `${c.type}: ${c.status}${c.message ? ` - ${c.message}` : ''}`)
    .join(', ') || 'Unknown issues'
}
