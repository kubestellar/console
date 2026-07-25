interface QuotaBarProps {
  used: number
  total: number
  label: string
}

export function QuotaBar({ used, total, label }: QuotaBarProps) {
  const percentage = total > 0 ? Math.round((used / total) * 100) : 0

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{used}/{total}</span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-purple-500 transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
