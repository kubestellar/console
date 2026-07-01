/**
 * DrasiTopology — Dashboard card showing source→query→reaction topology.
 *
 * Displays a summary of the connection topology across all Drasi pipelines,
 * grouped by node type (sources, queries, reactions) with status indicators
 * and connection counts.
 */

import { useMemo } from 'react'
import {
  AlertCircle,
  Database,
  Search,
  Zap,
  ArrowRight,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react'
import { Skeleton } from '../ui/Skeleton'
import { useCardLoadingState } from './CardDataContext'
import { useCachedDrasiTopology } from '../../hooks/useCachedDrasiTopology'
import type { DrasiNodeStatus, DrasiTopologyNode } from '../../lib/demo/drasiTopology'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_TYPE_CONFIG = {
  source: { label: 'Sources', Icon: Database, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  query: { label: 'Queries', Icon: Search, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  reaction: { label: 'Reactions', Icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
} as const

const STATUS_ICONS: Record<DrasiNodeStatus, { Icon: typeof CheckCircle; color: string; label: string }> = {
  ready: { Icon: CheckCircle, color: 'text-green-400', label: 'Ready' },
  error: { Icon: XCircle, color: 'text-red-400', label: 'Error' },
  pending: { Icon: Clock, color: 'text-yellow-400', label: 'Pending' },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function NodeGroup({ type, nodes }: { type: 'source' | 'query' | 'reaction'; nodes: DrasiTopologyNode[] }) {
  const cfg = NODE_TYPE_CONFIG[type]
  const TypeIcon = cfg.Icon

  return (
    <div className={`p-3 rounded-lg ${cfg.bg} border ${cfg.border}`}>
      <div className="flex items-center gap-2 mb-2">
        <TypeIcon className={`w-4 h-4 ${cfg.color}`} />
        <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
        <span className="text-xs text-muted-foreground ml-auto">{nodes.length}</span>
      </div>
      <div className="space-y-1">
        {(nodes || []).map((node) => {
          const statusCfg = STATUS_ICONS[node.status]
          const StatusIcon = statusCfg.Icon
          return (
            <div key={node.id} className="flex items-center gap-2 text-xs">
              <StatusIcon
                className={`w-3 h-3 ${statusCfg.color}`}
                aria-label={statusCfg.label}
              />
              <span className="text-foreground truncate flex-1">{node.name}</span>
              <span className="text-muted-foreground/60 text-2xs">{node.kind}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DrasiTopologyProps {
  config?: Record<string, unknown>
}

export function DrasiTopology({ config: _config }: DrasiTopologyProps) {
  const {
    data: topology,
    isLoading,
    isRefreshing,
    isDemoData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
    refetch,
  } = useCachedDrasiTopology()

  const nodes = useMemo(() => topology?.nodes || [], [topology])
  const hasData = nodes.length > 0

  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  })

  const grouped = useMemo(() => ({
    sources: nodes.filter(n => n.type === 'source'),
    queries: nodes.filter(n => n.type === 'query'),
    reactions: nodes.filter(n => n.type === 'reaction'),
  }), [nodes])

  if (isLoading && !hasData) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <Skeleton variant="rounded" height={40} className="mb-3" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton variant="rounded" height={120} />
          <Skeleton variant="rounded" height={120} />
          <Skeleton variant="rounded" height={120} />
        </div>
      </div>
    )
  }

  if (isFailed && !hasData) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card p-6">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <p className="text-sm text-muted-foreground mb-4">Failed to load topology</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm"
          aria-label="Retry loading topology data"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card" role="region" aria-label="Drasi Topology">
      {/* Demo data notice */}
      {isDemoData && (
        <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-blue-400 font-medium">Demo Data</p>
            <p className="text-muted-foreground">
              Showing simulated topology. Connect a Drasi instance for live data.
            </p>
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
        <span>{topology?.connectedPairs ?? 0} connections</span>
        {(topology?.orphanedNodes ?? 0) > 0 && (
          <span className="text-yellow-400">
            {topology?.orphanedNodes} orphaned
          </span>
        )}
      </div>

      {/* Topology flow: Sources → Queries → Reactions */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] gap-2 items-start">
          <NodeGroup type="source" nodes={grouped.sources} />
          <div className="flex items-center justify-center h-full pt-8">
            <ArrowRight className="w-5 h-5 text-muted-foreground/40" aria-hidden="true" />
          </div>
          <NodeGroup type="query" nodes={grouped.queries} />
          <div className="flex items-center justify-center h-full pt-8">
            <ArrowRight className="w-5 h-5 text-muted-foreground/40" aria-hidden="true" />
          </div>
          <NodeGroup type="reaction" nodes={grouped.reactions} />
        </div>
      </div>
    </div>
  )
}
