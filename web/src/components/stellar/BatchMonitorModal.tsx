import { useEffect, useRef, useState, useMemo, useCallback, useId } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { StellarNotification, StellarSolve, StellarSolveProgress } from '../../types/stellar'
import { isDemoMode } from '../../lib/demoMode'

const BATCH_UPDATE_INTERVAL_MS = 2000
const SECONDS_PER_MINUTE = 60
const MS_PER_SECOND = 1000

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

interface BatchProcessing {
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

interface BatchMonitorModalProps {
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
  { name: 'Analyzing root cause', status: 'completed', startTime: Date.now() - 8000, endTime: Date.now() - 5000, output: 'CrashLoopBackOff: exit code 1 on init', error: null },
  { name: 'Generating remediation plan', status: 'in_progress', startTime: Date.now() - 5000, endTime: null, output: '', error: null },
  { name: 'Executing resolution', status: 'pending', startTime: 0, endTime: null, output: '', error: null },
  { name: 'Validating result', status: 'pending', startTime: 0, endTime: null, output: '', error: null },
]

const DEMO_STEPS_FAILED: ResolutionStep[] = [
  { name: 'Analyzing root cause', status: 'completed', startTime: Date.now() - 20000, endTime: Date.now() - 17000, output: 'PVC stuck in Pending state', error: null },
  { name: 'Generating remediation plan', status: 'completed', startTime: Date.now() - 17000, endTime: Date.now() - 14000, output: 'Plan: recreate PVC with correct storageClass', error: null },
  { name: 'Executing resolution', status: 'failed', startTime: Date.now() - 14000, endTime: Date.now() - 11000, output: '', error: 'storageClass "fast-ssd" not available in cluster' },
  { name: 'Validating result', status: 'pending', startTime: 0, endTime: null, output: '', error: null },
]

function buildDemoBatch(batchTimestamp: string): BatchProcessing {
  const start = new Date(batchTimestamp).getTime() || Date.now() - 30000
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
      startedAt: new Date(start + 5000).toISOString(),
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

function deriveEventStatus(
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

function deriveStepLabel(progress?: StellarSolveProgress): string | undefined {
  if (!progress) return undefined
  return STEP_LABEL_MAP[progress.step] ?? progress.message
}

function buildResolutionStepsFromProgress(progress?: StellarSolveProgress): ResolutionStep[] {
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
      startTime: i <= currentIdx ? Date.now() - (currentIdx - i + 1) * 3000 : 0,
      endTime: i < currentIdx ? Date.now() - (currentIdx - i) * 3000 : null,
      output: '',
      error: null,
    }
  })
}

function getStatusIcon(status: BatchEvent['status']): string {
  switch (status) {
    case 'pending': return '⏳'
    case 'in_progress': return '⊙'
    case 'resolved': return '✓'
    case 'failed': return '✗'
    case 'skipped': return '–'
    default: return '•'
  }
}

function getStatusColor(status: BatchEvent['status']): string {
  switch (status) {
    case 'pending': return 'var(--s-text-dim)'
    case 'in_progress': return 'var(--s-info)'
    case 'resolved': return 'var(--s-success)'
    case 'failed': return 'var(--s-critical)'
    case 'skipped': return 'var(--s-text-muted)'
    default: return 'var(--s-text)'
  }
}

function formatElapsedSeconds(seconds: number): string {
  if (seconds < SECONDS_PER_MINUTE) return `${seconds}s`
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE)
  const secs = seconds % SECONDS_PER_MINUTE
  return `${minutes}m ${secs}s`
}

// ── EventRow ─────────────────────────────────────────────────────────────

