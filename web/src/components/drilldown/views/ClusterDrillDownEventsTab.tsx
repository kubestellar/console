import { StatusIndicator } from '../../charts/StatusIndicator'

interface ClusterEvent {
  type: string
  reason: string
  count: number
  namespace: string
  object: string
  message: string
}

interface Props {
  clusterEvents: ClusterEvent[]
  eventsLoading: boolean
  effectiveClusterName: string
  drillToEvents: (cluster: string) => void
}

export function ClusterDrillDownEventsTab({ clusterEvents, eventsLoading, effectiveClusterName, drillToEvents }: Props) {
  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          onClick={() => drillToEvents(effectiveClusterName)}
          className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
        >
          View All →
        </button>
      </div>
      {eventsLoading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="p-3 rounded-lg bg-card/30 border border-border">
              <div className="h-4 w-32 bg-secondary rounded mb-2" />
              <div className="h-3 w-full bg-secondary/50 rounded" />
            </div>
          ))}
        </div>
      ) : clusterEvents.length === 0 ? (
        <div className="p-4 rounded-lg bg-card/30 border border-border text-center text-muted-foreground text-sm">
          No recent events
        </div>
      ) : (
        <div className="space-y-2">
          {clusterEvents.slice(0, 10).map((event, i) => (
            <div
              key={i}
              className={`p-3 rounded-lg border-l-4 cursor-pointer hover:bg-card/50 transition-colors ${
                event.type === 'Warning'
                  ? 'bg-yellow-500/10 border-l-yellow-500'
                  : 'bg-card/30 border-l-green-500'
              }`}
              onClick={() => drillToEvents(effectiveClusterName)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusIndicator status={event.type === 'Warning' ? 'warning' : 'healthy'} size="sm" />
                  <span className="font-medium text-foreground text-sm">{event.reason}</span>
                </div>
                {event.count > 1 && (
                  <span className="text-xs px-2 py-0.5 rounded bg-card text-muted-foreground">
                    x{event.count}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1 truncate">
                {event.namespace}/{event.object}
              </div>
              <p className="text-xs text-foreground mt-1 line-clamp-1">{event.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
