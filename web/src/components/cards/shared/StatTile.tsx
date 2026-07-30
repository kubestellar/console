import React from 'react'

export function StatTile({
  icon,
  label,
  value,
  colorClass,
  borderClass,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  colorClass: string
  borderClass: string
}) {
  return (
    <div className={`p-3 rounded-lg bg-secondary/30 border ${borderClass}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className={`text-xs ${colorClass}`}>{label}</span>
      </div>
      <span className="text-2xl font-bold text-foreground">{value}</span>
    </div>
  )
}
