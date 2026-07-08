import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { AlertCircle, RefreshCw, Terminal, Copy, CheckCircle, Server, Layers, ChevronLeft, ChevronRight, Search, Filter } from 'lucide-react'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { getDemoMode } from '../../../hooks/useDemoMode'
import { useDrillDownActions, useDrillDown } from '../../../hooks/useDrillDown'
import { useTranslation } from 'react-i18next'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants'
import { POLL_INTERVAL_MS, UI_FEEDBACK_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'
import { agentFetch } from '../../../hooks/mcp/shared'
import { copyToClipboard } from '../../../lib/clipboard'
import { cn } from '../../../lib/cn'

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

/** Events displayed per page. */
const PAGE_SIZE = 20

type TypeFilter = 'all' | 'Warning' | 'Normal'

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
  const { state, pop, close } = useDrillDown()
  const { drillToCluster, drillToNamespace } = useDrillDownActions()

  const [events, setEvents] = useState<ClusterEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Interactive controls
  const [currentPage, setCurrentPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

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

      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/events?${params}`, {
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (response.ok) {
        const data = await response.json()
        setEvents(data.events || [])
      } else {
        setError('Failed to fetch events')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events')
    } finally {
      setIsLoading(false)
    }
  }, [clusterShort, namespace, objectName])

  // Initial fetch and auto-refresh every 30 seconds
  useEffect(() => {
    refetch()
    refreshIntervalRef.current = setInterval(() => refetch(true), POLL_INTERVAL_MS)
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current)
    }
  }, [refetch])

  // Reset to page 1 when the viewed resource changes so stale page numbers
  // don't persist across drilldown navigations to different resources.
  useEffect(() => {
    setCurrentPage(1)
  }, [objectName, clusterShort, namespace])

  // Reset to page 1 when filters change so users always see results from the top.
  useEffect(() => {
    setCurrentPage(1)
  }, [typeFilter, searchQuery])

  // Full pre-paginated dataset: apply objectName, type, and search filters then sort.
  // Stat tiles read from this so they always reflect the complete matching set,
  // not just the items visible on the current page.
  const allFilteredSortedEvents = useMemo(() => {
    let result = events

    if (objectName) {
      result = result.filter(e => e.object.toLowerCase().includes(objectName.toLowerCase()))
    }
    if (typeFilter !== 'all') {
      result = result.filter(e => e.type === typeFilter)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(e =>
        e.reason.toLowerCase().includes(q) ||
        e.message.toLowerCase().includes(q) ||
        e.object.toLowerCase().includes(q)
      )
    }

    return [...result].sort((a, b) =>
      new Date(b.lastSeen || 0).getTime() - new Date(a.lastSeen || 0).getTime()
    )
  }, [events, objectName, typeFilter, searchQuery])

  // Paginated slice used only for rendering the event list
  const pagedEvents = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return allFilteredSortedEvents.slice(start, start + PAGE_SIZE)
  }, [allFilteredSortedEvents, currentPage])

  const totalPages = Math.max(1, Math.ceil(allFilteredSortedEvents.length / PAGE_SIZE))

  const warningCount = allFilteredSortedEvents.filter(e => e.type === 'Warning').length
  const normalCount = allFilteredSortedEvents.filter(e => e.type === 'Normal').length

  const hasActiveFilters = typeFilter !== 'all' || searchQuery !== ''

  const clearFilters = () => {
    setTypeFilter('all')
    setSearchQuery('')
  }

  const copyCommand = () => {
    const cmd = objectName
      ? `kubectl --context ${clusterShort} get events --field-selector involvedObject.name=${objectName}${namespace ? ` -n ${namespace}` : ''}`
      : `kubectl --context ${clusterShort} get events${namespace ? ` -n ${namespace}` : ' -A'} --sort-by=.lastTimestamp`
    copyToClipboard(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), UI_FEEDBACK_TIMEOUT_MS)
  }

  if (isLoading && events.length === 0 && !error) {
    return <EventsSkeleton />
  }

  // Show error state with retry and kubectl fallback
  if (error || (events.length === 0 && !isLoading)) {
    return (
      <div className="space-y-4">
        <div className="p-6 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
          <AlertCircle className="w-8 h-8 text-yellow-400 mx-auto mb-3" />
          <h4 className="font-medium text-yellow-400 mb-2">
            {error ? t('drilldown.events.failedToLoad', 'Failed to load events') : t('drilldown.events.noEventsFound', 'No events found')}
          </h4>
          <p className="text-sm text-muted-foreground mb-4">
            {error || `No events found for ${objectName || clusterShort}. Events may have expired or the cluster may be unreachable.`}
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => refetch?.()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border text-sm hover:bg-card/80 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              {t('common.retry', 'Retry')}
            </button>
          </div>
        </div>

        {/* Kubectl fallback */}
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            {t('drilldown.actions.getEvents', 'Get Events via kubectl')}
          </h4>
          <div className="flex items-center justify-between p-2 rounded bg-background/50 font-mono text-xs">
            <code className="text-muted-foreground truncate">
              kubectl --context {clusterShort} get events{objectName ? ` --field-selector involvedObject.name=${objectName}` : ''}{namespace ? ` -n ${namespace}` : ' -A'}
            </code>
            <button
              onClick={copyCommand}
              className="ml-2 p-1 hover:bg-card rounded shrink-0"
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
      {/* Contextual Navigation */}
      <div className="flex items-center gap-6 text-sm">
        <button onClick={() => state.stack.length > 1 ? pop() : close()} className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors min-h-11 min-w-11 px-2 py-2">
          <ChevronLeft className="w-4 h-4" />
          {t('drilldown.goBack', 'Back')}
        </button>
        {namespace && (
          <button
            onClick={() => drillToNamespace(cluster, namespace)}
            className="flex items-center gap-2 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
          >
            <Layers className="w-4 h-4 text-purple-400" />
            <span className="text-muted-foreground">{t('drilldown.fields.namespace')}</span>
            <span className="font-mono text-purple-400 group-hover:text-purple-300 transition-colors">{namespace}</span>
          </button>
        )}
        <button
          onClick={() => drillToCluster(cluster)}
          className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
        >
          <Server className="w-4 h-4 text-blue-400" />
          <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
          <ClusterBadge cluster={clusterShort} size="sm" />
        </button>
      </div>

      {/* Stats — computed from the full filtered set, not from the current page */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-2xl font-bold text-foreground">{allFilteredSortedEvents.length}</div>
          <div className="text-sm text-muted-foreground">{t('drilldown.events.totalEvents', 'Total Events')}</div>
        </div>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-2xl font-bold text-yellow-400">{warningCount}</div>
          <div className="text-sm text-muted-foreground">{t('common.warnings', 'Warnings')}</div>
        </div>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-2xl font-bold text-green-400">{normalCount}</div>
          <div className="text-sm text-muted-foreground">{t('common.normal')}</div>
        </div>
      </div>

      {/* Search and type filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder={t('common.search', 'Search')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card/50 border border-border rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/50"
            data-testid="events-search"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as TypeFilter)}
            className="bg-card/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/50"
            data-testid="events-type-filter"
          >
            <option value="all">{t('drilldown.events.allTypes', 'All Types')}</option>
            <option value="Warning">{t('common.warning', 'Warning')}</option>
            <option value="Normal">{t('common.normal', 'Normal')}</option>
          </select>
        </div>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            data-testid="events-clear-filters"
          >
            {t('common.clearFilters', 'Clear filters')}
          </button>
        )}
      </div>

      {/* Events List */}
      <div className="space-y-2">
        {pagedEvents.map((event, i) => (
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

      {/* Empty state when filters produce no results */}
      {allFilteredSortedEvents.length === 0 && (
        <div className="space-y-4">
          <div className="text-center py-6">
            {hasActiveFilters ? (
              <>
                <p className="text-muted-foreground">
                  {t('drilldown.events.noEventsMatchFilters', 'No events match the active filters.')}
                </p>
                <button
                  onClick={clearFilters}
                  className="mt-2 text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  {t('common.clearFilters', 'Clear filters')}
                </button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">{t('drilldown.events.noEventsFoundFor', { name: objectName || clusterShort, defaultValue: `No events found for ${objectName || clusterShort}` })}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('drilldown.events.eventsExpiredHint', 'Events may have expired or require authentication')}</p>
              </>
            )}
          </div>

          {/* Kubectl fallback — only shown when no active filters are hiding results */}
          {!hasActiveFilters && (
            <div className="p-4 rounded-lg bg-card/50 border border-border">
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                {t('drilldown.actions.getEvents', 'Get Events via kubectl')}
              </h4>
              <div className="flex items-center justify-between p-2 rounded bg-background/50 font-mono text-xs">
                <code className="text-muted-foreground truncate">
                  kubectl --context {clusterShort} get events{objectName ? ` --field-selector involvedObject.name=${objectName}` : ''}{namespace ? ` -n ${namespace}` : ' -A'} --sort-by=.lastTimestamp
                </code>
                <button
                  onClick={copyCommand}
                  className="ml-2 p-1 hover:bg-card rounded shrink-0"
                  title={t('drilldown.tooltips.copyCommand')}
                >
                  {copied ? <CheckCircle className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pagination controls — shown only when there is more than one page */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground border-t border-border">
          <span>
            {t('drilldown.events.showingRange', {
              from: (currentPage - 1) * PAGE_SIZE + 1,
              to: Math.min(currentPage * PAGE_SIZE, allFilteredSortedEvents.length),
              total: allFilteredSortedEvents.length,
              defaultValue: `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, allFilteredSortedEvents.length)} of ${allFilteredSortedEvents.length}`,
            })}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => p - 1)}
              disabled={currentPage === 1}
              aria-label={t('common.previousPage', 'Previous page')}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                currentPage === 1
                  ? 'text-muted-foreground/40 cursor-not-allowed'
                  : 'hover:bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 tabular-nums">
              {t('drilldown.events.pageOf', {
                page: currentPage,
                total: totalPages,
                defaultValue: `Page ${currentPage} of ${totalPages}`,
              })}
            </span>
            <button
              onClick={() => setCurrentPage(p => p + 1)}
              disabled={currentPage === totalPages}
              aria-label={t('common.nextPage', 'Next page')}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                currentPage === totalPages
                  ? 'text-muted-foreground/40 cursor-not-allowed'
                  : 'hover:bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
