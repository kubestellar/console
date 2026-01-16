import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { Gauge } from '../../charts/Gauge'

interface Props {
  data: Record<string, unknown>
}

export function GPUNodeDrillDown({ data }: Props) {
  const cluster = data.cluster as string
  const nodeName = data.node as string
  const gpuType = data.gpuType as string
  const gpuCount = (data.gpuCount as number) || 0
  const gpuAllocated = (data.gpuAllocated as number) || 0
  const { drillToEvents } = useDrillDownActions()

  const utilizationPercent = gpuCount > 0 ? Math.round((gpuAllocated / gpuCount) * 100) : 0

  return (
    <div className="space-y-6">
      {/* GPU Status */}
      <div className="p-6 rounded-lg bg-card/50 border border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{gpuType}</h3>
            <p className="text-sm text-muted-foreground">{nodeName}</p>
          </div>
          <div className="flex items-center gap-6">
            <Gauge value={gpuAllocated} max={gpuCount} size="md" />
            <div className="text-right">
              <div className="text-3xl font-bold text-foreground">{gpuAllocated}/{gpuCount}</div>
              <div className="text-sm text-muted-foreground">GPUs Allocated</div>
              <div className={`text-sm ${utilizationPercent >= 90 ? 'text-red-400' : utilizationPercent >= 50 ? 'text-yellow-400' : 'text-green-400'}`}>
                {utilizationPercent}% utilization
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* GPU Details */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">Total GPUs</div>
          <div className="text-2xl font-bold text-foreground">{gpuCount}</div>
        </div>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">Allocated</div>
          <div className="text-2xl font-bold text-yellow-400">{gpuAllocated}</div>
        </div>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">Available</div>
          <div className="text-2xl font-bold text-green-400">{gpuCount - gpuAllocated}</div>
        </div>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">GPU Type</div>
          <div className="text-lg font-bold text-foreground truncate">{gpuType.split('-').slice(1, 2).join('')}</div>
        </div>
      </div>

      {/* Visual GPU Allocation */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">GPU Slots</h3>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: gpuCount }).map((_, i) => (
            <div
              key={i}
              className={`w-16 h-16 rounded-lg border-2 flex items-center justify-center text-xs font-medium ${
                i < gpuAllocated
                  ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                  : 'bg-green-500/10 border-green-500/30 text-green-400'
              }`}
            >
              GPU {i}
              <br />
              {i < gpuAllocated ? 'Used' : 'Free'}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => drillToEvents(cluster, undefined, nodeName)}
          className="px-4 py-2 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card transition-colors"
        >
          View Node Events
        </button>
      </div>

      {/* Details */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Node Details</h3>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Node Name</dt>
              <dd className="font-mono text-foreground break-all">{nodeName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cluster</dt>
              <dd className="font-mono text-foreground">{cluster.split('/').pop()}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">GPU Model</dt>
              <dd className="font-mono text-foreground">{gpuType}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Resource</dt>
              <dd className="font-mono text-foreground">nvidia.com/gpu</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
