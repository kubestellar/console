/**
 * ClusterReadinessCard — Shows a cluster with capacity gauges,
 * health status, and assigned projects.
 */

import { Server, Cpu, Box, CheckCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useTranslation } from 'react-i18next'
import { CloudProviderIcon, getProviderLabel } from '../ui/CloudProviderIcon'
import { clusterDisplayName } from '../../hooks/mcp/shared'
import type { ClusterInfo } from '../../hooks/mcp/types'
import type { ClusterAssignment, PayloadProject } from './types'

interface ClusterReadinessCardProps {
  cluster: ClusterInfo
  assignment?: ClusterAssignment
  onToggleProject: (projectName: string, assigned: boolean) => void
  availableProjects: string[]
  isRecommended?: boolean
  /** Map of projectName → Set<clusterName> for installed projects */
  installedOnCluster?: Map<string, Set<string>>
  /** Full project objects for badge rendering (Kubara badge, etc.) */
  projects?: PayloadProject[]
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
  installedOnCluster = new Map(),
  projects = [],
}: ClusterReadinessCardProps) {
  const { t } = useTranslation()
  // Build a lookup from project name → PayloadProject for Kubara badge rendering (#8484)
  const projectByName = new Map(projects.map(p => [p.name, p]))
  // Detect provider: prefer explicit distribution, fall back to name/context/namespace heuristic
  const detectProvider = (): string => {
    if (cluster.distribution) return cluster.distribution
    const name = cluster.name.toLowerCase()
    const ctx = (cluster.context || '').toLowerCase()
    const allText = `${name} ${ctx} ${(cluster.namespaces || []).join(' ').toLowerCase()}`
    if (allText.includes('coreweave') || name.includes('cks') || allText.includes('cw-')) return 'coreweave'
    if (allText.includes('eks') || allText.includes('aws')) return 'eks'
    if (allText.includes('gke') || allText.includes('gcp')) return 'gke'
    if (allText.includes('aks') || allText.includes('azure')) return 'aks'
    if (allText.includes('openshift')) return 'openshift'
    if (name.includes('kind') || ctx.includes('kind-')) return 'kind'
    if (allText.includes('k3s')) return 'k3s'
    if (allText.includes('minikube')) return 'minikube'
    if (allText.includes('rancher')) return 'rancher'
    return 'kubernetes'
  }
  const provider = detectProvider() as Parameters<typeof CloudProviderIcon>[0]['provider']
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
        <span title={getProviderLabel(provider)}>
          <CloudProviderIcon provider={provider} size={28} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium truncate" title={cluster.name}>{clusterDisplayName(cluster.name)}</h4>
            <span
              className={cn(
                'w-2 h-2 rounded-full shrink-0',
                cluster.healthy ? 'bg-green-500' : 'bg-red-500'
              )}
              title={cluster.healthy ? 'Healthy' : 'Unhealthy'}
            />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1" title={`${cluster.nodeCount ?? 0} nodes`}>
              <Server className="w-3 h-3" />
              <span>{cluster.nodeCount ?? 0}</span>
            </div>
            <div className="flex items-center gap-1" title={`${cluster.cpuCores ?? 0} CPU cores`}>
              <Cpu className="w-3 h-3" />
              <span>{cluster.cpuCores ?? 0}</span>
            </div>
            <div className="flex items-center gap-1" title={`${cluster.podCount ?? 0} pods`}>
              <Box className="w-3 h-3" />
              <span>{cluster.podCount ?? 0}</span>
            </div>
            {cluster.distribution && (
              <span className="text-2xs opacity-60">{cluster.distribution}</span>
            )}
          </div>
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
                <span className="shrink-0">{icon}</span>
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
        <div className="space-y-1 max-h-64 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
          {[...availableProjects].sort((a, b) => {
            const aInstalled = installedOnCluster.get(a)?.has(cluster.name) ?? false
            const bInstalled = installedOnCluster.get(b)?.has(cluster.name) ?? false
            if (aInstalled !== bInstalled) return aInstalled ? 1 : -1
            return 0
          }).map((name) => {
            const checked = assignedProjects.includes(name)
            const isInstalled = installedOnCluster.get(name)?.has(cluster.name) ?? false
            const isKubara = !!projectByName.get(name)?.kubaraChart
            return (
              <label
                key={name}
                className={cn(
                  'flex items-center gap-2 text-xs px-1.5 py-0.5 rounded',
                  isInstalled ? 'cursor-default' : 'cursor-pointer hover:bg-secondary/50'
                )}
                title={isInstalled ? `${name} is already installed on this cluster` : undefined}
              >
                <input
                  type="checkbox"
                  checked={checked || isInstalled}
                  onChange={() => !isInstalled && onToggleProject(name, !checked)}
                  disabled={isInstalled}
                  className="rounded border-border"
                />
                <span className={cn(
                  checked || isInstalled ? 'text-foreground' : 'text-muted-foreground',
                  isInstalled && 'font-medium'
                )}>
                  {name}
                </span>
                {isKubara && (
                  <span
                    className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[8px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    title={t('layout.missionSidebar.kubaraBadgeTooltip')}
                  >
                    <CheckCircle className="w-2 h-2" />
                    {t('layout.missionSidebar.kubaraBadge')}
                  </span>
                )}
                {isInstalled && (
                  <span className="text-[9px] text-emerald-400 font-medium ml-auto">installed</span>
                )}
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}
