import { cn } from '../../lib/cn'

interface MissionStatusBadgeProps {
  label: string
  color: string
  bg: string
}

export function MissionStatusBadge({ label, color, bg }: MissionStatusBadgeProps) {
  return (
    <span className={cn('text-2xs px-1.5 py-0.5 rounded font-medium', bg, color)}>
      {label}
    </span>
  )
}
