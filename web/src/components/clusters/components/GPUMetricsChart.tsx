interface GPUMetricsChartProps {
  totalGPUs: number
  allocatedGPUs: number
  availableGPUs: number
  utilizationPercent: number
}

export function GPUMetricsChart({
  totalGPUs,
  allocatedGPUs,
  availableGPUs,
  utilizationPercent,
}: GPUMetricsChartProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="p-4 rounded-lg bg-secondary/50">
        <div className="text-xs text-muted-foreground mb-1">Total GPUs</div>
        <div className="text-2xl font-bold text-foreground">{totalGPUs}</div>
      </div>

      <div className="p-4 rounded-lg bg-secondary/50">
        <div className="text-xs text-muted-foreground mb-1">Allocated</div>
        <div className="text-2xl font-bold text-purple-400">{allocatedGPUs}</div>
      </div>

      <div className="p-4 rounded-lg bg-secondary/50">
        <div className="text-xs text-muted-foreground mb-1">Available</div>
        <div className="text-2xl font-bold text-green-400">{availableGPUs}</div>
      </div>

      <div className="p-4 rounded-lg bg-secondary/50">
        <div className="text-xs text-muted-foreground mb-1">Utilization</div>
        <div className="text-2xl font-bold text-blue-400">{utilizationPercent}%</div>
      </div>
    </div>
  )
}
