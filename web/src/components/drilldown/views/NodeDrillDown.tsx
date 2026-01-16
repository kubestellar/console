import { useDrillDownActions } from '../../../hooks/useDrillDown'

interface Props {
  data: Record<string, unknown>
}

export function NodeDrillDown({ data }: Props) {
  const cluster = data.cluster as string
  const nodeName = data.node as string
  const { drillToEvents } = useDrillDownActions()

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg bg-card/50 border border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">Node: {nodeName}</h3>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Cluster</dt>
            <dd className="font-mono text-foreground">{cluster.split('/').pop()}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Node Name</dt>
            <dd className="font-mono text-foreground break-all">{nodeName}</dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => drillToEvents(cluster, undefined, nodeName)}
          className="px-4 py-2 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card transition-colors"
        >
          View Node Events
        </button>
      </div>

      <div className="text-center py-12 text-muted-foreground">
        <p>Node metrics and details coming soon</p>
        <p className="text-xs mt-2">Connect to Prometheus/metrics-server for resource data</p>
      </div>
    </div>
  )
}
