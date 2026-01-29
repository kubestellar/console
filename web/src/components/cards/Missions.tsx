import { useState } from 'react'
import {
  Rocket,
  XCircle,
  AlertTriangle,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronRight,
  Orbit,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useDeployMissions, DeployMission, DeployMissionStatus, DeployClusterStatus } from '../../hooks/useDeployMissions'

interface MissionsProps {
  config?: Record<string, unknown>
}

const STATUS_CONFIG: Record<DeployMissionStatus, {
  icon: typeof Rocket
  color: string
  bg: string
  label: string
  animate?: boolean
}> = {
  launching: {
    icon: Rocket,
    color: 'text-blue-400',
    bg: 'bg-blue-500/20',
    label: 'Launching',
    animate: true,
  },
  deploying: {
    icon: Loader2,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/20',
    label: 'Deploying',
    animate: true,
  },
  orbit: {
    icon: Orbit,
    color: 'text-green-400',
    bg: 'bg-green-500/20',
    label: 'In Orbit',
  },
  abort: {
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/20',
    label: 'Aborted',
  },
  partial: {
    icon: AlertTriangle,
    color: 'text-orange-400',
    bg: 'bg-orange-500/20',
    label: 'Partial',
  },
}

const CLUSTER_STATUS_CONFIG: Record<DeployClusterStatus['status'], {
  color: string
  bg: string
  barColor: string
  label: string
}> = {
  pending: { color: 'text-gray-400', bg: 'bg-gray-500/20', barColor: 'bg-gray-500', label: 'Pending' },
  applying: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', barColor: 'bg-yellow-500', label: 'Applying' },
  running: { color: 'text-green-400', bg: 'bg-green-500/20', barColor: 'bg-green-500', label: 'Running' },
  failed: { color: 'text-red-400', bg: 'bg-red-500/20', barColor: 'bg-red-500', label: 'Failed' },
}

export function Missions(_props: MissionsProps) {
  const { activeMissions, history, hasActive, clearHistory } = useDeployMissions()
  const [showHistory, setShowHistory] = useState(false)
  const [expandedMissions, setExpandedMissions] = useState<Set<string>>(new Set())

  const toggleMission = (id: string) => {
    setExpandedMissions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Rocket className={cn('w-4 h-4', hasActive ? 'text-blue-400 animate-pulse' : 'text-gray-500')} />
          <span className="text-sm font-medium text-gray-300">
            {activeMissions.length > 0
              ? `${activeMissions.length} active mission${activeMissions.length !== 1 ? 's' : ''}`
              : 'Mission Control'}
          </span>
        </div>
        {history.length > 0 && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            {showHistory ? 'Hide' : 'Show'} History ({history.length})
          </button>
        )}
      </div>

      {/* Active Missions */}
      {activeMissions.length === 0 && !showHistory ? (
        <div className="text-center py-6">
          <Rocket className="w-8 h-8 mx-auto mb-2 text-gray-600" />
          <p className="text-sm text-gray-500">No active missions</p>
          <p className="text-xs text-gray-600 mt-1">
            Deploy a workload to start a mission
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeMissions.map(mission => (
            <MissionRow
              key={mission.id}
              mission={mission}
              isExpanded={expandedMissions.has(mission.id)}
              onToggle={() => toggleMission(mission.id)}
              isActive
            />
          ))}
        </div>
      )}

      {/* History Section */}
      {showHistory && history.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between pt-2 border-t border-gray-800">
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
              Mission History
            </span>
            <button
              onClick={clearHistory}
              className="flex items-center gap-1 text-[10px] text-gray-600 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-2.5 h-2.5" />
              Clear
            </button>
          </div>
          {history.slice(0, 10).map(mission => (
            <MissionRow
              key={mission.id}
              mission={mission}
              isExpanded={expandedMissions.has(mission.id)}
              onToggle={() => toggleMission(mission.id)}
              isActive={false}
            />
          ))}
        </div>
      )}

      {/* Status legend */}
      <div className="pt-2 border-t border-gray-800">
        <div className="flex items-center justify-center gap-3 text-[10px] text-gray-600">
          <span className="flex items-center gap-1">
            <Rocket className="w-2.5 h-2.5 text-blue-400" /> Launch
          </span>
          <span className="flex items-center gap-1">
            <Loader2 className="w-2.5 h-2.5 text-yellow-400" /> Deploy
          </span>
          <span className="flex items-center gap-1">
            <Orbit className="w-2.5 h-2.5 text-green-400" /> Orbit
          </span>
          <span className="flex items-center gap-1">
            <XCircle className="w-2.5 h-2.5 text-red-400" /> Abort
          </span>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Mission Row
