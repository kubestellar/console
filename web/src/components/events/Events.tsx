import { useState, useMemo, useEffect } from 'react'
import { useEvents, useWarningEvents, useClusters } from '../../hooks/useMCP'
import { StatusIndicator } from '../charts/StatusIndicator'

type EventFilter = 'all' | 'warning' | 'normal'

function getTimeAgo(timestamp: string | undefined): string {
  if (!timestamp) return 'Unknown'
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) return `${diffDays}d ago`
  if (diffHours > 0) return `${diffHours}h ago`
  if (diffMins > 0) return `${diffMins}m ago`
  return 'Just now'
}

function getEventIcon(type: string, reason: string): React.ReactNode {
  if (type === 'Warning') {
    return (
      <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    )
  }

  // Normal events
  if (reason === 'Scheduled' || reason === 'Created') {
    return (
      <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
    )
  }

  if (reason === 'Started' || reason === 'Pulled') {
    return (
      <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }

  if (reason === 'Killing' || reason === 'Deleted') {
    return (
      <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    )
  }

  return (
    <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

export function Events() {
  const { clusters } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>('')
  const [filter, setFilter] = useState<EventFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Get events based on filter
  const { events: allEvents, isLoading: loadingAll, refetch: refetchAll } = useEvents(selectedCluster || undefined)
  const { events: warningEvents, isLoading: loadingWarnings, refetch: refetchWarnings } = useWarningEvents(selectedCluster || undefined)

  const events = filter === 'warning' ? warningEvents : allEvents
  const isLoading = filter === 'warning' ? loadingWarnings : loadingAll

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      if (filter === 'warning') {
        refetchWarnings()
      } else {
        refetchAll()
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [autoRefresh, filter, refetchAll, refetchWarnings])

  // Filter events by search query
  const filteredEvents = useMemo(() => {
    if (!searchQuery) return events

    const query = searchQuery.toLowerCase()
    return events.filter(e =>
      e.reason.toLowerCase().includes(query) ||
      e.message.toLowerCase().includes(query) ||
      e.object.toLowerCase().includes(query) ||
      e.namespace.toLowerCase().includes(query)
    )
  }, [events, searchQuery])

  // Stats
  const stats = useMemo(() => ({
    total: allEvents.length,
    warnings: warningEvents.length,
    normal: allEvents.length - warningEvents.length,
  }), [allEvents, warningEvents])

  // Group events by time
  const groupedEvents = useMemo(() => {
    const groups: Record<string, typeof filteredEvents> = {
      'Last Hour': [],
      'Today': [],
      'Older': [],
    }

    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    filteredEvents.forEach(event => {
      const eventTime = event.lastSeen ? new Date(event.lastSeen) : new Date()

      if (eventTime >= oneHourAgo) {
        groups['Last Hour'].push(event)
      } else if (eventTime >= todayStart) {
        groups['Today'].push(event)
      } else {
        groups['Older'].push(event)
      }
    })

    return groups
  }, [filteredEvents])

  return (
    <div className="pt-16">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Events</h1>
        <p className="text-muted-foreground">Cluster events and activity</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-foreground">{stats.total}</div>
          <div className="text-sm text-muted-foreground">Total Events</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-yellow-400">{stats.warnings}</div>
          <div className="text-sm text-muted-foreground">Warnings</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-green-400">{stats.normal}</div>
          <div className="text-sm text-muted-foreground">Normal</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        {/* Cluster Selector */}
        <select
          value={selectedCluster}
          onChange={(e) => setSelectedCluster(e.target.value)}
          className="px-4 py-2 rounded-lg bg-card/50 border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All Clusters</option>
          {clusters.map((cluster) => (
            <option key={cluster.name} value={cluster.name}>
              {cluster.context || cluster.name.split('/').pop()}
            </option>
          ))}
        </select>

        {/* Event Type Filter */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('warning')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'warning'
                ? 'bg-yellow-500 text-white'
                : 'bg-card/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            Warnings Only
          </button>
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-card/50 border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Auto Refresh Toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded border-border"
          />
          <span className="text-sm text-muted-foreground">Auto-refresh</span>
        </label>
      </div>

      {/* Events List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No events found</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedEvents).map(([group, groupEvents]) => {
            if (groupEvents.length === 0) return null

            return (
              <div key={group}>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">{group} ({groupEvents.length})</h3>
                <div className="space-y-2">
                  {groupEvents.map((event, index) => (
                    <div
                      key={`${event.object}-${event.reason}-${index}`}
                      className={`glass p-4 rounded-lg border-l-4 ${
                        event.type === 'Warning'
                          ? 'border-l-yellow-500'
                          : 'border-l-green-500'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          {getEventIcon(event.type, event.reason)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                              event.type === 'Warning'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-green-500/20 text-green-400'
                            }`}>
                              {event.reason}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {event.namespace}/{event.object}
                            </span>
                            {event.count > 1 && (
                              <span className="text-xs px-2 py-0.5 rounded bg-card text-muted-foreground">
                                x{event.count}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-foreground mt-1 break-words">
                            {event.message}
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span>{getTimeAgo(event.lastSeen)}</span>
                            {event.cluster && (
                              <span>Cluster: {event.cluster.split('/').pop()}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
