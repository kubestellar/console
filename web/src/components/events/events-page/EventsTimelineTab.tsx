import { Calendar, Clock } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { ClusterBadge } from '../../ui/ClusterBadge'
import type { ClusterEvent } from '../../../hooks/mcp/types'
import { getTimeAgo, MAX_PREVIEW_EVENTS } from './helpers'
import type { GroupedEvents, TimelineGroupKey, TranslateFn } from './types'

export interface EventsTimelineTabProps {
  t: TranslateFn
  filteredEvents: ClusterEvent[]
  groupedEvents: GroupedEvents
  onViewMore: (groupKey: TimelineGroupKey) => void
}

/** Timeline tab: events bucketed into "last hour" / "today" / "older" / "unknown time" groups. */
export function EventsTimelineTab({ t, filteredEvents, groupedEvents, onViewMore }: EventsTimelineTabProps) {
  return (
    <div className="space-y-6">
      <div className="glass p-6 rounded-lg">
        <h3 className="text-lg font-medium text-foreground mb-6 flex items-center gap-2"><Calendar className="w-5 h-5" />{t('events.sections.eventTimeline')}</h3>
        {(filteredEvents || []).length === 0 ? (
          <div className="text-center py-12"><Clock className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" /><p className="text-muted-foreground">{t('events.empty.noEventsToDisplay')}</p></div>
        ) : (
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
            {(Object.keys(groupedEvents) as TimelineGroupKey[]).map((groupKey) => {
              const groupEvents = groupedEvents[groupKey]
              if (groupEvents.length === 0) return null
              const groupLabel = t(`events.groups.${groupKey}`)
              return (
                <div key={groupKey} className="mb-8">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center z-10"><Clock className="w-4 h-4 text-purple-400" /></div>
                    <h4 className="text-sm font-medium text-foreground">{groupLabel}</h4>
                    <span className="text-xs text-muted-foreground">{t('events.groupCount', { count: groupEvents.length })}</span>
                  </div>
                  <div className="ml-12 space-y-3">
                    {groupEvents.slice(0, MAX_PREVIEW_EVENTS).map((event, i) => (
                      <div key={`${event.object}-${event.reason}-${i}`} className={cn('relative p-4 rounded-lg border-l-4', event.type === 'Warning' ? 'bg-yellow-500/5 border-l-yellow-500' : 'bg-green-500/5 border-l-green-500')}>
                        <div className={cn('absolute -left-8.5 top-5 w-2 h-2 rounded-full', event.type === 'Warning' ? 'bg-yellow-400' : 'bg-green-400')} />
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={cn('text-xs px-2 py-0.5 rounded font-medium', event.type === 'Warning' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400')}>{event.reason}</span>
                              <span className="text-sm font-medium text-foreground">{event.object}</span>
                              {event.count > 1 && <span className="text-xs px-1.5 py-0.5 rounded bg-card text-muted-foreground">{t('events.repeatCount', { count: event.count })}</span>}
                            </div>
                            <p className="text-sm text-muted-foreground">{event.message}</p>
                            <div className="flex items-center gap-3 mt-2">
                              <span className="text-xs text-muted-foreground">{event.namespace}</span>
                              {event.cluster && <ClusterBadge cluster={event.cluster.split('/').pop() || event.cluster} size="sm" />}
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{getTimeAgo(event.lastSeen, t)}</span>
                        </div>
                      </div>
                    ))}
                    {groupEvents.length > MAX_PREVIEW_EVENTS && (
                      <button
                        onClick={() => onViewMore(groupKey)}
                        className="text-sm text-purple-400 hover:text-purple-300 ml-4"
                      >
                        {t('events.viewMore', { count: groupEvents.length - MAX_PREVIEW_EVENTS })}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
