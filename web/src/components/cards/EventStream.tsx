import { AlertTriangle, Info, XCircle, RefreshCw, ChevronRight } from 'lucide-react'
import { useEvents } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { ClusterBadge } from '../ui/ClusterBadge'

export function EventStream() {
  const { events, isLoading, error, refetch } = useEvents(undefined, undefined, 10)
  const { drillToEvents, drillToPod, drillToDeployment } = useDrillDownActions()

  const handleEventClick = (event: typeof events[0]) => {
    // Parse object to get resource type and name
    const [resourceType, resourceName] = event.object.split('/')
    const cluster = event.cluster || 'default'

    if (resourceType.toLowerCase() === 'pod') {
      drillToPod(cluster, event.namespace, resourceName, { fromEvent: true })
    } else if (resourceType.toLowerCase() === 'deployment' || resourceType.toLowerCase() === 'replicaset') {
      drillToDeployment(cluster, event.namespace, resourceName, { fromEvent: true })
    } else {
      // Generic events view for other resources
      drillToEvents(cluster, event.namespace, event.object)
    }
  }

  const getEventStyle = (type: string) => {
    if (type === 'Warning') {
      return { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10' }
    }
    if (type === 'Error') {
      return { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' }
    }
    return { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10' }
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-muted-foreground">
          Recent Events
        </span>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-secondary rounded transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Event list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No recent events
          </div>
        ) : (
          events.map((event, idx) => {
            const style = getEventStyle(event.type)
            const EventIcon = style.icon

            return (
              <div
                key={`${event.object}-${idx}`}
                className="flex items-start gap-3 p-2 rounded-lg hover:bg-secondary/30 transition-colors cursor-pointer group"
                onClick={() => handleEventClick(event)}
              >
                <div className={`p-1.5 rounded ${style.bg} flex-shrink-0`}>
                  <EventIcon className={`w-3.5 h-3.5 ${style.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <ClusterBadge cluster={event.cluster || 'default'} />
                    <span className="text-xs text-muted-foreground truncate">{event.namespace}</span>
                  </div>
                  <p className="text-sm text-white truncate">{event.message}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {event.object}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {event.count > 1 && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                      x{event.count}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            )
          })
        )}
      </div>

      {error && (
        <div className="mt-2 text-xs text-yellow-400 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Using demo data
        </div>
      )}
    </div>
  )
}
