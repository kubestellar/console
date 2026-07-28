import { useEffect, useRef, useState, useMemo, useId } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { StellarNotification, StellarSolve, StellarSolveProgress } from '../../types/stellar'
import { EventRow, formatElapsedSeconds } from './BatchItemRow'
import { BatchSummary } from './BatchSummary'
import { buildLiveBatchEvents } from './BatchMonitorModal.utils'

const BATCH_UPDATE_INTERVAL_MS = 2000
const MS_PER_SECOND = 1000
const OVERLAY_Z_INDEX = 9_999

const FLEX_MIN_WIDTH_STYLE = { flex: 1, minWidth: 0 } as const

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

  const batchEvents = useMemo(
    () => buildLiveBatchEvents(notifications, batchTimestamp, solves, solveProgress),
    [notifications, batchTimestamp, solves, solveProgress],
  )

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
      className="p-4"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: OVERLAY_Z_INDEX,
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
        <div className="flex items-center gap-3 px-5 py-4" style={{
          borderBottom: '1px solid var(--s-border)',
          flexShrink: 0,
        }}>
          <div style={FLEX_MIN_WIDTH_STYLE}>
            <div className="mb-1 flex flex-wrap items-center gap-2.5">
              <h2
                id={titleId}
                style={{
                  fontFamily: 'var(--s-mono)', fontSize: 14, fontWeight: 700,
                  color: 'var(--s-text)', margin: 0,
                }}
              >
                {t('stellar.batch.title')}
              </h2>
              <span
                className="px-2 py-0.5"
                style={{
                  fontFamily: 'var(--s-mono)', fontSize: 11,
                  color: 'var(--s-text-muted)',
                  background: 'var(--s-surface-2)',
                  borderRadius: 'var(--s-rs)',
                }}
              >
                {new Date(batchTimestamp).toLocaleString()}
              </span>
              <span
                aria-live="polite"
                aria-atomic="true"
                id={statusRegionId}
                className="px-2 py-0.5"
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
                  borderRadius: 10,
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
            className="p-1"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 18, color: 'var(--s-text-dim)', lineHeight: 1, flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        <BatchSummary
          summary={batch.summary}
          totalEvents={batch.totalEvents}
          status={batch.status}
          progressPercent={progressPercent}
        />

        {/* Event list */}
        <div
          className="s-scroll flex-1 overflow-y-auto px-5 py-3"
          aria-label={t('stellar.batch.eventListAriaLabel')}
        >
          {batch.events.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-10" style={{ color: 'var(--s-text-dim)' }}>
              <span aria-hidden="true" style={{ fontSize: 24, opacity: 0.4 }}>✦</span>
              <span style={{ fontSize: 12 }}>{t('stellar.batch.noEvents')}</span>
            </div>
          ) : (
            <div
              role="list"
              aria-label={t('stellar.batch.eventListAriaLabel')}
              className="flex flex-col gap-2"
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
