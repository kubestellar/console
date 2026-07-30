import type { ClusterEvent } from '../../../hooks/mcp/types'

export type EventFilter = 'all' | 'warning' | 'normal'
export type ViewTab = 'overview' | 'timeline' | 'list'
// Timeline buckets. `unknownTime` captures events missing a lastSeen timestamp
// so they don't get falsely bucketed as recent (bug #9039).
export type TimelineGroupKey = 'lastHour' | 'today' | 'older' | 'unknownTime'

// Loose translator type for dynamic key lookup (group labels computed from a union).
// i18next's strict `TFunction` generics don't play well with `events.groups.${key}`
// concatenation, so we narrow to the runtime contract we actually rely on.
export type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

// Module-level cache for events stats (persists across navigation)
export interface EventsStatsCache {
  total: number
  warnings: number
  errors: number
  normal: number
  recentCount: number
}

export interface EventsChartDatum {
  [key: string]: string | number
  name: string
  value: number
  color: string
}

export interface EventsStats {
  total: number
  warnings: number
  errors: number
  normal: number
  recentCount: number
  topReasons: EventsChartDatum[]
  clusterData: EventsChartDatum[]
  hourlyData: EventsChartDatum[]
  typeChartData: EventsChartDatum[]
}

export type GroupedEvents = Record<TimelineGroupKey, ClusterEvent[]>
