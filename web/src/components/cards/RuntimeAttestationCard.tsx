/**
 * Runtime Attestation Score Card — Issue #9987
 *
 * Displays a composite 0-100 trust score per cluster derived from four CNCF
 * signals: image provenance (TUF), workload identity (SPIFFE/SPIRE), policy
 * compliance (Kyverno), and runtime privilege posture.
 *
 * Clicking a cluster row opens a drill-down showing the per-signal breakdown
 * and which specific workloads are pulling the score down.
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ShieldCheck,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { useCardLoadingState } from './CardDataContext'
import { useDrillDown } from '../../hooks/useDrillDown'
import {
  useCachedAttestation,
  SCORE_THRESHOLD_HIGH,
  SCORE_THRESHOLD_MEDIUM,
  type ClusterAttestationScore,
} from '../../hooks/useCachedAttestation'
import { cn } from '../../lib/cn'
import { Skeleton } from '../ui/Skeleton'
import { AttestationDrillDown } from '../drilldown/views/AttestationDrillDown'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

/** Number of skeleton rows to display during initial load. */
const SKELETON_ROW_COUNT = 4

/** Height of the skeleton title block (px). */
const SKELETON_TITLE_WIDTH = 160
const SKELETON_TITLE_HEIGHT = 28

/** Width of the score badge skeleton (px). */
const SKELETON_BADGE_WIDTH = 48
const SKELETON_BADGE_HEIGHT = 24

/** Full percentage for the progress bar denominator. */
const FULL_PERCENTAGE = 100

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= SCORE_THRESHOLD_HIGH) return 'text-green-400'
  if (score >= SCORE_THRESHOLD_MEDIUM) return 'text-yellow-400'
  return 'text-red-400'
}

function scoreBarColor(score: number): string {
  if (score >= SCORE_THRESHOLD_HIGH) return 'bg-green-500'
  if (score >= SCORE_THRESHOLD_MEDIUM) return 'bg-yellow-500'
  return 'bg-red-500'
}

function scoreIcon(score: number) {
  if (score >= SCORE_THRESHOLD_HIGH) return <CheckCircle className="w-4 h-4 text-green-400" />
  if (score >= SCORE_THRESHOLD_MEDIUM) return <AlertTriangle className="w-4 h-4 text-yellow-400" />
  return <XCircle className="w-4 h-4 text-red-400" />
}

/** Compute fleet-wide average score from clusters. */
function computeFleetAverage(clusters: ClusterAttestationScore[]): number {
  if (clusters.length === 0) return 0
  const sum = clusters.reduce((acc, c) => acc + c.overallScore, 0)
  return Math.round(sum / clusters.length)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RuntimeAttestationCard() {
  const { t } = useTranslation('cards')
  const { open } = useDrillDown()

  const {
    data,
    isLoading,
    isRefreshing,
    isDemoData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  } = useCachedAttestation()

  const hasAnyData = (data.clusters || []).length > 0

  useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    isDemoData,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  })

  const clusters = useMemo(() => data.clusters || [], [data.clusters])
  const fleetAverage = useMemo(() => computeFleetAverage(clusters), [clusters])

  const handleClusterClick = (cluster: ClusterAttestationScore) => {
    open({
      type: 'custom',
      title: t('runtimeAttestation.drillDownTitle', { cluster: cluster.cluster }),
      subtitle: t('runtimeAttestation.drillDownSubtitle'),
      data: { cluster },
      customComponent: <AttestationDrillDown data={{ cluster }} />,
    })
  }

  // ── Loading skeleton ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton width={SKELETON_TITLE_WIDTH} height={SKELETON_TITLE_HEIGHT} />
        {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
          <div key={i} className="flex flex-wrap items-center justify-between gap-y-2">
            <Skeleton width={SKELETON_TITLE_WIDTH} height={SKELETON_BADGE_HEIGHT} />
            <Skeleton width={SKELETON_BADGE_WIDTH} height={SKELETON_BADGE_HEIGHT} />
          </div>
        ))}
      </div>
    )
  }

  // ── Empty state ─────────────────────────────────────────────────────────
  if (clusters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center">
        <ShieldCheck className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          {t('runtimeAttestation.noData')}
        </p>
      </div>
    )
  }

  // ── Main content ────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 p-1">
      {/* Fleet average banner */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
        <ShieldCheck className={cn('w-6 h-6', scoreColor(fleetAverage))} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">
            {t('runtimeAttestation.fleetAverage')}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', scoreBarColor(fleetAverage))}
                style={{ width: `${fleetAverage}%` }}
              />
            </div>
            <span className={cn('text-sm font-semibold tabular-nums', scoreColor(fleetAverage))}>
              {fleetAverage}/{FULL_PERCENTAGE}
            </span>
          </div>
        </div>
      </div>

      {/* Per-cluster rows */}
      <div className="space-y-1">
        {clusters.map((cluster) => (
          <button
            key={cluster.cluster}
            onClick={() => handleClusterClick(cluster)}
            className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/40 transition-colors text-left group"
          >
            {scoreIcon(cluster.overallScore)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {cluster.cluster}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', scoreBarColor(cluster.overallScore))}
                    style={{ width: `${cluster.overallScore}%` }}
                  />
                </div>
                <span className={cn('text-xs tabular-nums', scoreColor(cluster.overallScore))}>
                  {cluster.overallScore}
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
      </div>
    </div>
  )
}

export default RuntimeAttestationCard
