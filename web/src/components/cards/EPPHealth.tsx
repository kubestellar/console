/**
 * EPPHealth — Dashboard card for llm-d EPP (Endpoint Picker Protocol) monitoring.
 *
 * Displays active instance count, request queue depth, request-routing latency
 * (p50 / p99), and error rate sourced from `useCachedEPPStatus`.
 *
 * Upstream issue: kubestellar/console#19913
 */

import { AlertCircle, Activity, Clock, Gauge, Zap } from 'lucide-react'
import { useCachedEPPStatus } from '../../hooks/useCachedEPPStatus'
import { useCardLoadingState } from './CardDataContext'
import { Skeleton } from '../ui/Skeleton'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKELETON_TILE_COUNT = 4

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface MetricTileProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  accent: string
}

function MetricTile({ icon: Icon, label, value, accent }: MetricTileProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/50">
      <div className={`p-1.5 rounded-md ${accent}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-semibold leading-tight">{value}</div>
        <div className="text-xs text-muted-foreground truncate">{label}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Internal card component
// ---------------------------------------------------------------------------

function EPPHealthInternal() {
  const {
    epps,
    summary,
    metrics,
    isLoading,
    isRefreshing,
    isDemoData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  } = useCachedEPPStatus()

  const hasAnyData = epps.length > 0 || isDemoData

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    hasAnyData,
    isDemoData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  })

  if (showSkeleton) {
    return (
      <div className="space-y-3 p-1">
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: SKELETON_TILE_COUNT }, (_, index) => (
            <Skeleton key={index} className="h-16 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-10 rounded-lg" />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Activity className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <div className="text-sm font-medium text-muted-foreground">No EPP instances detected</div>
        <div className="text-xs text-muted-foreground mt-1 max-w-[200px]">
          Deploy the llm-d Endpoint Picker to monitor routing health.
        </div>
      </div>
    )
  }

  const errorPct = (metrics.errorRate * 100).toFixed(2)
  const healthColor =
    summary.health === 'healthy'
      ? 'text-green-400'
      : summary.health === 'degraded'
        ? 'text-yellow-400'
        : 'text-red-400'

  return (
    <div className="space-y-3 p-1">
      {/* Demo badge */}
      {isDemoData && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-purple-400 font-medium">Demo data</p>
            <p className="text-muted-foreground">Connect a cluster with llm-d to see live EPP metrics.</p>
          </div>
        </div>
      )}

      {/* Health status */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/20 border border-border/30">
        <span className="text-xs text-muted-foreground">Overall health</span>
        <span className={`text-sm font-semibold capitalize ${healthColor}`}>{summary.health}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {summary.readyEPPs}/{summary.totalEPPs} ready
        </span>
      </div>

      {/* Metric tiles */}
      <div className="grid grid-cols-2 gap-2">
        <MetricTile
          icon={Zap}
          label="Active instances"
          value={String(metrics.instanceCount)}
          accent="bg-blue-500/20 text-blue-400"
        />
        <MetricTile
          icon={Gauge}
          label="Queue depth"
          value={String(metrics.queueDepth)}
          accent="bg-orange-500/20 text-orange-400"
        />
        <MetricTile
          icon={Clock}
          label="Latency p50"
          value={`${metrics.latencyP50Ms} ms`}
          accent="bg-cyan-500/20 text-cyan-400"
        />
        <MetricTile
          icon={Clock}
          label="Latency p99"
          value={`${metrics.latencyP99Ms} ms`}
          accent="bg-violet-500/20 text-violet-400"
        />
      </div>

      {/* Error rate */}
      <div className="px-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">Error rate</span>
          <span
            className={`text-sm font-semibold ${
              metrics.errorRate > 0.05 ? 'text-red-400' : metrics.errorRate > 0.01 ? 'text-yellow-400' : 'text-green-400'
            }`}
          >
            {errorPct}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              metrics.errorRate > 0.05 ? 'bg-red-500/70' : metrics.errorRate > 0.01 ? 'bg-yellow-500/70' : 'bg-green-500/70'
            }`}
            style={{ width: `${Math.min(100, metrics.errorRate * 100 * 10)}%` }}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

interface EPPHealthProps {
  config?: Record<string, unknown>
}

export function EPPHealth({ config: _config }: EPPHealthProps) {
  return <EPPHealthInternal />
}
