import { cn } from '../../../lib/cn'
import type { ConnectionEvent } from '../../../hooks/useLocalAgent'

interface ConnectionHealthBarProps {
  title: string
  noEventsLabel: string
  events: ConnectionEvent[]
  limit: number
}

export function ConnectionHealthBar({ title, noEventsLabel, events, limit }: ConnectionHealthBarProps) {
  return (
    <div className="p-2 max-h-48 overflow-y-auto">
      <div className="text-xs text-muted-foreground px-2 py-1 font-medium">{title}</div>
      {events.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-4">{noEventsLabel}</div>
      ) : (
        <div className="space-y-1">
          {events.slice(0, limit).map((event, i) => (
            <div
              key={i}
              className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-secondary/30"
            >
              <div
                className={cn(
                  'w-2 h-2 rounded-full mt-1 shrink-0',
                  event.type === 'connected'
                    ? 'bg-green-400'
                    : event.type === 'disconnected'
                      ? 'bg-red-400'
                      : event.type === 'error'
                        ? 'bg-red-400'
                        : 'bg-yellow-400',
                )}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground">{event.message}</p>
                <p className="text-2xs text-muted-foreground">{event.timestamp.toLocaleTimeString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