function EventRow({ event }: { event: BatchEvent }) {
  const [expanded, setExpanded] = useState(false)
  const { t } = useTranslation()

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (event.steps.length > 0) setExpanded(x => !x)
    }
  }, [event.steps.length])

  const hasSteps = event.steps.length > 0

  return (
    <div
      style={{
        border: '1px solid var(--s-border)',
        borderRadius: 'var(--s-rs)',
        background: event.status === 'in_progress' ? 'rgba(99,150,237,0.05)' : 'var(--s-surface-1)',
        overflow: 'hidden',
      }}
    >
      {/* Main row */}
      <div
        role={hasSteps ? 'button' : undefined}
        tabIndex={hasSteps ? 0 : undefined}
        aria-expanded={hasSteps ? expanded : undefined}
        onClick={hasSteps ? () => setExpanded(x => !x) : undefined}
        onKeyDown={hasSteps ? handleKeyDown : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          cursor: hasSteps ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            fontSize: 14,
            color: getStatusColor(event.status),
            flexShrink: 0,
          }}
        >
          {getStatusIcon(event.status)}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--s-text)',
            marginBottom: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {event.name}
          </div>
          {event.step && (
            <div style={{
              fontFamily: 'var(--s-mono)',
              fontSize: 10,
              color: 'var(--s-text-muted)',
            }}>
              {event.step}
            </div>
          )}
          {event.failureReason && (
            <div style={{ fontSize: 10, color: 'var(--s-critical)', marginTop: 2 }}>
              {event.failureReason}
            </div>
          )}
        </div>

        <div style={{
          fontFamily: 'var(--s-mono)',
          fontSize: 10,
          color: 'var(--s-text-dim)',
          flexShrink: 0,
        }}>
          {formatElapsedSeconds(event.durationSeconds)}
        </div>

        {hasSteps && (
          <span
            aria-hidden="true"
            style={{
              fontSize: 10,
              color: 'var(--s-text-dim)',
              flexShrink: 0,
              transition: 'transform 0.15s',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            ▾
          </span>
        )}
      </div>

      {/* Expanded steps */}
      {expanded && hasSteps && (
        <div style={{
          borderTop: '1px solid var(--s-border)',
          padding: '10px 12px 12px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{
            fontFamily: 'var(--s-mono)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--s-text-muted)',
            marginBottom: 4,
          }}>
            {t('stellar.batch.resolutionSteps')}
          </div>
          {event.steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{
                fontSize: 12,
                flexShrink: 0,
                marginTop: 1,
                color: step.status === 'completed' ? 'var(--s-success)'
                  : step.status === 'failed' ? 'var(--s-critical)'
                  : step.status === 'in_progress' ? 'var(--s-info)'
                  : 'var(--s-text-dim)',
              }}>
                {step.status === 'completed' ? '✓'
                  : step.status === 'failed' ? '✗'
                  : step.status === 'in_progress' ? '⊙'
                  : '○'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 11,
                  color: step.status === 'pending' ? 'var(--s-text-dim)' : 'var(--s-text)',
                  fontWeight: step.status === 'in_progress' ? 600 : 400,
                }}>
                  {step.name}
                </div>
                {step.output && (
                  <div style={{
                    fontFamily: 'var(--s-mono)',
                    fontSize: 10,
                    color: 'var(--s-text-muted)',
                    marginTop: 2,
                    wordBreak: 'break-all',
                  }}>
                    {step.output}
                  </div>
                )}
                {step.error && (
                  <div style={{
                    fontFamily: 'var(--s-mono)',
                    fontSize: 10,
                    color: 'var(--s-critical)',
                    marginTop: 2,
                  }}>
                    {step.error}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── BatchMonitorModal ─────────────────────────────────────────────────────────

export function BatchMonitorModal({
  batchTimestamp,
  notifications,
  solves,
  solveProgress,
  onClose,
}: BatchMonitorModalProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const statusRegionId = useId()
  const modalRef = useRef<HTMLDivElement>(null)
  const [elapsed, setElapsed] = useState(0)

  // Focus trap
  useEffect(() => {
    const el = modalRef.current
    if (!el) return
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const prev = document.activeElement as HTMLElement | null

    first?.focus()

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      if (focusable.length === 0) { e.preventDefault(); return }
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', handleTab)
    return () => {
      document.removeEventListener('keydown', handleTab)
      prev?.focus()
    }
  }, [])

  // ESC to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Derive batch events from live notifications, or use demo data
  const batchEvents = useMemo((): BatchEvent[] => {
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
        const ORDER: Record<BatchEvent['status'], number> = {
          in_progress: 0, pending: 1, resolved: 2, failed: 3, skipped: 4,
        }
        const diff = (ORDER[a.status] ?? 5) - (ORDER[b.status] ?? 5)
        if (diff !== 0) return diff
        const aTime = a.notification ? new Date(a.notification.createdAt).getTime() : 0
        const bTime = b.notification ? new Date(b.notification.createdAt).getTime() : 0
        return bTime - aTime
      })
  }, [notifications, batchTimestamp, solves, solveProgress])

  const batch = useMemo<BatchProcessing>(() => {
    const summary = {
      resolved: batchEvents.filter(e => e.status === 'resolved').length,
      failed: batchEvents.filter(e => e.status === 'failed').length,
      skipped: batchEvents.filter(e => e.status === 'skipped').length,
      inProgress: batchEvents.filter(e => e.status === 'in_progress' || e.status === 'pending').length,
    }
    const allDone = summary.inProgress === 0 && batchEvents.length > 0
    const anyFailed = summary.failed > 0
    return {
      id: batchTimestamp,
      startTime: batchTimestamp,
      endTime: allDone ? new Date().toISOString() : undefined,
      status: allDone ? (anyFailed ? 'failed' : 'completed') : 'in_progress',
      totalEvents: batchEvents.length,
      events: batchEvents,
      summary,
    }
  }, [batchEvents, batchTimestamp])

  // Elapsed timer
  useEffect(() => {
    const start = new Date(batch.startTime).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / MS_PER_SECOND))
    tick()
    const id = setInterval(tick, BATCH_UPDATE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [batch.startTime])

  const progressPercent = batch.totalEvents > 0
    ? Math.round(((batch.summary.resolved + batch.summary.failed + batch.summary.skipped) / batch.totalEvents) * 100)
    : 0

  const statusLabel = batch.status === 'in_progress'
    ? t('stellar.batch.statusInProgress')
    : batch.status === 'completed'
    ? t('stellar.batch.statusCompleted')
    : t('stellar.batch.statusFailed')

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          background: 'var(--s-bg)',
          border: '1px solid var(--s-border)',
          borderRadius: 'var(--s-r)',
          maxWidth: 800, width: '100%',
          maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--s-border)',
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
              <h2
                id={titleId}
                style={{
                  fontFamily: 'var(--s-mono)', fontSize: 14, fontWeight: 700,
                  color: 'var(--s-text)', margin: 0,
                }}
              >
                {t('stellar.batch.title')}
              </h2>
              <span style={{
                fontFamily: 'var(--s-mono)', fontSize: 11,
                color: 'var(--s-text-muted)',
                background: 'var(--s-surface-2)',
                padding: '2px 8px', borderRadius: 'var(--s-rs)',
              }}>
                {new Date(batchTimestamp).toLocaleString()}
              </span>
              <span
                aria-live="polite"
                aria-atomic="true"
                id={statusRegionId}
                style={{
                  fontFamily: 'var(--s-mono)', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: batch.status === 'completed' ? 'var(--s-success)'
                    : batch.status === 'failed' ? 'var(--s-warning)'
                    : 'var(--s-info)',
                  background: batch.status === 'completed' ? 'rgba(63,185,80,0.12)'
                    : batch.status === 'failed' ? 'rgba(227,179,65,0.12)'
                    : 'rgba(99,150,237,0.12)',
                  border: `1px solid ${batch.status === 'completed' ? 'rgba(63,185,80,0.3)'
                    : batch.status === 'failed' ? 'rgba(227,179,65,0.3)'
                    : 'rgba(99,150,237,0.3)'}`,
                  borderRadius: 10, padding: '2px 8px',
                }}
              >
                {statusLabel}
              </span>
            </div>
            <div style={{
              fontFamily: 'var(--s-mono)', fontSize: 11, color: 'var(--s-text-dim)',
            }}>
              {t('stellar.batch.elapsed')}: {formatElapsedSeconds(elapsed)}
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label={t('stellar.batch.closeAriaLabel')}
            title={t('actions.close')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 18, color: 'var(--s-text-dim)', padding: 4, lineHeight: 1, flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Summary */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--s-border)',
          background: 'var(--s-surface-1)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
            <span style={{
              fontFamily: 'var(--s-mono)', fontSize: 11, fontWeight: 600,
              color: 'var(--s-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              {t('stellar.batch.summary')}
            </span>
            <span style={{ fontFamily: 'var(--s-mono)', fontSize: 11, color: 'var(--s-text)' }}>
              {batch.totalEvents} {t('stellar.batch.events', { count: batch.totalEvents })}
            </span>
          </div>

          {/* Progress bar */}
          <div
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('stellar.batch.progressAriaLabel', { percent: progressPercent })}
            style={{
              width: '100%', height: 8,
              background: 'var(--s-surface-2)',
              borderRadius: 4, overflow: 'hidden', marginBottom: 12,
            }}
          >
            <div style={{
              width: `${progressPercent}%`, height: '100%',
              background: batch.status === 'completed' && batch.summary.failed === 0
                ? 'var(--s-success)'
                : batch.summary.failed > 0 ? 'var(--s-warning)' : 'var(--s-info)',
              transition: 'width 0.3s ease',
            }} />
          </div>

          {/* Breakdown */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {batch.summary.resolved > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span aria-hidden="true" style={{ color: 'var(--s-success)', fontSize: 14 }}>✓</span>
                <span style={{ fontFamily: 'var(--s-mono)', fontSize: 11, color: 'var(--s-text)' }}>
                  {batch.summary.resolved} {t('stellar.batch.resolved')}
                </span>
              </div>
            )}
            {batch.summary.failed > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span aria-hidden="true" style={{ color: 'var(--s-critical)', fontSize: 14 }}>✗</span>
                <span style={{ fontFamily: 'var(--s-mono)', fontSize: 11, color: 'var(--s-text)' }}>
                  {batch.summary.failed} {t('stellar.batch.failed')}
                </span>
              </div>
            )}
            {batch.summary.skipped > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span aria-hidden="true" style={{ color: 'var(--s-text-muted)', fontSize: 14 }}>–</span>
                <span style={{ fontFamily: 'var(--s-mono)', fontSize: 11, color: 'var(--s-text)' }}>
                  {batch.summary.skipped} {t('stellar.batch.skipped')}
                </span>
              </div>
            )}
            {batch.summary.inProgress > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span aria-hidden="true" style={{ color: 'var(--s-info)', fontSize: 14 }}>⊙</span>
                <span style={{ fontFamily: 'var(--s-mono)', fontSize: 11, color: 'var(--s-text)' }}>
                  {batch.summary.inProgress} {t('stellar.batch.inProgress')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Event list */}
        <div
          style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}
          className="s-scroll"
          aria-label={t('stellar.batch.eventListAriaLabel')}
        >
          {batch.events.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 8, padding: 40, color: 'var(--s-text-dim)',
            }}>
              <span aria-hidden="true" style={{ fontSize: 24, opacity: 0.4 }}>✦</span>
              <span style={{ fontSize: 12 }}>{t('stellar.batch.noEvents')}</span>
            </div>
          ) : (
            <div
              role="list"
              aria-label={t('stellar.batch.eventListAriaLabel')}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {batch.events.map(event => (
                <div key={event.id} role="listitem">
                  <EventRow event={event} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
