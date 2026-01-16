import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { Gauge } from '../../charts/Gauge'

interface Props {
  data: Record<string, unknown>
}

export function DeploymentDrillDown({ data }: Props) {
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const deployment = data.deployment as string
  const { drillToEvents } = useDrillDownActions()

  const replicas = (data.replicas as number) || 0
  const readyReplicas = (data.readyReplicas as number) || 0
  const reason = data.reason as string
  const message = data.message as string

  const isHealthy = readyReplicas === replicas && replicas > 0

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className={`p-4 rounded-lg border ${isHealthy ? 'bg-green-500/10 border-green-500/20' : 'bg-orange-500/10 border-orange-500/20'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusIndicator status={isHealthy ? 'healthy' : 'warning'} size="lg" />
            <div>
              <div className="text-lg font-semibold text-foreground">
                {isHealthy ? 'Healthy' : 'Degraded'}
              </div>
              {reason && <div className="text-sm text-muted-foreground">{reason}</div>}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Gauge value={readyReplicas} max={replicas} size={60} color={isHealthy ? '#22c55e' : '#f59e0b'} />
            <div className="text-right">
              <div className="text-2xl font-bold text-foreground">{readyReplicas}/{replicas}</div>
              <div className="text-xs text-muted-foreground">Replicas Ready</div>
            </div>
          </div>
        </div>
        {message && (
          <div className="mt-3 p-2 rounded bg-card/50 text-sm text-muted-foreground">{message}</div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => drillToEvents(cluster, namespace, deployment)}
          className="px-4 py-2 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card transition-colors"
        >
          View Events
        </button>
      </div>

      {/* Details */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Details</h3>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Deployment</dt>
              <dd className="font-mono text-foreground">{deployment}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Namespace</dt>
              <dd className="font-mono text-foreground">{namespace}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Desired Replicas</dt>
              <dd className="font-mono text-foreground">{replicas}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ready Replicas</dt>
              <dd className="font-mono text-foreground">{readyReplicas}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
