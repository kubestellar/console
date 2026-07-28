import { StatusBadge } from '../ui/StatusBadge'

interface MissionsStatusBadgeProps {
  activeCount: number
}

export function MissionsStatusBadge({ activeCount }: MissionsStatusBadgeProps) {
  if (activeCount > 0) {
    return (
      <StatusBadge color="blue" size="xs">
        {activeCount} active
      </StatusBadge>
    )
  }

  return <span className="text-2xs text-muted-foreground">No active</span>
}
