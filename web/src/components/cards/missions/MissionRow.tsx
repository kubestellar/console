import { useState, useEffect } from 'react'
import {
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Orbit,
  Terminal,
  Stethoscope,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../../../lib/cn'
import { getClusterInfo } from '../../ui/ClusterBadge'
import { useTranslation } from 'react-i18next'
import type { DeployMission, DeployMissionStatus, DeployClusterStatus } from '../../../hooks/useDeployMissions'
import type { DeployedDep } from '../../../lib/cardEvents'
import { ClusterStatusRow } from './ClusterStatusRow'
import { DependencySummary } from './DependencySummary'
import { getElapsed } from './getElapsed'

interface OrbitStatus {
  cadence: string
  lastResult?: string
  overdue: boolean
}

interface MissionRowProps {
  mission: DeployMission
  isExpanded: boolean
  onToggle: () => void
  isActive: boolean
  onDiagnose: (mission: DeployMission) => void
  onRepair: (mission: DeployMission) => void
  orbitStatus?: OrbitStatus
  statusConfig: Record<DeployMissionStatus, {
    icon: LucideIcon
    color: string
    bg: string
    label: string
    animateClass?: string
  }>
  clusterStatusConfig: Record<DeployClusterStatus['status'], {
    color: string
    barColor: string
    label: string
  }>
  depActionStyles: Record<string, { color: string; label: string }>
}

export function MissionRow({ mission, isExpanded, onToggle, isActive, onDiagnose, onRepair, orbitStatus, statusConfig, clusterStatusConfig, depActionStyles }: MissionRowProps) {
  const { t } = useTranslation(['common', 'cards'])
  const config = statusConfig[mission.status] || statusConfig.launching
  const StatusIcon = config.icon
  const elapsed = getElapsed(mission.startedAt, mission.completedAt)
  const [showLogs, setShowLogs] = useState(false)

  // Auto-show logs when deploying (keep visible after completion for review)
  const isDeploying = mission.status === 'launching' || mission.status === 'deploying'
  const hasLogs = mission.clusterStatuses.some(cs => cs.logs && cs.logs.length > 0)

  useEffect(() => {
    if (isDeploying && hasLogs) setShowLogs(true)
  }, [isDeploying, hasLogs])

  // Calculate overall progress
  const totalClusters = (mission.clusterStatuses || []).length
  const readyClusters = (mission.clusterStatuses || []).filter(s => s.status === 'running').length
  const failedClusters = (mission.clusterStatuses || []).filter(s => s.status === 'failed').length
  const progressPct = totalClusters > 0 ? ((readyClusters + failedClusters) / totalClusters) * 100 : 0

  return (
    <div className={cn(
      'rounded-lg border transition-all',
      isActive ? `${config.bg} border-border/70` : 'bg-muted/20 border-border/50',
    )}>
      {/* Summary row - use div instead of button to avoid nesting violation with inner log toggle button */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        className="flex items-center gap-2 w-full px-3 py-2 text-left cursor-pointer"
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} mission ${mission.workload} in ${mission.namespace}`}
      >
        {/* Expand arrow */}
        {isExpanded
          ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
          : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
        }

        {/* Status icon */}
        <StatusIcon className={cn(
          'w-4 h-4 shrink-0',
          config.color,
          config.animateClass,
        )} />

        {/* Workload name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {mission.workload}
            </span>
            {mission.groupName && (
              <span className="text-2xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {mission.groupName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-2xs text-muted-foreground">
            <span>{mission.namespace}</span>
            <span>&middot;</span>
            <span>{totalClusters} cluster{totalClusters !== 1 ? 's' : ''}</span>
            <span>&middot;</span>
            <span>{elapsed}</span>
          </div>
        </div>

        {/* Log toggle + Status badge */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setShowLogs(!showLogs) }}
            className={cn(
              'p-0.5 rounded transition-colors',
              showLogs ? 'text-green-600 dark:text-green-400 bg-green-500/20' : 'text-muted-foreground hover:text-foreground',
            )}
            title={showLogs ? 'Hide events' : 'Show events'}
          >
            <Terminal className="w-3 h-3" />
          </button>
          <span className={cn(
            'text-2xs px-1.5 py-0.5 rounded font-medium',
            config.bg, config.color,
          )}>
            {config.label}
          </span>
        </div>
      </div>

      {/* Progress bar — always visible so completed missions show final state */}
      <div className="px-3 pb-2">
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              mission.status === 'orbit' ? 'bg-green-500' :
              mission.status === 'abort' ? 'bg-red-500' :
              failedClusters > 0 ? 'bg-red-500' : 'bg-purple-500',
            )}
            style={{ width: `${(mission.status === 'orbit' || mission.status === 'abort') ? 100 : Math.max(progressPct, 5)}%` }}
          />
        </div>
      </div>

      {/* Orbit maintenance status — shown for "in orbit" missions with maintenance configured */}
      {mission.status === 'orbit' && orbitStatus && (
        <div className="px-3 pb-2 flex items-center gap-1.5">
          <Orbit className="w-2.5 h-2.5 text-purple-400" />
          <span className="text-2xs text-muted-foreground">
            {orbitStatus.cadence} maintenance
          </span>
          {orbitStatus.lastResult && (
            <span className={cn(
              'text-2xs font-medium',
              orbitStatus.lastResult === 'success' ? 'text-green-400' :
              orbitStatus.lastResult === 'warning' ? 'text-yellow-400' : 'text-red-400',
            )}>
              {orbitStatus.lastResult}
            </span>
          )}
          {orbitStatus.overdue && (
            <span className="text-2xs font-medium text-amber-400">overdue</span>
          )}
        </div>
      )}

      {/* Per-cluster progress — visible for active missions; completed missions show on expand */}
      {isActive && !isExpanded && (mission.clusterStatuses || []).length > 0 && (
        <div className="px-3 pb-2 space-y-1">
          {(mission.clusterStatuses || []).map(cs => (
            <ClusterStatusRow key={cs.cluster} status={cs} clusterStatusConfig={clusterStatusConfig} />
          ))}
          {mission.dependencies && mission.dependencies.length > 0 && (
            <DependencySummary dependencies={mission.dependencies} depActionStyles={depActionStyles} />
          )}
        </div>
      )}

      {/* AI action buttons for failed missions */}
      {(mission.status === 'abort' || mission.status === 'partial') && (
        <div className="px-3 pb-2 flex items-center gap-2">
          <button
            onClick={() => onDiagnose(mission)}
            className="flex items-center gap-1.5 text-2xs px-2 py-1 rounded bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 border border-purple-500/20 transition-colors"
            title={t('cards:missionsCard.diagnoseTitle')}
          >
            <Stethoscope className="w-3 h-3" />
            Diagnose
          </button>
          <button
            onClick={() => onRepair(mission)}
            className="flex items-center gap-1.5 text-2xs px-2 py-1 rounded bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20 transition-colors"
            title={t('cards:missionsCard.repairTitle')}
          >
            <Wrench className="w-3 h-3" />
            Repair
          </button>
        </div>
      )}

      {/* Deploy events (always available, toggle with Terminal button) */}
      {showLogs && (
        <div className="px-3 pb-2">
          <div className="rounded bg-muted/50 border border-border/50 overflow-hidden">
            <div className="px-2 py-1 border-b border-border/50 flex items-center gap-1.5">
              <Terminal className="w-2.5 h-2.5 text-green-600 dark:text-green-400" />
              <span className="text-2xs text-green-600 dark:text-green-400 font-medium">Deploy Events</span>
            </div>
            <div className="px-2 py-1.5 max-h-32 overflow-y-auto">
              {hasLogs ? (
                mission.clusterStatuses
                  .filter(cs => cs.logs && cs.logs.length > 0)
                  .map(cs => {
                    const clusterInfo = getClusterInfo(cs.cluster)
                    return (
                      <div key={cs.cluster}>
                        {mission.clusterStatuses.length > 1 && (
                          <div className={cn('text-[9px] font-medium mt-1 first:mt-0', clusterInfo.colors.text)}>
                            {cs.cluster}
                          </div>
                        )}
                        {cs.logs!.map((line, i) => (
                          <div
                            key={i}
                            className="text-2xs font-mono text-muted-foreground leading-relaxed truncate flex items-start gap-1.5"
                          >
                            <span className={cn('inline-block w-1.5 h-1.5 rounded-full mt-[5px] shrink-0', clusterInfo.colors.bg, clusterInfo.colors.border, 'border')} />
                            {line}
                          </div>
                        ))}
                      </div>
                    )
                  })
              ) : (
                <div className="text-2xs text-muted-foreground/70 italic py-1">
                  {(mission.status === 'orbit' || mission.status === 'abort')
                    ? 'No recent events — K8s events expire after ~1 hour'
                    : 'Waiting for events...'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Expanded cluster details */}
      {isExpanded && (
        <div className="px-3 pb-2.5 pt-1 border-t border-border/50 space-y-1.5">
          {mission.deployedBy && (
            <div className="text-2xs text-muted-foreground/70">
              Deployed by: <span className="text-muted-foreground">{mission.deployedBy}</span>
            </div>
          )}
          {(mission.clusterStatuses || []).map(cs => (
            <ClusterStatusRow key={cs.cluster} status={cs} clusterStatusConfig={clusterStatusConfig} />
          ))}

          {/* Dependencies summary */}
          {mission.dependencies && mission.dependencies.length > 0 && (
            <DependencySummary dependencies={mission.dependencies} depActionStyles={depActionStyles} />
          )}

          {/* Warnings */}
          {mission.warnings && mission.warnings.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {mission.warnings.map((w, i) => (
                <div key={i} className="text-2xs text-yellow-500/80 flex items-start gap-1">
                  <AlertTriangle className="w-2.5 h-2.5 mt-[2px] shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
