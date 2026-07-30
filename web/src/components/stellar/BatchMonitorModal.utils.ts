import type { StellarNotification, StellarSolve, StellarSolveProgress } from '../../types/stellar'

export const BATCH_UPDATE_INTERVAL_MS = 2000
export const SECONDS_PER_MINUTE = 60
export const MS_PER_SECOND = 1000
export const OVERLAY_Z_INDEX = 9_999
export const STEP_INTERVAL_MS = 3_000
export const BATCH_START_OFFSET_MS = 5_000
export const BATCH_WINDOW_MS = 30_000

export const FLEX_MIN_WIDTH_STYLE = { flex: 1, minWidth: 0 } as const
export const BATCH_SUMMARY_BREAKDOWN_ITEM_CLASS = 'flex items-center gap-2'
export const BATCH_SUMMARY_BREAKDOWN_TEXT_STYLE = {
  fontFamily: 'var(--s-mono)',
  fontSize: 11,
  color: 'var(--s-text)',
} as const

// ── Types ────────────────────────────────────────────────────────────────

export interface ResolutionStep {
  name: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  startTime: number
  endTime: number | null
  output: string
  error: string | null
}

export interface BatchEvent {
  id: string
  name: string
  status: 'pending' | 'in_progress' | 'resolved' | 'failed' | 'skipped'
  step?: string
  failureReason?: string | null
  durationSeconds: number
  startedAt?: string
  steps: ResolutionStep[]
  notification?: StellarNotification
}

export interface BatchProcessing {
  id: string
  startTime: string
  endTime?: string
  status: 'in_progress' | 'completed' | 'failed'
  totalEvents: number
  events: BatchEvent[]
  summary: {
    resolved: number
    failed: number
    skipped: number
    inProgress: number
  }
}