// ============================================================================

interface MissionRowProps {
  mission: DeployMission
  isExpanded: boolean
  onToggle: () => void
  isActive: boolean
}

function MissionRow({ mission, isExpanded, onToggle, isActive }: MissionRowProps) {
  const config = STATUS_CONFIG[mission.status]
  const StatusIcon = config.icon
  const elapsed = getElapsed(mission.startedAt, mission.completedAt)

  // Calculate overall progress
  const totalClusters = mission.clusterStatuses.length
  const readyClusters = mission.clusterStatuses.filter(s => s.status === 'running').length
  const failedClusters = mission.clusterStatuses.filter(s => s.status === 'failed').length
  const progressPct = totalClusters > 0 ? ((readyClusters + failedClusters) / totalClusters) * 100 : 0

  return (
    <div className={cn(
      'rounded-lg border transition-all',
      isActive ? `${config.bg} border-gray-700/50` : 'bg-gray-900/30 border-gray-800/50',
    )}>
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-3 py-2 text-left"
      >
        {/* Expand arrow */}
        {isExpanded
          ? <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />
          : <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />
        }

        {/* Status icon */}
        <StatusIcon className={cn(
          'w-4 h-4 shrink-0',
          config.color,
          config.animate && 'animate-spin',
        )} />

        {/* Workload name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-200 truncate">
              {mission.workload}
            </span>
            {mission.groupName && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">
                {mission.groupName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            <span>{mission.namespace}</span>
            <span>&middot;</span>
            <span>{totalClusters} cluster{totalClusters !== 1 ? 's' : ''}</span>
            <span>&middot;</span>
            <span>{elapsed}</span>
          </div>
        </div>

        {/* Status badge */}
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0',
          config.bg, config.color,
        )}>
          {config.label}
        </span>
      </button>

      {/* Progress bar */}
      {isActive && mission.status !== 'orbit' && mission.status !== 'abort' && (
        <div className="px-3 pb-2">
          <div className="h-1 rounded-full bg-gray-800 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                failedClusters > 0 ? 'bg-orange-500' : 'bg-blue-500',
              )}
              style={{ width: `${Math.max(progressPct, 5)}%` }}
            />
          </div>
        </div>
      )}

      {/* Expanded cluster details */}
      {isExpanded && (
        <div className="px-3 pb-2.5 pt-1 border-t border-gray-800/50 space-y-1.5">
          {mission.deployedBy && (
            <div className="text-[10px] text-gray-600">
              Deployed by: <span className="text-gray-400">{mission.deployedBy}</span>
            </div>
          )}
          {mission.clusterStatuses.map(cs => (
            <ClusterStatusRow key={cs.cluster} status={cs} />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Cluster Status Row
// ============================================================================

interface ClusterStatusRowProps {
  status: DeployClusterStatus
}

function ClusterStatusRow({ status }: ClusterStatusRowProps) {
  const config = CLUSTER_STATUS_CONFIG[status.status]
  const replicaProgress = status.replicas > 0
    ? (status.readyReplicas / status.replicas) * 100
    : 0

  return (
    <div className="flex items-center gap-2">
      <ClusterBadge cluster={status.cluster} size="sm" />

      {/* Replica progress bar */}
      <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', config.barColor)}
          style={{ width: `${status.status === 'pending' ? 0 : Math.max(replicaProgress, 10)}%` }}
        />
      </div>

      {/* Replica count */}
      <span className={cn('text-[10px] font-mono tabular-nums shrink-0', config.color)}>
        {status.readyReplicas}/{status.replicas}
      </span>

      {/* Status label */}
      <span className={cn('text-[10px] shrink-0', config.color)}>
        {config.label}
      </span>
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

function getElapsed(startedAt: number, completedAt?: number): string {
  const end = completedAt || Date.now()
  const seconds = Math.floor((end - startedAt) / 1000)

  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}
