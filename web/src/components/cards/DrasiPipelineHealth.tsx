/**
 * DrasiPipelineHealth — Dashboard card showing aggregate Drasi pipeline health.
 *
 * Displays an overall health indicator plus per-pipeline breakdown with
 * source/query/reaction health ratios and uptime percentages.
 */

import { useMemo } from 'react'
import { AlertCircle, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { Skeleton } from '../ui/Skeleton'
import { useCardLoadingState } from './CardDataContext'
import { useCachedDrasiHealth } from '../../hooks/useCachedDrasiHealth'
import type { DrasiHealthLevel, DrasiPipelineHealthEntry } from '../../lib/demo/drasiHealth'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UPTIME_DECIMAL_PLACES = 1

const HEALTH_CONFIG: Record<DrasiHealthLevel, {
  label: string
  Icon: typeof CheckCircle
  textColor: string
  bgColor: string
  borderColor: string
}> = {
  healthy: {
    label: 'Healthy',
    Icon: CheckCircle,
    textColor: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
  },
  degraded: {
    label: 'Degraded',
    Icon: AlertTriangle,
    textColor: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/20',
  },
  down: {
    label: 'Down',
    Icon: XCircle,
    textColor: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function HealthRatio({ healthy, total, label }: { healthy: number; total: number; label: string }) {
  const pct = total > 0 ? (healthy / total) * 100 : 0
  const color = pct === 100 ? 'text-green-400' : pct > 0 ? 'text-yellow-400' : 'text-red-400'
  return (
    <div className="text-center">
      <p className="text-2xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium ${color}`} aria-label={`${healthy} of ${total} ${label} healthy`}>
        {healthy}/{total}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DrasiPipelineHealthProps {
  config?: Record<string, unknown>
}

export function DrasiPipelineHealth({ config: _config }: DrasiPipelineHealthProps) {
  const {
    data: healthData,
    isLoading,
    isRefreshing,
    isDemoData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
    refetch,
  } = useCachedDrasiHealth()

  const pipelines = useMemo(() => (healthData?.pipelines || []) as DrasiPipelineHealthEntry[], [healthData])
  const hasData = pipelines.length > 0

  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  })

  if (isLoading && !hasData) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <Skeleton variant="rounded" height={60} className="mb-3" />
        <div className="space-y-2">
          <Skeleton variant="rounded" height={48} />
          <Skeleton variant="rounded" height={48} />
          <Skeleton variant="rounded" height={48} />
        </div>
      </div>
    )
  }

  if (isFailed && !hasData) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card p-6">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <p className="text-sm text-muted-foreground mb-4">Failed to load pipeline health</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm"
          aria-label="Retry loading pipeline health"
        >
          Retry
        </button>
      </div>
    )
  }

  const overallHealth = healthData?.overallHealth ?? 'healthy'
  const overallCfg = HEALTH_CONFIG[overallHealth]
  const OverallIcon = overallCfg.Icon

  return (
    <div className="h-full flex flex-col min-h-card" role="region" aria-label="Drasi Pipeline Health">
      {/* Demo data notice */}
      {isDemoData && (
        <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-blue-400 font-medium">Demo Data</p>
            <p className="text-muted-foreground">
              Showing simulated health data. Connect a Drasi instance for live status.
            </p>
          </div>
        </div>
      )}

      {/* Overall health banner */}
      <div className={`p-3 rounded-lg ${overallCfg.bgColor} border ${overallCfg.borderColor} mb-3 flex items-center gap-3`}>
        <OverallIcon className={`w-8 h-8 ${overallCfg.textColor}`} />
        <div>
          <p className={`text-lg font-bold ${overallCfg.textColor}`}>{overallCfg.label}</p>
          <p className="text-xs text-muted-foreground">
            {pipelines.length} pipeline{pipelines.length !== 1 ? 's' : ''} ·{' '}
            {healthData?.healthySources ?? 0}/{healthData?.totalSources ?? 0} sources ·{' '}
            {healthData?.healthyQueries ?? 0}/{healthData?.totalQueries ?? 0} queries ·{' '}
            {healthData?.healthyReactions ?? 0}/{healthData?.totalReactions ?? 0} reactions
          </p>
        </div>
      </div>

      {/* Per-pipeline health */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {pipelines.map((pipeline) => {
          const cfg = HEALTH_CONFIG[pipeline.health]
          const PipelineIcon = cfg.Icon
          return (
            <div
              key={pipeline.pipelineName}
              className="p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <PipelineIcon className={`w-4 h-4 ${cfg.textColor}`} />
                  <span className="text-sm font-medium text-foreground truncate">{pipeline.pipelineName}</span>
                  <span className={`px-1.5 py-0.5 rounded text-2xs ${cfg.bgColor} ${cfg.textColor}`}>
                    {cfg.label}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {pipeline.uptimePct.toFixed(UPTIME_DECIMAL_PLACES)}% uptime
                </span>
              </div>
              <div className="flex items-center gap-4">
                <HealthRatio healthy={pipeline.sourcesHealthy} total={pipeline.sourcesTotal} label="Sources" />
                <HealthRatio healthy={pipeline.queriesHealthy} total={pipeline.queriesTotal} label="Queries" />
                <HealthRatio healthy={pipeline.reactionsHealthy} total={pipeline.reactionsTotal} label="Reactions" />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
