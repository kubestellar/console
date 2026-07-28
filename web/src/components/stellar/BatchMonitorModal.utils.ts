import { isDemoMode } from '../../lib/demoMode'
import type { StellarNotification, StellarSolve, StellarSolveProgress } from '../../types/stellar'
import type { BatchEvent, ResolutionStep } from './BatchMonitorModal'

const STEP_INTERVAL_MS = 3_000
const BATCH_START_OFFSET_MS = 5_000
const BATCH_WINDOW_MS = 30_000
const MS_PER_SECOND = 1000

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

interface BatchProcessing {
  id: string
  startTime: string
  endTime?: string
  status: 'in_progress' | 'completed' | 'failed'
  totalEvents: number
  events: BatchEvent[]
  summary: { resolved: number; failed: number; skipped: number; inProgress: number }
}

export function buildDemoBatch(batchTimestamp: string): BatchProcessing {
  const start = new Date(batchTimestamp).getTime() || Date.now() - BATCH_WINDOW_MS
  const events: BatchEvent[] = [
    { id: 'demo-event-1', name: 'api-server OOMKilled (production/api-server)', status: 'resolved', durationSeconds: 14, startedAt: new Date(start).toISOString(), steps: DEMO_STEPS_RESOLVED },
    { id: 'demo-event-2', name: 'web-frontend CrashLoopBackOff (production/web)', status: 'in_progress', step: 'Generating remediation plan…', durationSeconds: 8, startedAt: new Date(start + 2000).toISOString(), steps: DEMO_STEPS_IN_PROGRESS },
    { id: 'demo-event-3', name: 'postgres-pvc Pending (staging/postgres)', status: 'failed', failureReason: 'storageClass "fast-ssd" not available in cluster', durationSeconds: 22, startedAt: new Date(start + 1000).toISOString(), steps: DEMO_STEPS_FAILED },
    { id: 'demo-event-4', name: 'redis-cache HighMemoryUsage (production/cache)', status: 'pending', durationSeconds: 3, startedAt: new Date(start + BATCH_START_OFFSET_MS).toISOString(), steps: [] },
    { id: 'demo-event-5', name: 'worker-node NodeNotReady (infra/worker-2)', status: 'skipped', durationSeconds: 0, startedAt: new Date(start + 1500).toISOString(), steps: [] },
  ]
  const summary = {
    resolved: events.filter(e => e.status === 'resolved').length,
    failed: events.filter(e => e.status === 'failed').length,
    skipped: events.filter(e => e.status === 'skipped').length,
    inProgress: events.filter(e => e.status === 'in_progress' || e.status === 'pending').length,
  }
  return { id: batchTimestamp, startTime: new Date(start).toISOString(), totalEvents: events.length, events, summary, status: 'in_progress' }
}

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

export function buildLiveBatchEvents(
  notifications: StellarNotification[],
  batchTimestamp: string,
  solves: StellarSolve[],
  solveProgress: Record<string, StellarSolveProgress>,
): BatchEvent[] {
  const live = (notifications || []).filter(n => n.batchTimestamp === batchTimestamp)
  if (live.length === 0 && isDemoMode()) {
    return buildDemoBatch(batchTimestamp).events
  }
  return live
    .map(n => {
      const status = deriveEventStatus(n, solves, solveProgress)
      const progress = solveProgress[n.id]
      const solve = (solves || []).find(s => s.eventId === n.id)
      const startedAt = solve?.startedAt || n.createdAt
      const now = Date.now()
      const start = new Date(startedAt).getTime()
      const durationSeconds = Math.max(0, Math.floor((now - start) / MS_PER_SECOND))
      return {
        id: n.id,
        name: n.title,
        status,
        step: deriveStepLabel(progress),
        failureReason: solve?.error ?? null,
        durationSeconds,
        startedAt,
        steps: buildResolutionStepsFromProgress(progress),
        notification: n,
      } as BatchEvent
    })
    .sort((a, b) => {
      const ORDER: Record<BatchEvent['status'], number> = { in_progress: 0, pending: 1, resolved: 2, failed: 3, skipped: 4 }
      const diff = (ORDER[a.status] ?? 5) - (ORDER[b.status] ?? 5)
      if (diff !== 0) return diff
      const aTime = a.notification ? new Date(a.notification.createdAt).getTime() : 0
      const bTime = b.notification ? new Date(b.notification.createdAt).getTime() : 0
      return bTime - aTime
    })
}
