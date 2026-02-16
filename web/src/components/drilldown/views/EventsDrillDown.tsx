import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { AlertCircle, RefreshCw, Terminal, Copy, CheckCircle } from 'lucide-react'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { getDemoMode } from '../../../hooks/useDemoMode'
import { useTranslation } from 'react-i18next'

interface ClusterEvent {
  type: string
  reason: string
  message: string
  object: string
  namespace: string
  cluster: string
  count: number
  age?: string
  firstSeen?: string
  lastSeen?: string
}

interface Props {
  data: Record<string, unknown>
}

// Skeleton component for loading state
function EventsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="p-4 rounded-lg bg-card/50 border border-border">
            <div className="h-8 w-16 bg-muted rounded mb-2" />
            <div className="h-4 w-24 bg-muted rounded" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="p-4 rounded-lg bg-card/50 border-l-4 border-l-muted">
            <div className="h-4 w-32 bg-muted rounded mb-2" />
            <div className="h-3 w-48 bg-muted rounded mb-2" />
            <div className="h-3 w-full bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function EventsDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string | undefined
  const objectName = data.objectName as string | undefined
  const clusterShort = cluster.split('/').pop() || cluster

  const [events, setEvents] = useState<ClusterEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Pagination constants (UI controls will be added in task #8)
  const currentPage = 1
  const pageSize = 20

  // Fetch events from local agent (no auth required)
  const refetch = useCallback(async (silent = false) => {
    // Skip agent requests in demo mode (no local agent on Netlify)
    if (getDemoMode()) {
      setIsLoading(false)
      return
    }
    if (!silent) setIsLoading(true)
    setError(null)
    try {
      // Use local agent - for node events, check default namespace with higher limit
      const params = new URLSearchParams()
      params.append('cluster', clusterShort)
      // For node events, use default namespace where node events are stored
      if (objectName && !namespace) {
        params.append('namespace', 'default')
      } else if (namespace) {
        params.append('namespace', namespace)
      }
      if (objectName) {
        params.append('object', objectName)
      }
      params.append('limit', '100')

      const response = await fetch(`http://127.0.0.1:8585/events?${params}`)
      if (response.ok) {
        const data = await response.json()
        setEvents(data.events || [])
      } else {
        setError('Failed to fetch events')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events')
    } finally {
      setIsLoading(false)
    }
  }, [clusterShort, namespace, objectName])

  // Initial fetch and auto-refresh every 30 seconds
  useEffect(() => {
    refetch()
    refreshIntervalRef.current = setInterval(() => refetch(true), 30000)
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current)
    }
  }, [refetch])

  // Filter by object name, sort by lastSeen, and paginate
  const { filteredEvents } = useMemo(() => {
    let result = events

    // Filter by object name if specified
    if (objectName) {
      result = result.filter(e => e.object.toLowerCase().includes(objectName.toLowerCase()))
    }

    // Sort by lastSeen (descending)
    result = [...result].sort((a, b) => {
      return new Date(b.lastSeen || 0).getTime() - new Date(a.lastSeen || 0).getTime()
    })

    // Paginate
    const start = (currentPage - 1) * pageSize
    result = result.slice(start, start + pageSize)

    return { filteredEvents: result }
  }, [events, objectName, currentPage])

  const copyCommand = () => {
    const cmd = objectName
      ? `kubectl --context ${clusterShort} get events --field-selector involvedObject.name=${objectName}${namespace ? ` -n ${namespace}` : ''}`
      : `kubectl --context ${clusterShort} get events${namespace ? ` -n ${namespace}` : ' -A'} --sort-by=.lastTimestamp`
    navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading) {
    return <EventsSkeleton />
  }

  // Show error state with retry and kubectl fallback
  if (error || (events.length === 0 && !isLoading)) {
    return (
      <div className="space-y-4">
        <div className="p-6 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
          <AlertCircle className="w-8 h-8 text-yellow-400 mx-auto mb-3" />
          <h4 className="font-medium text-yellow-400 mb-2">
            {error ? 'Failed to load events' : 'No events found'}
          </h4>
          <p className="text-sm text-muted-foreground mb-4">
            {error || `No events found for ${objectName || clusterShort}. Events may have expired or the cluster may be unreachable.`}
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => refetch?.()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border text-sm hover:bg-card/80 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        </div>

        {/* Kubectl fallback */}
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            Get Events via kubectl
          </h4>
          <div className="flex items-center justify-between p-2 rounded bg-background/50 font-mono text-xs">
            <code className="text-muted-foreground truncate">
              kubectl --context {clusterShort} get events{objectName ? ` --field-selector involvedObject.name=${objectName}` : ''}{namespace ? ` -n ${namespace}` : ' -A'}
            </code>
            <button
              onClick={copyCommand}
              className="ml-2 p-1 hover:bg-card rounded flex-shrink-0"
              title={t('drilldown.tooltips.copyCommand')}
            >
              {copied ? <CheckCircle className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
            </button>
          </div>
        </div>
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
          <div className="text-sm text-muted-foreground">{t('common.normal')}</div>
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
        <div className="space-y-4">
          <div className="text-center py-6">
            <p className="text-muted-foreground">No events found for {objectName || clusterShort}</p>
            <p className="text-xs text-muted-foreground mt-1">Events may have expired or require authentication</p>
          </div>

          {/* Kubectl fallback */}
          <div className="p-4 rounded-lg bg-card/50 border border-border">
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              Get Events via kubectl
            </h4>
            <div className="flex items-center justify-between p-2 rounded bg-background/50 font-mono text-xs">
              <code className="text-muted-foreground truncate">
                kubectl --context {clusterShort} get events{objectName ? ` --field-selector involvedObject.name=${objectName}` : ''}{namespace ? ` -n ${namespace}` : ' -A'} --sort-by=.lastTimestamp
              </code>
              <button
                onClick={copyCommand}
                className="ml-2 p-1 hover:bg-card rounded flex-shrink-0"
                title={t('drilldown.tooltips.copyCommand')}
              >
                {copied ? <CheckCircle className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
