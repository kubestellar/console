interface GPUSpec {
  name: string
  value: string | number
}

interface GPUSpecsPanelProps {
  gpuType: string
  specs: GPUSpec[]
}

export function GPUSpecsPanel({ gpuType, specs }: GPUSpecsPanelProps) {
  return (
    <div className="p-4 rounded-lg border border-border bg-secondary/20">
      <h3 className="font-medium text-foreground mb-3">{gpuType} Specifications</h3>
      <div className="grid grid-cols-2 gap-3">
        {specs.map((spec) => (
          <div key={spec.name}>
            <div className="text-xs text-muted-foreground">{spec.name}</div>
            <div className="text-sm font-medium text-foreground">{spec.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
