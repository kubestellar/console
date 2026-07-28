import type { LucideIcon } from 'lucide-react'

interface ClusterSummaryCardProps {
  icon: LucideIcon
  iconClassName: string
  label: string
  value: number
  valueClassName?: string
}

export function ClusterSummaryCard({
  icon: Icon,
  iconClassName,
  label,
  value,
  valueClassName,
}: ClusterSummaryCardProps) {
  return (
    <div className="glass rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-5 h-5 ${iconClassName}`} />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${valueClassName || ''}`}>{value}</div>
    </div>
  )
}
