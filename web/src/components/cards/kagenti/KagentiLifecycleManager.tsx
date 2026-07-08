import { useMemo } from 'react'
import {
  Activity, ArrowRight, Bot, Hammer,
  Server,
} from 'lucide-react'
import { useKagentiAgents, useKagentiBuilds } from '../../../hooks/useMCP'
import { useCardLoadingState } from '../CardDataContext'
import { DynamicCardErrorBoundary } from '../DynamicCardErrorBoundary'
import { Skeleton } from '../../ui/Skeleton'
import { formatTimeAgo } from '../../../lib/formatters'

interface KagentiLifecycleManagerProps {
  config?: { cluster?: string }
}

const AGENT_LIFECYCLE_STATES = ['Deploying', 'Ready', 'Failed', 'Unknown'] as const
const BUILD_LIFECYCLE_STATES = ['Pending', 'Building', 'Succeeded', 'Failed'] as const

const CONSECUTIVE_FAILURE_THRESHOLD = 3
const MAX_RECENT_EVENTS = 10

const AGENT_STATE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Deploying: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  Ready: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
  Failed: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  Unknown: { bg: 'bg-gray-500/10 dark:bg-gray-400/10', text: 'text-gray-400 dark:text-gray-300', border: 'border-gray-500/30 dark:border-gray-400/30' },
}

const BUILD_STATE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Pending: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  Building: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  Succeeded: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
  Failed: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
}

interface LifecycleEvent {
  name: string
  cluster: string
  type: 'agent' | 'build'
  status: string
  timestamp: string
  detail: string
}

function StatusDot({ color }: { color: string }) {
  return <div className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
}

