import { useMemo } from 'react'
import { useEvents, useWarningEvents } from '../../../hooks/useMCP'
import { StatusIndicator } from '../../charts/StatusIndicator'

interface Props {
  data: Record<string, unknown>
}

export function EventsDrillDown({ data }: Props) {
  const cluster = data.cluster as string
  const namespace = data.namespace as string | undefined
  const objectName = data.objectName as string | undefined

  const { events, isLoading } = useEvents(cluster, namespace, 50)

  const filteredEvents = useMemo(() => {
    if (!objectName) return events
    return events.filter(e => e.object.includes(objectName))
  }, [events, objectName])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-2xl font-bold text-foreground">{filteredEvents.length}</div>
          <div className="text-sm text-muted-foreground">Total Events</div>
        </div>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-2xl font-bold text-yellow-400">
            {filteredEvents.filter(e => e.type === 'Warning').length}
          </div>
          <div className="text-sm text-muted-foreground">Warnings</div>
        </div>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-2xl font-bold text-green-400">
            {filteredEvents.filter(e => e.type === 'Normal').length}
          </div>
          <div className="text-sm text-muted-foreground">Normal</div>
        </div>
      </div>

      {/* Events List */}
      <div className="space-y-2">
        {filteredEvents.map((event, i) => (
          <div
            key={i}
            className={`p-4 rounded-lg border-l-4 ${
              event.type === 'Warning'
                ? 'bg-yellow-500/10 border-l-yellow-500'
                : 'bg-card/50 border-l-green-500'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <StatusIndicator status={event.type === 'Warning' ? 'warning' : 'healthy'} size="sm" />
                <span className="font-medium text-foreground">{event.reason}</span>
              </div>
              {event.count > 1 && (
                <span className="text-xs px-2 py-1 rounded bg-card text-muted-foreground">
                  x{event.count}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {event.namespace}/{event.object}
            </div>
            <p className="text-sm text-foreground mt-2">{event.message}</p>
            {event.lastSeen && (
              <div className="text-xs text-muted-foreground mt-2">
                Last seen: {new Date(event.lastSeen).toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredEvents.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No events found</p>
        </div>
      )}
    </div>
  )
}
