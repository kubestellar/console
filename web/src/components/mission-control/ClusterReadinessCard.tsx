/**
 * ClusterReadinessCard — Shows a cluster with capacity gauges,
 * health status, and assigned projects.
 */

import { cn } from '../../lib/cn'
import { CloudProviderIcon } from '../ui/CloudProviderIcon'
import type { ClusterInfo } from '../../hooks/mcp/types'
import type { ClusterAssignment } from './types'

interface ClusterReadinessCardProps {
  cluster: ClusterInfo
  assignment?: ClusterAssignment
  onToggleProject: (projectName: string, assigned: boolean) => void
  availableProjects: string[]
  isRecommended?: boolean
}

function CapacityBar({ label, used, total, unit }: {
  label: string
  used: number
  total: number
  unit: string
}) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0
  const color =
    pct >= 90 ? 'bg-red-500' :
    pct >= 70 ? 'bg-amber-500' :
    pct >= 50 ? 'bg-yellow-500' :
    'bg-green-500'

  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span>
          {used.toFixed(1)}/{total.toFixed(1)} {unit} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function ClusterReadinessCard({
  cluster,
  assignment,
  onToggleProject,
  availableProjects,
  isRecommended,
}: ClusterReadinessCardProps) {
  const provider = (cluster.distribution || 'kubernetes') as Parameters<typeof CloudProviderIcon>[0]['provider']
  const assignedProjects = assignment?.projectNames ?? []
  const warnings = assignment?.warnings ?? []
  const readiness = assignment?.readiness

  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-4 transition-all',
        isRecommended && 'border-violet-500/50 shadow-[0_0_12px_rgba(139,92,246,0.15)]',
        !isRecommended && 'border-border'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <CloudProviderIcon provider={provider} size={28} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium truncate">{cluster.name}</h4>
            <span
              className={cn(
                'w-2 h-2 rounded-full flex-shrink-0',
                cluster.healthy ? 'bg-green-500' : 'bg-red-500'
              )}
              title={cluster.healthy ? 'Healthy' : 'Unhealthy'}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {cluster.nodeCount ?? 0} node{(cluster.nodeCount ?? 0) !== 1 ? 's' : ''}
            {cluster.distribution && ` · ${cluster.distribution}`}
          </p>
        </div>
        {readiness && (
          <div
            className={cn(
              'flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold',
              readiness.overallScore >= 70 ? 'bg-green-500/15 text-green-400' :
              readiness.overallScore >= 40 ? 'bg-yellow-500/15 text-yellow-400' :
              'bg-red-500/15 text-red-400'
            )}
            title={`Readiness score: ${readiness.overallScore}%`}
          >
            {readiness.overallScore}
          </div>
        )}
      </div>

      {/* Capacity gauges */}
      <div className="space-y-1.5 mb-3">
        <CapacityBar
          label="CPU"
          used={cluster.cpuUsageCores ?? cluster.cpuRequestsCores ?? 0}
          total={cluster.cpuCores ?? 0}
          unit="cores"
        />
        <CapacityBar
          label="Memory"
          used={cluster.memoryUsageGB ?? cluster.memoryRequestsGB ?? 0}
          total={cluster.memoryGB ?? 0}
          unit="GB"
        />
        <CapacityBar
          label="Storage"
          used={0}
          total={cluster.storageGB ?? 0}
          unit="GB"
        />
      </div>

      {/* Warnings & status notes */}
      {warnings.length > 0 && (
        <div className="mb-3 space-y-1">
          {warnings.map((w, i) => {
            const lower = w.toLowerCase()
            const isPositive = /already running|already deployed|already installed|skip install|healthy/.test(lower)
            const isError = /not installed|missing|must install|conflict|error|fail/.test(lower)
            // positive = green (already running), error/action needed = amber, neutral = slate
            const color = isPositive ? 'text-emerald-400' : isError ? 'text-amber-400' : 'text-slate-400'
            const icon = isPositive ? '✓' : isError ? '⚠' : '•'
            return (
              <p key={i} className={cn('text-[10px] flex items-start gap-1', color)}>
                <span className="flex-shrink-0">{icon}</span>
                <span>{w}</span>
              </p>
            )
          })}
        </div>
      )}

      {/* Project assignment checkboxes */}
      <div className="border-t border-border pt-2 mt-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
          Assigned Projects
        </p>
        <div className="space-y-1 max-h-40 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
          {availableProjects.map((name) => {
            const checked = assignedProjects.includes(name)
            return (
              <label
                key={name}
                className="flex items-center gap-2 text-xs cursor-pointer hover:bg-secondary/50 px-1.5 py-0.5 rounded"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleProject(name, !checked)}
                  className="rounded border-border"
                />
                <span className={checked ? 'text-foreground' : 'text-muted-foreground'}>
                  {name}
                </span>
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}