export interface BatchMonitorModalProps {
  batchTimestamp: string
  notifications: StellarNotification[]
  solves: StellarSolve[]
  solveProgress: Record<string, StellarSolveProgress>
  onClose: () => void
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_STEPS_RESOLVED: ResolutionStep[] = [
  { name: 'Analyzing root cause', status: 'completed', startTime: Date.now() - 12000, endTime: Date.now() - 9000, output: 'OOMKilled: container exceeded 512Mi limit', error: null },
  { name: 'Generating remediation plan', status: 'completed', startTime: Date.now() - 9000, endTime: Date.now() - 6000, output: 'Plan: patch memory limit to 768Mi', error: null },
  { name: 'Executing resolution', status: 'completed', startTime: Date.now() - 6000, endTime: Date.now() - 2000, output: 'kubectl patch deployment/api-server applied', error: null },
  { name: 'Validating result', status: 'completed', startTime: Date.now() - 2000, endTime: Date.now(), output: 'Pod restarted successfully, no OOMKill', error: null },
]

const DEMO_STEPS_IN_PROGRESS: ResolutionStep[] = [
  { name: 'Analyzing root cause', status: 'completed', startTime: Date.now() - 8000, endTime: Date.now() - BATCH_START_OFFSET_MS, output: 'CrashLoopBackOff: exit code 1 on init', error: null },
  { name: 'Generating remediation plan', status: 'in_progress', startTime: Date.now() - BATCH_START_OFFSET_MS, endTime: null, output: '', error: null },
  { name: 'Executing resolution', status: 'pending', startTime: 0, endTime: null, output: '', error: null },
  { name: 'Validating result', status: 'pending', startTime: 0, endTime: null, output: '', error: null },
]

const DEMO_STEPS_FAILED: ResolutionStep[] = [
  { name: 'Analyzing root cause', status: 'completed', startTime: Date.now() - 20000, endTime: Date.now() - 17000, output: 'PVC stuck in Pending state', error: null },
  { name: 'Generating remediation plan', status: 'completed', startTime: Date.now() - 17000, endTime: Date.now() - 14000, output: 'Plan: recreate PVC with correct storageClass', error: null },
  { name: 'Executing resolution', status: 'failed', startTime: Date.now() - 14000, endTime: Date.now() - 11000, output: '', error: 'storageClass "fast-ssd" not available in cluster' },
  { name: 'Validating result', status: 'pending', startTime: 0, endTime: null, output: '', error: null },
]

export function buildDemoBatch(batchTimestamp: string): BatchProcessing {
  const start = new Date(batchTimestamp).getTime() || Date.now() - BATCH_WINDOW_MS
  const events: BatchEvent[] = [
    {
      id: 'demo-event-1',
      name: 'api-server OOMKilled (production/api-server)',
      status: 'resolved',
      durationSeconds: 14,
      startedAt: new Date(start).toISOString(),
      steps: DEMO_STEPS_RESOLVED,
    },
    {
      id: 'demo-event-2',
      name: 'web-frontend CrashLoopBackOff (production/web)',
      status: 'in_progress',
      step: 'Generating remediation plan…',
      durationSeconds: 8,
      startedAt: new Date(start + 2000).toISOString(),
      steps: DEMO_STEPS_IN_PROGRESS,
    },
    {
      id: 'demo-event-3',
      name: 'postgres-pvc Pending (staging/postgres)',
      status: 'failed',
      failureReason: 'storageClass "fast-ssd" not available in cluster',
      durationSeconds: 22,
      startedAt: new Date(start + 1000).toISOString(),
      steps: DEMO_STEPS_FAILED,
    },
    {
      id: 'demo-event-4',
      name: 'redis-cache HighMemoryUsage (production/cache)',
      status: 'pending',
      durationSeconds: 3,
      startedAt: new Date(start + BATCH_START_OFFSET_MS).toISOString(),
      steps: [],
    },
    {
      id: 'demo-event-5',
      name: 'worker-node NodeNotReady (infra/worker-2)',
      status: 'skipped',
      durationSeconds: 0,
      startedAt: new Date(start + 1500).toISOString(),
      steps: [],
    },
  ]

  const summary = {
    resolved: events.filter(e => e.status === 'resolved').length,
    failed: events.filter(e => e.status === 'failed').length,
    skipped: events.filter(e => e.status === 'skipped').length,
    inProgress: events.filter(e => e.status === 'in_progress' || e.status === 'pending').length,
  }

  return {
    id: batchTimestamp,
    startTime: new Date(start).toISOString(),
    totalEvents: events.length,
    events,
    summary,
    status: 'in_progress',
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

export function deriveEventStatus(
  notification: StellarNotification,
  solves: StellarSolve[],
  solveProgress: Record<string, StellarSolveProgress>,
): BatchEvent['status'] {
  const progress = solveProgress[notification.id]
  if (progress) {
    if (progress.step === 'resolved') return 'resolved'
    if (progress.step === 'escalated' || progress.step === 'exhausted') return 'failed'
    return 'in_progress'
  }

  const solve = (solves || []).find(s => s.eventId === notification.id)
  if (solve) {
    if (solve.status === 'resolved') return 'resolved'
    if (solve.status === 'escalated' || solve.status === 'exhausted') return 'failed'
  }

  if (notification.severity === 'critical') return 'pending'
  return 'skipped'
}

const STEP_LABEL_MAP: Record<string, string> = {
  investigating: 'Analyzing root cause…',
  root_cause: 'Generating remediation plan…',
  solving: 'Executing resolution…',
  verifying: 'Validating result…',
  reading: 'Analyzing root cause…',
  planning: 'Generating remediation plan…',
  acting: 'Executing resolution…',
  observing: 'Validating result…',
}

export function deriveStepLabel(progress?: StellarSolveProgress): string | undefined {
  if (!progress) return undefined
  return STEP_LABEL_MAP[progress.step] ?? progress.message
}

export function buildResolutionStepsFromProgress(progress?: StellarSolveProgress): ResolutionStep[] {
  if (!progress) return []
  const stepNames = ['Analyzing root cause', 'Generating remediation plan', 'Executing resolution', 'Validating result']
  const stepKeys = ['investigating', 'root_cause', 'solving', 'verifying']
  const currentIdx = stepKeys.indexOf(progress.step)

  return stepNames.map((name, i) => {
    let status: ResolutionStep['status'] = 'pending'
    if (i < currentIdx) status = 'completed'
    else if (i === currentIdx) status = 'in_progress'
    return {
      name,
      status,
      startTime: i <= currentIdx ? Date.now() - (currentIdx - i + 1) * STEP_INTERVAL_MS : 0,
      endTime: i < currentIdx ? Date.now() - (currentIdx - i) * STEP_INTERVAL_MS : null,
      output: '',
      error: null,
    }
  })
}

export function getStatusIcon(status: BatchEvent['status']): string {
  switch (status) {
    case 'pending': return '⏳'
    case 'in_progress': return '⊙'
    case 'resolved': return '✓'
    case 'failed': return '✗'
    case 'skipped': return '–'
    default: return '•'
  }
}

export function getStatusColor(status: BatchEvent['status']): string {
  switch (status) {
    case 'pending': return 'var(--s-text-dim)'
    case 'in_progress': return 'var(--s-info)'
    case 'resolved': return 'var(--s-success)'
    case 'failed': return 'var(--s-critical)'
    case 'skipped': return 'var(--s-text-muted)'
    default: return 'var(--s-text)'
  }
}

export function formatElapsedSeconds(seconds: number): string {
  if (seconds < SECONDS_PER_MINUTE) return `${seconds}s`
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE)
  const secs = seconds % SECONDS_PER_MINUTE
  return `${minutes}m ${secs}s`
}
