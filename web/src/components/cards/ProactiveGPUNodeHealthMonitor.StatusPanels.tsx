/**
 * Small presentational pieces shared by the node list and the CronJob
 * results panel in ProactiveGPUNodeHealthMonitor.
 *
 * Extracted from ProactiveGPUNodeHealthMonitor.tsx to keep the main
 * component focused on data orchestration and rendering.
 */
import { useMemo, memo } from 'react'
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { CardAIActions } from '../../lib/cards/CardComponents'
import type { GPUNodeHealthStatus, GPUNodeHealthCheck } from '../../hooks/useMCP'
import { CHECK_LABELS } from './ProactiveGPUNodeHealthMonitor.constants'

export function StatusBadge({ status }: { status: string }) {
  // #9881 — Normalize status colors to the design-system pattern
  // (text-*-400 with bg-*-500/10) used across cilium_status and other cards.
  const config = {
    healthy: { icon: CheckCircle, bg: 'bg-green-500/10', text: 'text-green-400', label: 'Healthy' },
    degraded: { icon: AlertTriangle, bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Degraded' },
    unhealthy: { icon: XCircle, bg: 'bg-red-500/10', text: 'text-red-400', label: 'Unhealthy' } }[status] || { icon: AlertTriangle, bg: 'bg-gray-500/10 dark:bg-gray-400/10', text: 'text-muted-foreground', label: status }

  const Icon = config.icon
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', config.bg, config.text)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  )
}

export function CheckRow({ check }: { check: GPUNodeHealthCheck }) {
  const label = CHECK_LABELS[check.name] || check.name
  return (
    <div className="flex flex-wrap items-center justify-between gap-y-2 py-1 text-xs">
      <span className="text-white/60">{label}</span>
      <div className="flex items-center gap-1.5">
        {check.passed ? (
          <CheckCircle className="w-3.5 h-3.5 text-green-400" />
        ) : (
          <>
            <XCircle className="w-3.5 h-3.5 text-red-400" />
            {check.message && <span className="text-red-300/80 max-w-[200px] truncate">{check.message}</span>}
          </>
        )}
      </div>
    </div>
  )
}

// Memoized AI actions to avoid recreating issues/context arrays each render
export const GPUNodeAIActions = memo(function GPUNodeAIActions({ node }: { node: GPUNodeHealthStatus }) {
  const issues = useMemo(
    () => (node.issues || []).map((issue: string, idx: number) => ({
      name: `Issue ${idx + 1}`,
      message: issue })),
    [node.issues])

  const additionalContext = useMemo(
    () => ({
      gpuType: node.gpuType,
      gpuCount: node.gpuCount,
      stuckPods: node.stuckPods,
      checks: node.checks }),
    [node.gpuType, node.gpuCount, node.stuckPods, node.checks])

  return (
    <CardAIActions
      resource={{
        kind: 'Node',
        name: node.nodeName,
        cluster: node.cluster,
        status: node.status }}
      issues={issues}
      additionalContext={additionalContext}
    />
  )
})
