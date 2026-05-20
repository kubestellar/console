import { type ReactNode } from 'react'

export function MetricTile({ label, value, colorClass, icon }: {
  label: string
  value: number | string
  colorClass: string
  icon: ReactNode
}) {
  return (
    <div className="flex-1 p-3 rounded-lg bg-secondary/30 text-center">
      <div className="flex items-center justify-center gap-1.5 mb-1">{icon}</div>
      <span className={`text-2xl font-bold ${colorClass}`}>{value}</span>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}
