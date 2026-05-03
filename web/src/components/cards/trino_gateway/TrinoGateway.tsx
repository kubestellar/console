/**
 * Trino Gateway Monitor — discovers Trino coordinator/worker pods and
 * Trino Gateway pods across all connected clusters, showing cluster
 * status and gateway routing information.
 */

import {
  Database, Server, Activity, ArrowRight,
  CheckCircle2, XCircle,
} from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { useTrinoGateway } from './useTrinoGateway'
import type { TrinoGatewayStatus } from './demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GATEWAY_STATUS_COLORS: Record<TrinoGatewayStatus, string> = {
  healthy: 'text-green-400',
  degraded: 'text-yellow-400',
  down: 'text-red-400',
}

const GATEWAY_STATUS_DOT: Record<TrinoGatewayStatus, string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-yellow-500',
  down: 'bg-red-500',
}

const SUMMARY_TILE_COUNT = 4
const SKELETON_CONTENT_HEIGHT = 120

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TrinoGateway() {
  const { data, showSkeleton, showEmptyState } = useTrinoGateway()

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-3 p-1">
        <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
          {Array.from({ length: SUMMARY_TILE_COUNT }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={48} />
          ))}
        </div>
        <Skeleton variant="rounded" height={SKELETON_CONTENT_HEIGHT} className="flex-1" />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Database className="w-8 h-8 opacity-40" />
        <p className="text-sm">Trino Gateway not detected</p>
        <p className="text-xs opacity-60">Deploy Trino clusters and gateway to see status</p>
      </div>
    )
  }

  const trinoClusters = data.trinoClusters || []
  const gateways = data.gateways || []

  const healthyClusters = trinoClusters.filter(c => c.coordinatorReady).length
  const gatewayStatus = gateways.length > 0
    ? gateways.every(g => g.status === 'healthy')
      ? 'healthy'
      : gateways.some(g => g.status === 'healthy' || g.status === 'degraded')
        ? 'degraded'
        : 'down'
    : 'down'

  return (
    <div className="h-full flex flex-col min-h-card gap-3 p-1 overflow-hidden">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <StatTile icon={Database} label="Clusters" value={`${healthyClusters}/${trinoClusters.length}`} color="text-blue-400" />
        <StatTile icon={Server} label="Workers" value={String(data.totalWorkers)} color="text-purple-400" />
        <StatTile icon={Activity} label="Queries" value={String(data.totalActiveQueries)} color="text-green-400" />
        <StatTile icon={ArrowRight} label="Gateway" value={gatewayStatus} color={GATEWAY_STATUS_COLORS[gatewayStatus as TrinoGatewayStatus] ?? 'text-muted-foreground'} />
      </div>

      {/* Trino Clusters */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {trinoClusters.length > 0 && (
          <Section title={`Trino Clusters (${trinoClusters.length})`}>
            {trinoClusters.map(c => (
              <div key={`${c.cluster}/${c.namespace}/${c.name}`} className="flex flex-wrap items-center justify-between gap-y-2 px-2 py-1.5 rounded bg-secondary/30 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-1.5 h-1.5 rounded-full ${c.coordinatorReady ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="truncate font-mono">{c.name}</span>
                  <span className="text-muted-foreground truncate">@{c.cluster}</span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                  <span>{c.workerCount} workers</span>
                  <span>{c.activeQueries} active</span>
                  {c.queuedQueries > 0 && <span className="text-yellow-400">{c.queuedQueries} queued</span>}
                  <span className={c.coordinatorReady ? 'text-green-400' : 'text-red-400'}>
                    {c.coordinatorReady ? 'ready' : 'down'}
                  </span>
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* Gateways */}
        {gateways.length > 0 && (
          <Section title={`Gateways (${gateways.length})`}>
            {gateways.map(g => (
              <div key={`${g.cluster}/${g.namespace}/${g.name}`} className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-y-2 px-2 py-1.5 rounded bg-secondary/30 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full ${GATEWAY_STATUS_DOT[g.status]}`} />
                    <span className="truncate font-mono">{g.name}</span>
                    <span className="text-muted-foreground truncate">@{g.cluster}</span>
                  </div>
                  <span className={`shrink-0 ${GATEWAY_STATUS_COLORS[g.status]}`}>{g.status}</span>
                </div>

                {/* Backend routing rows */}
                {(g.backends || []).length > 0 && (
                  <div className="ml-4 space-y-0.5">
                    {(g.backends || []).map(b => (
                      <div key={`${b.cluster}/${b.name}`} className="flex items-center gap-2 px-2 py-1 rounded bg-secondary/20 text-xs">
                        <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="font-mono truncate">{b.name}</span>
                        <span className="text-muted-foreground truncate">@{b.cluster}</span>
                        <span className="ml-auto flex items-center gap-1 shrink-0">
                          {b.active ? (
                            <CheckCircle2 className="w-3 h-3 text-green-400" />
                          ) : (
                            <XCircle className="w-3 h-3 text-red-400" />
                          )}
                          <span className={b.active ? 'text-green-400' : 'text-red-400'}>
                            {b.active ? 'active' : 'inactive'}
                          </span>
                          {b.draining && (
                            <span className="text-yellow-400 ml-1">draining</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </Section>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatTile({ icon: Icon, label, value, color }: { icon: typeof Server; label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-2 px-1 rounded-lg bg-secondary/30 border border-border/50">
      <Icon className={`w-4 h-4 mb-1 ${color}`} />
      <span className="text-lg font-bold text-foreground">{value}</span>
      <span className="text-2xs text-muted-foreground">{label}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground mb-1">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  )
}
