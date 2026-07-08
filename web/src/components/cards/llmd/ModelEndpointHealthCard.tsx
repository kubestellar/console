import { useMemo } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Cpu, RefreshCw, XCircle } from 'lucide-react'
import { useCachedModelEndpointHealth, type ModelEndpointHealth } from '../../../hooks/useCachedModelEndpointHealth'
import { useCardLoadingState } from '../CardDataContext'
import { Skeleton } from '../../ui/Skeleton'
import { cn } from '../../../lib/cn'
import type { LLMdServer } from '../../../hooks/useLLMd'

interface ModelEndpointHealthCardProps {
  config?: {
    cluster?: string
    clusters?: string[]
  }
}

const VISIBLE_ENDPOINT_LIMIT = 5

const HEALTH_LABEL: Record<ModelEndpointHealth, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  unavailable: 'Unavailable',
}

const HEALTH_STYLE: Record<ModelEndpointHealth, string> = {
  healthy: 'bg-green-500/15 text-green-400 border-green-500/25',
  degraded: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  unavailable: 'bg-red-500/15 text-red-400 border-red-500/25',
}

const HEALTH_ICON = {
  healthy: CheckCircle2,
  degraded: AlertTriangle,
  unavailable: XCircle,
} satisfies Record<ModelEndpointHealth, typeof CheckCircle2>

const STATUS_DOT: Record<LLMdServer['status'], string> = {
  running: 'bg-green-400',
  scaling: 'bg-yellow-400',
  stopped: 'bg-red-400',
  error: 'bg-red-400',
}

function getClusters(config?: ModelEndpointHealthCardProps['config']) {
  if (config?.clusters?.length) return config.clusters
  if (config?.cluster) return [config.cluster]
  return undefined
}

function formatReplicaCount(endpoint: LLMdServer) {
  return `${endpoint.readyReplicas ?? 0}/${endpoint.replicas ?? 0}`
}

function formatGpu(endpoint: LLMdServer) {
  if (!endpoint.gpu && !endpoint.gpuCount) return endpoint.type
  return `${endpoint.gpu ?? 'GPU'}${endpoint.gpuCount ? ` x${endpoint.gpuCount}` : ''}`
}

export function ModelEndpointHealthCard({ config }: ModelEndpointHealthCardProps) {
  const clusters = getClusters(config)
  const {
    data,
    endpoints,
    summary,
    lastRefresh,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    refetch,
  } = useCachedModelEndpointHealth(clusters)

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && endpoints.length === 0,
    isRefreshing,
    hasAnyData: endpoints.length > 0,
    isFailed,
    consecutiveFailures,
    isDemoData: isDemoFallback,
  })

  const HealthIcon = HEALTH_ICON[summary.health]
  const sortedEndpoints = useMemo(() => {
    return [...endpoints].sort((a, b) => {
      const statusOrder: Record<LLMdServer['status'], number> = {
        error: 0,
        stopped: 1,
        scaling: 2,
        running: 3,
      }
      return (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4) || a.name.localeCompare(b.name)
    })
  }, [endpoints])
  const visibleEndpoints = sortedEndpoints.slice(0, VISIBLE_ENDPOINT_LIMIT)
  const checkTime = data.lastCheckTime || (lastRefresh ? new Date(lastRefresh).toISOString() : '')

  if (showSkeleton) {
    return (
      <div className="space-y-3 p-1">
        <Skeleton className="h-20 rounded-lg" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
        <Skeleton className="h-24 rounded-lg" />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Cpu className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <div className="text-sm font-medium text-muted-foreground">No model endpoints found</div>
        <div className="text-xs text-muted-foreground mt-1 max-w-[240px]">
          Model endpoint health will appear when llm-d serving components are discovered.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 p-1">
      <div className={cn('rounded-lg border p-3', HEALTH_STYLE[summary.health])}>
        <div className="flex items-center gap-2">
          <HealthIcon className="w-4 h-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold leading-tight">Model endpoint health</div>
            <div className="text-xs opacity-80">{HEALTH_LABEL[summary.health]}</div>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefreshing}
            className="p-1.5 rounded-md hover:bg-background/20 transition-colors disabled:opacity-60"
            title="Refresh model endpoint health"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-muted/30 border border-border/50 px-3 py-2">
          <div className="text-lg font-semibold leading-tight">{summary.readyEndpoints}</div>
          <div className="text-xs text-muted-foreground">Ready</div>
        </div>
        <div className="rounded-lg bg-muted/30 border border-border/50 px-3 py-2">
          <div className="text-lg font-semibold leading-tight">{summary.degradedEndpoints}</div>
          <div className="text-xs text-muted-foreground">Degraded</div>
        </div>
        <div className="rounded-lg bg-muted/30 border border-border/50 px-3 py-2">
          <div className="text-lg font-semibold leading-tight">
            {summary.totalReadyReplicas}/{summary.totalReplicas}
          </div>
          <div className="text-xs text-muted-foreground">Replicas</div>
        </div>
      </div>

      <div className="rounded-lg border border-border/50 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
          <Activity className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-xs font-medium text-muted-foreground">
            {summary.totalEndpoints} model endpoint{summary.totalEndpoints === 1 ? '' : 's'}
          </span>
          {isDemoFallback && (
            <span className="ml-auto text-2xs px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400">
              Demo
            </span>
          )}
        </div>
        <div className="divide-y divide-border/40">
          {visibleEndpoints.map((endpoint) => (
            <div key={endpoint.id} className="flex items-center gap-2 px-3 py-2">
              <div className={cn('w-2 h-2 rounded-full shrink-0', STATUS_DOT[endpoint.status])} />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-foreground truncate">{endpoint.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {endpoint.model} / {endpoint.cluster}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-muted-foreground" title="Ready replicas">
                  {formatReplicaCount(endpoint)}
                </div>
                <div className="text-2xs text-muted-foreground/80">{formatGpu(endpoint)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {checkTime && (
        <div className="text-2xs text-muted-foreground px-1">
          Last checked {new Date(checkTime).toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}

export default ModelEndpointHealthCard
