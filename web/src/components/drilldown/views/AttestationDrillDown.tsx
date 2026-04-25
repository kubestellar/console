/**
 * Attestation Drill-Down View — Issue #9987
 *
 * Shows per-cluster signal breakdown and lists non-compliant workloads that
 * pull the attestation score down. Opened from RuntimeAttestationCard when
 * clicking a cluster row.
 */

import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Search,
  X,
} from 'lucide-react'
import { cn } from '../../../lib/cn'
import {
  SCORE_THRESHOLD_HIGH,
  SCORE_THRESHOLD_MEDIUM,
  type ClusterAttestationScore,
  type AttestationSignal,
  type NonCompliantWorkload,
} from '../../../hooks/useCachedAttestation'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Full percentage for display/math. */
const FULL_PERCENTAGE = 100

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= SCORE_THRESHOLD_HIGH) return 'text-green-400'
  if (score >= SCORE_THRESHOLD_MEDIUM) return 'text-yellow-400'
  return 'text-red-400'
}

function scoreBgColor(score: number): string {
  if (score >= SCORE_THRESHOLD_HIGH) return 'bg-green-500/15 border-green-500/30'
  if (score >= SCORE_THRESHOLD_MEDIUM) return 'bg-yellow-500/15 border-yellow-500/30'
  return 'bg-red-500/15 border-red-500/30'
}

function scoreBarColor(score: number): string {
  if (score >= SCORE_THRESHOLD_HIGH) return 'bg-green-500'
  if (score >= SCORE_THRESHOLD_MEDIUM) return 'bg-yellow-500'
  return 'bg-red-500'
}

function scoreIcon(score: number) {
  if (score >= SCORE_THRESHOLD_HIGH) return <CheckCircle className="w-5 h-5 text-green-400" />
  if (score >= SCORE_THRESHOLD_MEDIUM) return <AlertTriangle className="w-5 h-5 text-yellow-400" />
  return <XCircle className="w-5 h-5 text-red-400" />
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SignalRow({ signal }: { signal: AttestationSignal }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/20">
      {scoreIcon(signal.score)}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">{signal.name}</p>
          <span className={cn('text-sm font-semibold tabular-nums', scoreColor(signal.score))}>
            {signal.score}/{FULL_PERCENTAGE}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', scoreBarColor(signal.score))}
              style={{ width: `${signal.score}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {signal.weight}%
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{signal.detail}</p>
      </div>
    </div>
  )
}

function WorkloadRow({ workload }: { workload: NonCompliantWorkload }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-secondary/10">
      <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{workload.name}</p>
        <p className="text-xs text-muted-foreground">
          {workload.namespace} &middot; {workload.signal}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{workload.reason}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  data: Record<string, unknown>
}

export function AttestationDrillDown({ data }: Props) {
  const { t } = useTranslation('cards')
  const cluster = data.cluster as ClusterAttestationScore | undefined
  const [searchQuery, setSearchQuery] = useState('')

  if (!cluster) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <ShieldCheck className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          {t('runtimeAttestation.noData')}
        </p>
      </div>
    )
  }

  const signals: AttestationSignal[] = cluster.signals || []
  const allWorkloads: NonCompliantWorkload[] = cluster.nonCompliantWorkloads || []

  const filteredWorkloads = useMemo(() => {
    if (!searchQuery.trim()) return allWorkloads
    const q = searchQuery.toLowerCase()
    return allWorkloads.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.namespace.toLowerCase().includes(q) ||
        w.signal.toLowerCase().includes(q) ||
        w.reason.toLowerCase().includes(q),
    )
  }, [allWorkloads, searchQuery])

  return (
    <div className="space-y-6 p-4">
      {/* Overall score header */}
      <div className={cn('flex items-center gap-4 p-4 rounded-xl border', scoreBgColor(cluster.overallScore))}>
        {scoreIcon(cluster.overallScore)}
        <div className="flex-1">
          <p className="text-lg font-semibold text-foreground">
            {t('runtimeAttestation.overallScore')}
          </p>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex-1 h-2.5 rounded-full bg-secondary overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', scoreBarColor(cluster.overallScore))}
                style={{ width: `${cluster.overallScore}%` }}
              />
            </div>
            <span className={cn('text-xl font-bold tabular-nums', scoreColor(cluster.overallScore))}>
              {cluster.overallScore}/{FULL_PERCENTAGE}
            </span>
          </div>
        </div>
      </div>

      {/* Signal breakdown */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">
          {t('runtimeAttestation.signalBreakdown')}
        </h3>
        <div className="space-y-2">
          {signals.map((signal) => (
            <SignalRow key={signal.name} signal={signal} />
          ))}
        </div>
      </div>

      {/* Non-compliant workloads */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">
            {t('runtimeAttestation.nonCompliantWorkloads', { count: allWorkloads.length })}
          </h3>
        </div>

        {/* Search */}
        {allWorkloads.length > 0 && (
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('runtimeAttestation.searchWorkloads')}
              className="w-full pl-9 pr-8 py-2 text-sm rounded-lg bg-secondary/40 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-secondary rounded"
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            )}
          </div>
        )}

        {filteredWorkloads.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {allWorkloads.length === 0
              ? t('runtimeAttestation.allCompliant')
              : t('runtimeAttestation.noMatchingWorkloads')}
          </p>
        ) : (
          <div className="space-y-2">
            {filteredWorkloads.map((w, i) => (
              <WorkloadRow key={`${w.name}-${w.namespace}-${i}`} workload={w} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default AttestationDrillDown
