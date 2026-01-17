import { useState, useMemo } from 'react'
import { Activity, AlertTriangle, Info, AlertCircle, RefreshCw, Clock } from 'lucide-react'
import { useClusters, useWarningEvents } from '../../hooks/useMCP'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'

interface NamespaceEventsProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

export function NamespaceEvents({ config }: NamespaceEventsProps) {
  const { clusters, isLoading: clustersLoading, refetch: refetchClusters } = useClusters()
  const { events: allEvents, isLoading: eventsLoading, refetch: refetchEvents } = useWarningEvents()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const [selectedNamespace, setSelectedNamespace] = useState<string>(config?.namespace || '')

  // Get unique namespaces from events
  const namespaces = useMemo(() => {
    const nsSet = new Set<string>()
    allEvents.forEach(e => e.namespace && nsSet.add(e.namespace))
    return Array.from(nsSet).sort()
  }, [allEvents])

  // Filter events by cluster and namespace
  const filteredEvents = useMemo(() => {
    let events = allEvents
    if (selectedCluster) {
      events = events.filter(e => e.cluster === selectedCluster)
    }
    if (selectedNamespace) {
      events = events.filter(e => e.namespace === selectedNamespace)
    }
    return events.slice(0, 10)
  }, [allEvents, selectedCluster, selectedNamespace])

  const isLoading = clustersLoading || eventsLoading

  const getEventIcon = (type: string) => {
    if (type === 'Warning') return AlertTriangle
    if (type === 'Error') return AlertCircle
    return Info
  }

  const getEventColor = (type: string) => {
    if (type === 'Warning') return 'orange'
    if (type === 'Error') return 'red'
    return 'blue'
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  }

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={140} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={32} className="mb-4" />
        <div className="space-y-2">
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-medium text-muted-foreground">Namespace Events</span>
          {filteredEvents.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
              {filteredEvents.length}
            </span>
          )}
        </div>
        <button
          onClick={() => { refetchClusters(); refetchEvents(); }}
          className="p-1 hover:bg-secondary rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Selectors */}
      <div className="flex gap-2 mb-4">
        <select
          value={selectedCluster}
          onChange={(e) => {
            setSelectedCluster(e.target.value)
            setSelectedNamespace('')
          }}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-white"
        >
          <option value="">All clusters</option>
          {clusters.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          value={selectedNamespace}
          onChange={(e) => setSelectedNamespace(e.target.value)}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-white"
        >
          <option value="">All namespaces</option>
          {namespaces.map(ns => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
        </select>
      </div>

      {/* Scope badge (if selected) */}
      {selectedCluster && (
        <div className="flex items-center gap-2 mb-4">
          <ClusterBadge cluster={selectedCluster} />
          {selectedNamespace && (
            <>
              <span className="text-muted-foreground">/</span>
              <span className="text-sm text-white">{selectedNamespace}</span>
            </>
          )}
        </div>
      )}

      {/* Events list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center mb-2">
              <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-white">No Warning Events</p>
            <p className="text-xs text-muted-foreground">All systems operating normally</p>
          </div>
        ) : (
          filteredEvents.map((event, idx) => {
            const Icon = getEventIcon(event.type)
            const color = getEventColor(event.type)

            return (
              <div
                key={idx}
                className={`p-3 rounded-lg bg-${color}-500/10 border border-${color}-500/20`}
              >
                <div className="flex items-start gap-2">
                  <Icon className={`w-4 h-4 text-${color}-400 mt-0.5 flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground">{event.namespace}</span>
                      <span className="text-xs text-muted-foreground">/</span>
                      <span className="text-sm text-white truncate">{event.object}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{event.message}</p>
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{event.lastSeen ? formatTime(event.lastSeen) : 'Unknown'}</span>
                      {event.count > 1 && (
                        <span className="ml-2">({event.count}x)</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
        Showing warning events{selectedNamespace ? ` in ${selectedNamespace}` : ''}
      </div>
    </div>
  )
}
