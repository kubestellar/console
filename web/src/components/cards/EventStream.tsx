import { useState, useMemo } from 'react'
import { AlertTriangle, Info, XCircle, RefreshCw, ChevronRight } from 'lucide-react'
import { useEvents } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls, SortDirection } from '../ui/CardControls'

type SortByOption = 'time' | 'count' | 'type'

const SORT_OPTIONS = [
  { value: 'time' as const, label: 'Time' },
  { value: 'count' as const, label: 'Count' },
  { value: 'type' as const, label: 'Type' },
]

export function EventStream() {
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [sortBy, setSortBy] = useState<SortByOption>('time')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const effectiveLimit = limit === 'unlimited' ? 1000 : limit
  const { events: rawEvents, isLoading, error, refetch } = useEvents(undefined, undefined, effectiveLimit)
  const { filterByCluster } = useGlobalFilters()

  // Filter and sort events
  const events = useMemo(() => {
    const filtered = filterByCluster(rawEvents)
    const sorted = [...filtered].sort((a, b) => {
      let result = 0
      if (sortBy === 'count') result = b.count - a.count
      else if (sortBy === 'type') result = a.type.localeCompare(b.type)
      // 'time' - keep original order (already sorted by time desc)
      return sortDirection === 'asc' ? -result : result
    })
    return sorted
  }, [rawEvents, sortBy, sortDirection, filterByCluster])
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
      return { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10', tooltip: 'Warning event - Potential issue detected' }
    }
    if (type === 'Error') {
      return { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', tooltip: 'Error event - Action required' }
    }
    return { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10', tooltip: 'Informational event' }
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
        <span className="text-sm font-medium text-muted-foreground">Recent Events</span>
        <div className="flex items-center gap-2">
          <CardControls
            limit={limit}
            onLimitChange={setLimit}
            sortBy={sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
          />
          <button
            onClick={() => refetch()}
            className="p-1 hover:bg-secondary rounded transition-colors"
            title="Refresh events"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
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
                title={`Click to view details for ${event.object}`}
              >
                <div className={`p-1.5 rounded ${style.bg} flex-shrink-0`} title={style.tooltip}>
                  <EventIcon className={`w-3.5 h-3.5 ${style.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <ClusterBadge cluster={event.cluster || 'default'} />
                    <span className="text-xs text-muted-foreground truncate" title={`Namespace: ${event.namespace}`}>{event.namespace}</span>
                  </div>
                  <p className="text-sm text-white truncate" title={event.message}>{event.message}</p>
                  <p className="text-xs text-muted-foreground truncate" title={`Resource: ${event.object}`}>
                    {event.object}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {event.count > 1 && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground" title={`Event occurred ${event.count} times`}>
                      x{event.count}
                    </span>
                  )}
                  <span title="Click to view details"><ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" /></span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {error && (
        <div className="mt-2 text-xs text-yellow-400 flex items-center gap-1" title="Unable to fetch live event data - displaying sample data">
          <AlertTriangle className="w-3 h-3" />
          Using demo data
        </div>
      )}
    </div>
  )
}
