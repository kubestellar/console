import type { Mission } from '../../hooks/useMissions'

const GUIDANCE_PREVIEW_MAX_LENGTH = 120
const COMPLETE_PROGRESS = 100

type MissionControlContext = {
  source?: string
  targetClusters?: unknown
  workloads?: unknown
} | undefined

export const MISSION_CONTROL_STATUS_LABEL_KEYS: Record<Mission['status'], string> = {
  pending: 'missionSidebar.statusLabels.pending',
  running: 'missionSidebar.statusLabels.running',
  cancelling: 'missionSidebar.statusLabels.cancelling',
  cancelled: 'missionSidebar.statusLabels.cancelled',
  waiting_input: 'missionSidebar.statusLabels.waitingInput',
  completed: 'missionSidebar.statusLabels.completed',
  failed: 'missionSidebar.statusLabels.failed',
  blocked: 'missionSidebar.statusLabels.blocked',
  saved: 'missionSidebar.statusLabels.saved',
}

export function isMissionControlRun(mission: Mission): boolean {
  const context = mission.context as MissionControlContext
  return context?.source === 'mission-control'
}

export function getMissionControlRunSummary(mission: Mission): { clusters: number; workloads: number; guidance: string; progress: number | null } {
  const context = mission.context as MissionControlContext
  const clusters = Array.isArray(context?.targetClusters)
    ? context.targetClusters.length
    : 0
  const workloads = Array.isArray(context?.workloads)
    ? context.workloads.length
    : 0
  const guidance = ((mission.messages || [])
    .slice()
    .reverse()
    .find((message) => message.role === 'assistant' && typeof message.content === 'string' && message.content.trim().length > 0)
    ?.content || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, GUIDANCE_PREVIEW_MAX_LENGTH)
  const progress = typeof mission.progress === 'number'
    ? Math.max(0, Math.min(COMPLETE_PROGRESS, Math.round(mission.progress)))
    : mission.status === 'completed'
      ? COMPLETE_PROGRESS
      : null

  return { clusters, workloads, guidance, progress }
}

export function getMissionControlStatusClass(status: Mission['status']): string {
  switch (status) {
    case 'completed':
      return 'text-green-400'
    case 'failed':
    case 'cancelled':
      return 'text-red-400'
    case 'running':
    case 'waiting_input':
      return 'text-amber-400'
    default:
      return 'text-muted-foreground'
  }
}