function LifecycleSummaryBar({
  label,
  icon: Icon,
  states,
  counts,
  colorMap,
}: {
  label: string
  icon: typeof Bot
  states: readonly string[]
  counts: Record<string, number>
  colorMap: Record<string, { bg: string; text: string; border: string }>
}) {
  const total = Object.values(counts).reduce((s, c) => s + c, 0)
  if (total === 0) return null

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="w-3 h-3" />
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground/40">({total})</span>
      </div>
      <div className="flex items-center gap-1">
        {states.map((state, idx) => {
          const colors = colorMap[state] || colorMap.Unknown || { bg: 'bg-gray-500/10 dark:bg-gray-400/10', text: 'text-gray-400 dark:text-gray-300', border: 'border-gray-500/30 dark:border-gray-400/30' }
          const count = counts[state] || 0
          return (
            <div key={state} className="contents">
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs border ${
                  count > 0 ? `${colors.bg} ${colors.text} ${colors.border}` : 'bg-secondary/20 text-muted-foreground/30 border-border/20'
                }`}
                role="status"
                aria-label={`${state}: ${count}`}
              >
                <span className="font-medium">{count}</span>
                <span className="hidden sm:inline">{state}</span>
              </div>
              {idx < states.length - 1 && (
                <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/20 shrink-0" aria-hidden />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function KagentiLifecycleManagerInternal({ config }: KagentiLifecycleManagerProps) {
  const {
    data: agents,
    isLoading: agentsLoading,
    isRefreshing: agentsRefreshing,
    isDemoFallback: agentsDemoFallback,
    consecutiveFailures: agentsFailures,
  } = useKagentiAgents({ cluster: config?.cluster })

  const {
    data: builds,
    isLoading: buildsLoading,
    isRefreshing: buildsRefreshing,
    isDemoFallback: buildsDemoFallback,
    consecutiveFailures: buildsFailures,
  } = useKagentiBuilds({ cluster: config?.cluster })

  const isLoading = agentsLoading && buildsLoading
  const isRefreshing = agentsRefreshing || buildsRefreshing
  const isDemoData = agentsDemoFallback || buildsDemoFallback
  const hasAnyData = agents.length > 0 || builds.length > 0
  const maxFailures = Math.max(agentsFailures, buildsFailures)

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    hasAnyData,
    isFailed: maxFailures >= CONSECUTIVE_FAILURE_THRESHOLD,
    consecutiveFailures: maxFailures,
    isDemoData,
  })

  const agentCounts = useMemo(() => {
    const counts: Record<string, number> = { Deploying: 0, Ready: 0, Failed: 0, Unknown: 0 }
    for (const agent of agents || []) {
      const state = agent.status || 'Unknown'
      if (state in counts) {
        counts[state]++
      } else {
        counts.Unknown++
      }
    }
    return counts
  }, [agents])

  const buildCounts = useMemo(() => {
    const counts: Record<string, number> = { Pending: 0, Building: 0, Succeeded: 0, Failed: 0 }
    for (const build of builds || []) {
      const state = build.status || 'Pending'
      if (state in counts) {
        counts[state]++
      }
    }
    return counts
  }, [builds])

  const recentEvents = useMemo<LifecycleEvent[]>(() => {
    const events: LifecycleEvent[] = []

    for (const agent of agents || []) {
      events.push({
        name: agent.name,
        cluster: agent.cluster,
        type: 'agent',
        status: agent.status,
        timestamp: agent.createdAt || '',
        detail: `${agent.framework || 'generic'} / ${agent.protocol || 'a2a'}`,
      })
    }

    for (const build of builds || []) {
      events.push({
        name: build.name,
        cluster: build.cluster,
        type: 'build',
        status: build.status,
        timestamp: build.startTime || build.completionTime || '',
        detail: build.mode || 'dev',
      })
    }

    return events
      .filter(e => e.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, MAX_RECENT_EVENTS)
  }, [agents, builds])

  if (showSkeleton) {
    return (
      <div className="space-y-3 p-1">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 rounded-lg" />)}
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Activity className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <div className="text-sm font-medium text-muted-foreground">No Kagenti Resources</div>
        <div className="text-xs text-muted-foreground/60 mt-1">Deploy kagenti agents and builds to track lifecycle</div>
      </div>
    )
  }

  return (
    <div className="space-y-3 p-1">
      {/* Lifecycle state bars */}
      <div className="space-y-3 p-2 rounded-lg bg-secondary/20">
        <LifecycleSummaryBar
          label="Agents"
          icon={Bot}
          states={AGENT_LIFECYCLE_STATES}
          counts={agentCounts}
          colorMap={AGENT_STATE_COLORS}
        />
        <LifecycleSummaryBar
          label="Builds"
          icon={Hammer}
          states={BUILD_LIFECYCLE_STATES}
          counts={buildCounts}
          colorMap={BUILD_STATE_COLORS}
        />
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded-lg bg-secondary/20">
          <div className="text-lg font-bold">{agents.length}</div>
          <div className="text-2xs text-muted-foreground">Agents</div>
        </div>
        <div className="p-2 rounded-lg bg-secondary/20">
          <div className="text-lg font-bold">{builds.length}</div>
          <div className="text-2xs text-muted-foreground">Builds</div>
        </div>
        <div className="p-2 rounded-lg bg-secondary/20">
          <div className="text-lg font-bold">
            {agents.length > 0
              ? `${Math.round((agentCounts.Ready / agents.length) * 100)}%`
              : '—'}
          </div>
          <div className="text-2xs text-muted-foreground">Ready</div>
        </div>
      </div>

      {/* Recent lifecycle events timeline */}
      {recentEvents.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground px-1">Recent Activity</div>
          {recentEvents.map((event, idx) => {
            const colorMap = event.type === 'agent' ? AGENT_STATE_COLORS : BUILD_STATE_COLORS
            const colors = colorMap[event.status] || { bg: 'bg-gray-500/10 dark:bg-gray-400/10', text: 'text-gray-400 dark:text-gray-300', border: 'border-gray-500/30 dark:border-gray-400/30' }
            const Icon = event.type === 'agent' ? Bot : Hammer
            return (
              <div
                key={`${event.type}-${event.cluster}-${event.name}-${idx}`}
                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-secondary/40 transition-colors"
              >
                <div className="flex flex-col items-center gap-0.5 w-4 shrink-0">
                  <StatusDot color={colors.text.replace('text-', 'bg-')} />
                  {idx < recentEvents.length - 1 && (
                    <div className="w-px h-3 bg-border/30" />
                  )}
                </div>
                <Icon className={`w-3 h-3 shrink-0 ${colors.text}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{event.name}</div>
                  <div className="text-2xs text-muted-foreground/50 flex items-center gap-1">
                    <Server className="w-2 h-2" />
                    {event.cluster}
                    <span className="text-muted-foreground/30">·</span>
                    {event.detail}
                  </div>
                </div>
                <span className={`px-1 py-0.5 text-2xs rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
                  {event.status}
                </span>
                <span className="text-2xs text-muted-foreground/40 shrink-0">
                  {event.timestamp ? formatTimeAgo(event.timestamp) : '—'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function KagentiLifecycleManager(props: KagentiLifecycleManagerProps) {
  return (
    <DynamicCardErrorBoundary cardId="KagentiLifecycleManager">
      <KagentiLifecycleManagerInternal {...props} />
    </DynamicCardErrorBoundary>
  )
}
