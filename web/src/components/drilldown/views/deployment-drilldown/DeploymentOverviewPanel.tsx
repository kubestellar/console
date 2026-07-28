import { Layers, Loader2, Minus, Plus, Tag } from 'lucide-react'
import { cn } from '../../../../lib/cn'
import { StatusIndicator } from '../../../charts/StatusIndicator'
import { Gauge } from '../../../charts/Gauge'
import { useTranslation } from 'react-i18next'
import { MAX_SCALE_REPLICAS } from './types'

export interface DeploymentOverviewPanelProps {
  isHealthy: boolean
  healthColors: { bg: string; border: string }
  liveReason?: string
  liveMessage?: string
  replicas: number
  readyReplicas: number
  canScale: boolean | null
  isScaling: boolean
  scaleError: string | null
  replicaSets: Array<{ name: string; replicas: number; ready: number }>
  labels: Record<string, string> | null
  onScaleDown: () => void
  onScaleUp: () => void
  onDrillToReplicaSet: (name: string) => void
}

export function DeploymentOverviewPanel({
  isHealthy,
  healthColors,
  liveReason,
  liveMessage,
  replicas,
  readyReplicas,
  canScale,
  isScaling,
  scaleError,
  replicaSets,
  labels,
  onScaleDown,
  onScaleUp,
  onDrillToReplicaSet,
}: DeploymentOverviewPanelProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div className={cn('p-4 rounded-lg border', healthColors.bg, healthColors.border)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusIndicator status={isHealthy ? 'healthy' : 'warning'} size="lg" />
            <div>
              <div className="text-lg font-semibold text-foreground">{isHealthy ? 'Healthy' : 'Degraded'}</div>
              {liveReason && <div className="text-sm text-muted-foreground">{liveReason}</div>}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Gauge
              value={replicas > 0 ? Math.round((readyReplicas / replicas) * 100) : 0}
              max={100}
              size="sm"
              invertColors
            />
            <div className="text-right">
              <div className="text-2xl font-bold text-foreground">{readyReplicas}/{replicas}</div>
              <div className="text-xs text-muted-foreground">{t('drilldown.fields.replicasReady')}</div>
            </div>
          </div>
        </div>
        {liveMessage && <div className="mt-3 p-2 rounded bg-card/50 text-sm text-muted-foreground">{liveMessage}</div>}
      </div>

      <div className="p-4 rounded-lg bg-card/50 border border-border">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-purple-400" />
          Scale Deployment
        </h3>
        {scaleError && (
          <div className="mb-3 p-2 rounded bg-red-500/20 border border-red-500/30 text-red-300 text-sm">{scaleError}</div>
        )}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={onScaleDown}
              disabled={!canScale || replicas <= 0 || isScaling}
              className={cn(
                'p-2 rounded-lg transition-colors',
                canScale && replicas > 0 && !isScaling
                  ? 'bg-secondary hover:bg-secondary/80 text-foreground'
                  : 'bg-secondary/30 text-muted-foreground cursor-not-allowed',
              )}
              title={
                canScale === false
                  ? 'No permission to scale deployments in this namespace'
                  : replicas <= 0
                  ? 'Already at minimum (0 replicas)'
                  : isScaling
                  ? 'Scaling in progress...'
                  : `Scale down to ${replicas - 1} replica${replicas - 1 !== 1 ? 's' : ''}`
              }
            >
              <Minus className="w-4 h-4" />
            </button>
            <div
              className={cn(
                'w-16 text-center py-2 rounded-lg bg-secondary border border-border text-foreground font-mono text-lg flex items-center justify-center',
                isScaling && 'opacity-70',
              )}
              title={`Current: ${replicas} replica${replicas !== 1 ? 's' : ''}`}
            >
              {isScaling ? <Loader2 className="w-5 h-5 animate-spin text-purple-400" /> : replicas}
            </div>
            <button
              onClick={onScaleUp}
              disabled={!canScale || replicas >= MAX_SCALE_REPLICAS || isScaling}
              className={cn(
                'p-2 rounded-lg transition-colors',
                canScale && replicas < MAX_SCALE_REPLICAS && !isScaling
                  ? 'bg-secondary hover:bg-secondary/80 text-foreground'
                  : 'bg-secondary/30 text-muted-foreground cursor-not-allowed',
              )}
              title={
                canScale === false
                  ? 'No permission to scale deployments in this namespace'
                  : replicas >= MAX_SCALE_REPLICAS
                  ? `Maximum is ${MAX_SCALE_REPLICAS} replicas`
                  : isScaling
                  ? 'Scaling in progress...'
                  : `Scale up to ${replicas + 1} replica${replicas + 1 !== 1 ? 's' : ''}`
              }
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 text-sm text-muted-foreground">
            {canScale === null ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Checking permissions...
              </span>
            ) : canScale === false ? (
              <span className="text-yellow-400">No permission to scale deployments in this namespace</span>
            ) : isScaling ? (
              <span className="text-purple-400 flex items-center gap-2">Scaling deployment...</span>
            ) : (
              <span>Click +/- to scale (0-{MAX_SCALE_REPLICAS} replicas)</span>
            )}
          </div>
        </div>
      </div>

      {replicaSets.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">{t('drilldown.fields.replicaSets')}</h3>
          <div className="space-y-2">
            {replicaSets.map(rs => (
              <button
                key={rs.name}
                onClick={() => onDrillToReplicaSet(rs.name)}
                className="w-full p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 flex items-center justify-between group transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                  </svg>
                  <span className="font-mono text-blue-400">{rs.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{rs.ready}/{rs.replicas} ready</span>
                  <svg className="w-4 h-4 text-blue-400/70 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {labels && Object.keys(labels).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <Tag className="w-4 h-4 text-blue-400" />
            Labels
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(labels).slice(0, 8).map(([key, value]) => (
              <span key={key} className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 font-mono">
                {key}={value}
              </span>
            ))}
            {Object.keys(labels).length > 8 && (
              <span className="text-xs text-muted-foreground">+{Object.keys(labels).length - 8} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
