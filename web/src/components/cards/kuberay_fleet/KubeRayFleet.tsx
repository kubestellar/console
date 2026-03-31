/**
 * KubeRay Fleet Monitor — discovers RayCluster, RayService, and RayJob
 * CRDs across all connected clusters and shows fleet-level Ray status.
 */

import { useTranslation } from 'react-i18next'
import {
  Cpu, Layers, PlayCircle, Server,
  CheckCircle2, XCircle, Clock, AlertTriangle, ArrowUpCircle,
} from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { useKubeRayFleet } from './useKubeRayFleet'
import type { RayClusterState, RayJobStatus, RayServiceStatus } from './demoData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLUSTER_STATE_COLORS: Record<RayClusterState, string> = {
  ready: 'text-green-400',
  unhealthy: 'text-red-400',
  suspended: 'text-yellow-400',
  unknown: 'text-muted-foreground',
}

const JOB_STATUS_ICONS: Record<RayJobStatus, { Icon: typeof CheckCircle2; color: string }> = {
  RUNNING: { Icon: PlayCircle, color: 'text-blue-400' },
  SUCCEEDED: { Icon: CheckCircle2, color: 'text-green-400' },
  FAILED: { Icon: XCircle, color: 'text-red-400' },
  PENDING: { Icon: Clock, color: 'text-yellow-400' },
  STOPPED: { Icon: XCircle, color: 'text-muted-foreground' },
}

const SERVICE_STATUS_COLORS: Record<RayServiceStatus, string> = {
  Running: 'text-green-400',
  Deploying: 'text-blue-400',
  FailedToGetOrCreateRayCluster: 'text-red-400',
  WaitForServeDeploymentReady: 'text-yellow-400',
  Unknown: 'text-muted-foreground',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KubeRayFleet() {
  const { t } = useTranslation('cards')
  const { data, showSkeleton, showEmptyState } = useKubeRayFleet()

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-3 p-1">
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={48} />
          ))}
        </div>
        <Skeleton variant="rounded" height={120} className="flex-1" />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Layers className="w-8 h-8 opacity-40" />
        <p className="text-sm">{t('kuberayFleet.notDetected', 'KubeRay not detected')}</p>
        <p className="text-xs opacity-60">{t('kuberayFleet.notDetectedHint', 'Install KubeRay operator to see Ray clusters')}</p>
      </div>
    )
  }

  const rayClusters = data.rayClusters || []
  const rayServices = data.rayServices || []
  const rayJobs = data.rayJobs || []

  const readyClusters = rayClusters.filter(c => c.state === 'ready').length
  const totalWorkers = rayClusters.reduce((s, c) => s + c.availableWorkers, 0)
  const runningJobs = rayJobs.filter(j => j.jobStatus === 'RUNNING').length
  const servingEndpoints = rayServices.filter(s => s.status === 'Running').length

  return (
    <div className="h-full flex flex-col min-h-card gap-3 p-1 overflow-hidden">
      {/* Fleet summary tiles */}
      <div className="grid grid-cols-4 gap-2">
        <StatTile icon={Server} label="Clusters" value={`${readyClusters}/${rayClusters.length}`} color="text-blue-400" />
        <StatTile icon={Cpu} label="Workers" value={String(totalWorkers)} color="text-purple-400" />
        <StatTile icon={Layers} label="GPUs" value={String(data.totalGPUs)} color="text-green-400" />
        <StatTile icon={PlayCircle} label="Jobs" value={String(runningJobs)} color="text-yellow-400" />
      </div>

      {/* Ray Clusters */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {rayClusters.length > 0 && (
          <Section title={`Ray Clusters (${rayClusters.length})`}>
            {rayClusters.map(c => (
              <div key={`${c.cluster}/${c.namespace}/${c.name}`} className="flex items-center justify-between px-2 py-1.5 rounded bg-secondary/30 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-1.5 h-1.5 rounded-full ${c.state === 'ready' ? 'bg-green-500' : c.state === 'unhealthy' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                  <span className="truncate font-mono">{c.name}</span>
                  <span className="text-muted-foreground truncate">@{c.cluster}</span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground flex-shrink-0">
                  <span>{c.availableWorkers}/{c.desiredWorkers} workers</span>
                  {c.gpuCount > 0 && <span className="text-green-400">{c.gpuCount} GPU</span>}
                  <span className={CLUSTER_STATE_COLORS[c.state]}>{c.state}</span>
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* Ray Services */}
        {rayServices.length > 0 && (
          <Section title={`Serving Endpoints (${servingEndpoints}/${rayServices.length})`}>
            {rayServices.map(s => (
              <div key={`${s.cluster}/${s.namespace}/${s.name}`} className="flex items-center justify-between px-2 py-1.5 rounded bg-secondary/30 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <ArrowUpCircle className={`w-3 h-3 flex-shrink-0 ${SERVICE_STATUS_COLORS[s.status]}`} />
                  <span className="truncate font-mono">{s.name}</span>
                  <span className="text-muted-foreground truncate">@{s.cluster}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground flex-shrink-0">
                  {s.pendingUpgrade && (
                    <span className="text-yellow-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> upgrade pending
                    </span>
                  )}
                  <span className={SERVICE_STATUS_COLORS[s.status]}>{s.status}</span>
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* Ray Jobs */}
        {rayJobs.length > 0 && (
          <Section title={`Jobs (${rayJobs.length})`}>
            {rayJobs.map(j => {
              const { Icon, color } = JOB_STATUS_ICONS[j.jobStatus] || JOB_STATUS_ICONS.PENDING
              return (
                <div key={`${j.cluster}/${j.namespace}/${j.name}`} className="flex items-center justify-between px-2 py-1.5 rounded bg-secondary/30 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className={`w-3 h-3 flex-shrink-0 ${color}`} />
                    <span className="truncate font-mono">{j.name}</span>
                    <span className="text-muted-foreground truncate">@{j.cluster}</span>
                  </div>
                  <span className={`flex-shrink-0 ${color}`}>{j.jobStatus}</span>
                </div>
              )
            })}
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
