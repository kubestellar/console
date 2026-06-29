import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { useCachedKagentStatus, HEALTH_THRESHOLD_HEALTHY, HEALTH_THRESHOLD_WARNING } from '../../hooks/useCachedKagentStatus'
import { useCardLoadingState } from './CardDataContext'
import { Skeleton } from '../ui/Skeleton'

interface KagentAgentListCardProps {
  config?: {
    cluster?: string
  }
}

const FAILURE_THRESHOLD = 3
const SKELETON_AGENT_COUNT = 4

// Status icon component
function StatusIcon({ status }: { status: string }) {
  if (status === 'Ready') {
    return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
  }
  if (status === 'Pending' || status === 'Accepted') {
    return <Clock className="w-3.5 h-3.5 text-yellow-400" />
  }
  if (status === 'Failed') {
    return <XCircle className="w-3.5 h-3.5 text-red-400" />
  }
  return <Bot className="w-3.5 h-3.5 text-muted-foreground" />
}

// Health badge component
function HealthBadge({ percentage }: { percentage: number }) {
  const color =
    percentage >= HEALTH_THRESHOLD_HEALTHY
      ? 'bg-green-500/15 text-green-400 border-green-500/20'
      : percentage >= HEALTH_THRESHOLD_WARNING
        ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20'
        : 'bg-red-500/15 text-red-400 border-red-500/20'

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${color}`}>
      {percentage}% healthy
    </span>
  )
}

// Metric tile component
function MetricTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  accent: string
}) {
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

export function KagentAgentListCard({ config }: KagentAgentListCardProps) {
  const { t } = useTranslation('cards')
  const {
    data,
    isLoading,
    isRefreshing,
    isDemoFallback,
    consecutiveFailures,
  } = useCachedKagentStatus()

  const hasAnyData = data.totalAgents > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    hasAnyData,
    isFailed: consecutiveFailures >= FAILURE_THRESHOLD,
    consecutiveFailures,
    isDemoData: isDemoFallback,
  })

  // Filter clusters if config specifies one
  const filteredClusters = useMemo(() => {
    if (config?.cluster) {
      return data.clusters.filter(c => c.cluster === config.cluster)
    }
    return data.clusters
  }, [data.clusters, config?.cluster])

  // Compute aggregated stats
  const stats = useMemo(() => {
    const totalAgents = filteredClusters.reduce((sum, c) => sum + c.totalAgents, 0)
    const readyAgents = filteredClusters.reduce((sum, c) => sum + c.readyAgents, 0)
    const pendingAgents = filteredClusters.reduce((sum, c) => sum + c.pendingAgents, 0)
    const failedAgents = filteredClusters.reduce((sum, c) => sum + c.failedAgents, 0)
    const health = totalAgents > 0 ? Math.round((readyAgents / totalAgents) * 100) : 0

    return { totalAgents, readyAgents, pendingAgents, failedAgents, health }
  }, [filteredClusters])

  if (showSkeleton) {
    return (
      <div className="space-y-3 p-1">
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-16 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-24 rounded-lg" />
        <div className="space-y-1">
          {Array.from({ length: SKELETON_AGENT_COUNT }, (_, index) => (
            <Skeleton key={index} className="h-12 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Bot className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <div className="text-sm font-medium text-muted-foreground">{t('kagent.noAgents')}</div>
        <div className="text-xs text-muted-foreground mt-1 max-w-[200px]">
          {t('kagent.noAgentsDescription')}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 p-1">
      {/* Summary metrics */}
      <div className="grid grid-cols-3 gap-2">
        <MetricTile
          icon={Bot}
          label={t('kagent.totalAgents') || 'Total Agents'}
          value={stats.totalAgents}
          accent="bg-blue-500/20 text-blue-400"
        />
        <MetricTile
          icon={CheckCircle2}
          label={t('kagent.ready') || 'Ready'}
          value={stats.readyAgents}
          accent="bg-green-500/20 text-green-400"
        />
        <MetricTile
          icon={AlertTriangle}
          label={t('kagent.issues') || 'Issues'}
          value={stats.pendingAgents + stats.failedAgents}
          accent="bg-yellow-500/20 text-yellow-400"
        />
      </div>

      {/* Overall health */}
      <div className="px-1 flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {t('kagent.overallHealth') || 'Overall Health'}
        </div>
        <HealthBadge percentage={stats.health} />
      </div>

      {/* Cluster breakdown */}
      <div className="px-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
          {t('kagent.agentsByCluster') || 'Agents by Cluster'}
        </div>
        <div className="space-y-1">
          {filteredClusters.map(cluster => (
            <div
              key={cluster.cluster}
              className="px-2 py-1.5 rounded-lg bg-muted/20 border border-border/40"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium text-foreground">{cluster.cluster}</div>
                <HealthBadge percentage={cluster.healthPercentage} />
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                  {cluster.readyAgents} ready
                </span>
                {cluster.pendingAgents > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-yellow-400" />
                    {cluster.pendingAgents} pending
                  </span>
                )}
                {cluster.failedAgents > 0 && (
                  <span className="flex items-center gap-1">
                    <XCircle className="w-3 h-3 text-red-400" />
                    {cluster.failedAgents} failed
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agent list */}
      <div className="px-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
          {t('kagent.recentAgents') || 'Recent Agents'}
        </div>
        <div className="space-y-1">
          {filteredClusters.flatMap(cluster =>
            cluster.agents.slice(0, 3).map(agent => (
              <div
                key={`${agent.cluster}-${agent.namespace}-${agent.name}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors"
              >
                <StatusIcon status={agent.status} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{agent.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {agent.cluster} / {agent.namespace}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {agent.readyReplicas}/{agent.replicas}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
