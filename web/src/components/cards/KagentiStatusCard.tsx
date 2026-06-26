import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Hammer, Wrench, Server } from 'lucide-react'
import { useKagentiAgents, useKagentiBuilds, useKagentiTools } from '../../hooks/useMCP'
import { useCardLoadingState } from './CardDataContext'
import { Skeleton } from '../ui/Skeleton'

interface KagentiStatusCardProps {
  config?: {
    cluster?: string
  }
}

const FAILURE_THRESHOLD = 3
const SKELETON_TILE_COUNT = 3
const MAX_RECENT_BUILDS = 5
const MAX_FRAMEWORKS = 4
const READY_AGENT_STATUSES = new Set(['Running', 'Ready'])
const ACTIVE_BUILD_STATUSES = new Set(['Building', 'Pending'])

// Status badge component
function StatusDot({ status }: { status: string }) {
  const color =
    status === 'Running' || status === 'Ready' || status === 'Succeeded' ? 'bg-green-400' :
    status === 'Building' || status === 'Pending' ? 'bg-yellow-400' :
    status === 'Failed' ? 'bg-red-400' : 'bg-gray-400'
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} />
}

// Metric tile.
// Semantic muted tint — adapts to both light and dark themes.
function MetricTile({ icon: Icon, label, value, sub, accent }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  sub?: string
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
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
    </div>
  )
}

export function KagentiStatusCard({ config }: KagentiStatusCardProps) {
  const { t } = useTranslation('cards')
  const {
    data: agents,
    isLoading: agentsLoading,
    isRefreshing: agentsRefreshing,
    isDemoFallback: agentDemo,
    consecutiveFailures: agentFailures } = useKagentiAgents({ cluster: config?.cluster })

  const {
    data: builds,
    isLoading: buildsLoading,
    isRefreshing: buildsRefreshing,
    isDemoFallback: buildDemo,
    consecutiveFailures: buildFailures } = useKagentiBuilds({ cluster: config?.cluster })

  const {
    data: tools,
    isLoading: toolsLoading,
    isRefreshing: toolsRefreshing,
    isDemoFallback: toolDemo,
    consecutiveFailures: toolFailures } = useKagentiTools({ cluster: config?.cluster })

  const agentItems = agents || []
  const buildItems = builds || []
  const toolItems = tools || []
  const isLoading = agentsLoading || buildsLoading || toolsLoading
  const isRefreshing = agentsRefreshing || buildsRefreshing || toolsRefreshing
  const hasAnyData = agentItems.length > 0 || buildItems.length > 0 || toolItems.length > 0
  const maxFailures = Math.max(agentFailures, buildFailures, toolFailures)

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    hasAnyData,
    isFailed: maxFailures >= FAILURE_THRESHOLD,
    consecutiveFailures: maxFailures,
    isDemoData: agentDemo || buildDemo || toolDemo })

  // Compute stats
  const stats = useMemo(() => {
    const readyAgents = agentItems.filter(a => READY_AGENT_STATUSES.has(a.status)).length
    const activeBuilds = buildItems.filter(b => ACTIVE_BUILD_STATUSES.has(b.status)).length

    // Framework distribution
    const frameworks: Record<string, number> = {}
    for (const a of agentItems) {
      if (a.framework) {
        frameworks[a.framework] = (frameworks[a.framework] || 0) + 1
      }
    }

    // Cluster distribution
    const clusterAgents: Record<string, { agents: number; tools: number }> = {}
    for (const a of agentItems) {
      if (!clusterAgents[a.cluster]) clusterAgents[a.cluster] = { agents: 0, tools: 0 }
      clusterAgents[a.cluster].agents++
    }
    for (const tool of toolItems) {
      if (!clusterAgents[tool.cluster]) clusterAgents[tool.cluster] = { agents: 0, tools: 0 }
      clusterAgents[tool.cluster].tools++
    }

    return { readyAgents, activeBuilds, frameworks, clusterAgents }
  }, [agentItems, buildItems, toolItems])

  // Recent builds for list view
  const recentBuilds = useMemo(() =>
    [...buildItems]
      .sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''))
      .slice(0, MAX_RECENT_BUILDS),
    [buildItems]
  )
  const maxFramework = useMemo(
    () => Object.entries(stats.frameworks).sort((a, b) => b[1] - a[1]),
    [stats.frameworks]
  )

  if (showSkeleton) {
    return (
      <div className="space-y-3 p-1">
        <div className="grid grid-cols-2 @md:grid-cols-3 gap-2">
          {Array.from({ length: SKELETON_TILE_COUNT }, (_, index) => (
            <Skeleton key={index} className="h-16 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Bot className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <div className="text-sm font-medium text-muted-foreground">{t('kagenti.kagentiEmptyTitle')}</div>
        <div className="text-xs text-muted-foreground mt-1 max-w-[200px]">
          {t('kagenti.kagentiEmptyDescription')}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 p-1">
      {/* Metric tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-3 gap-2">
        <MetricTile
          icon={Bot}
          label={t('kagenti.agents')}
          value={agentItems.length}
          sub={t('kagenti.readyCount', { count: stats.readyAgents })}
          accent="bg-purple-500/20 text-purple-400"
        />
        <MetricTile
          icon={Wrench}
          label={t('kagenti.mcpTools')}
          value={toolItems.length}
          accent="bg-cyan-500/20 text-cyan-400"
        />
        <MetricTile
          icon={Hammer}
          label={t('kagenti.builds')}
          value={buildItems.length}
          sub={stats.activeBuilds > 0 ? t('kagenti.activeCount', { count: stats.activeBuilds }) : undefined}
          accent="bg-blue-500/20 text-blue-400"
        />
      </div>

      {/* Framework distribution */}
      {maxFramework.length > 0 && (
        <div className="px-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{t('kagenti.frameworks')}</div>
          <div className="space-y-1">
            {maxFramework.slice(0, MAX_FRAMEWORKS).map(([fw, count]) => (
              <div key={fw} className="flex items-center gap-2">
                <div className="text-sm text-muted-foreground w-20 truncate">{fw}</div>
                {/* Semantic muted tint on progress track — adapts to both themes. */}
                <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-purple-500/60"
                    style={{ width: `${agentItems.length > 0 ? (count / agentItems.length) * 100 : 0}%` }}
                  />
                </div>
                <div className="text-sm text-muted-foreground w-6 text-right">{count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cluster breakdown */}
      {Object.keys(stats.clusterAgents).length > 0 && (
        <div className="px-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{t('kagenti.clusters')}</div>
          <div className="space-y-1">
            {Object.entries(stats.clusterAgents).map(([cluster, counts]) => (
              <div key={cluster} className="flex items-center gap-2 text-sm">
                <Server className="w-3.5 h-3.5 text-muted-foreground/40" />
                <span className="text-muted-foreground truncate flex-1">{cluster}</span>
                <span className="text-purple-400">{t('kagenti.agentCount', { count: counts.agents })}</span>
                <span className="text-cyan-400">{t('kagenti.toolCount', { count: counts.tools })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent builds */}
      {recentBuilds.length > 0 && (
        <div className="px-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{t('kagenti.recentBuilds')}</div>
          <div className="space-y-1">
            {recentBuilds.map(build => (
              <div key={`${build.cluster}-${build.namespace}-${build.name}`} className="flex items-center gap-2 text-sm">
                <StatusDot status={build.status} />
                <span className="truncate flex-1 text-muted-foreground">{build.name}</span>
                <span className="text-muted-foreground">{build.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
