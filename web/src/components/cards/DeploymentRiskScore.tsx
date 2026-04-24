/**
 * Deployment Risk Score Card
 *
 * Correlates signals from Argo CD (sync/health), Kyverno (policy violations),
 * and pod restart rates into a single 0-100 risk index per namespace.
 *
 * Higher score = higher risk.
 *
 * Issue: https://github.com/kubestellar/console/issues/9827
 *
 * TODO(#9827): Add Istio error-rate and OPA Gatekeeper constraint weights when
 * hooks for those sources land (useCachedIstio / useCachedOPA).
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { useArgoCDApplications } from '../../hooks/useArgoCD'
import { useKyverno } from '../../hooks/useKyverno'
import { useCachedAllPods } from '../../hooks/useCachedData'
import { useCardLoadingState } from './CardDataContext'
import { CardSkeleton, CardEmptyState } from '../../lib/cards/CardComponents'

// ── Scoring weights (sum = 1.0) ─────────────────────────────────────────────
// When Istio/OPA hooks arrive, redistribute weights and renormalize so the
// total still equals 1.0.
const ARGO_WEIGHT = 0.35
const KYVERNO_WEIGHT = 0.25
const POD_RESTART_WEIGHT = 0.40

// ── Risk thresholds (0-100) ─────────────────────────────────────────────────
const RISK_LOW_MAX = 30
const RISK_MEDIUM_MAX = 70

// ── Component sub-scores (0-100) ────────────────────────────────────────────
/** Argo app that is OutOfSync contributes this many points. */
const ARGO_OUT_OF_SYNC_POINTS = 50
/** Argo app that is Degraded contributes this many points. */
const ARGO_DEGRADED_POINTS = 40
/** Argo app in Progressing state contributes this many points. */
const ARGO_PROGRESSING_POINTS = 15
/** Each Kyverno violation adds this many points (capped at 100). */
const KYVERNO_POINTS_PER_VIOLATION = 10
/** Restart count that pegs pod-restart sub-score at 100. */
const POD_RESTART_SATURATION = 20
/** Restart threshold that a pod must cross to count at all. */
const POD_RESTART_MIN = 1

// ── Display ─────────────────────────────────────────────────────────────────
/** Max rows to render before truncating; user scrolls past this in drill-down. */
const MAX_ROWS = 12
/** Percentage ceiling — any sub-score is clamped here so weights sum cleanly. */
const MAX_SUB_SCORE = 100

// ── Types ───────────────────────────────────────────────────────────────────
interface NamespaceRisk {
  key: string         // "cluster/namespace"
  cluster: string
  namespace: string
  score: number       // 0-100
  argoSub: number
  kyvernoSub: number
  restartSub: number
  argoApps: number
  violations: number
  restarts: number
}

function clampScore(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > MAX_SUB_SCORE) return MAX_SUB_SCORE
  return n
}

function scoreColorClass(score: number): string {
  if (score < RISK_LOW_MAX) return 'text-green-400'
  if (score < RISK_MEDIUM_MAX) return 'text-yellow-400'
  return 'text-red-400'
}

function scoreBgClass(score: number): string {
  if (score < RISK_LOW_MAX) return 'bg-green-500/20'
  if (score < RISK_MEDIUM_MAX) return 'bg-yellow-500/20'
  return 'bg-red-500/20'
}

function scoreBarClass(score: number): string {
  if (score < RISK_LOW_MAX) return 'bg-green-400'
  if (score < RISK_MEDIUM_MAX) return 'bg-yellow-400'
  return 'bg-red-400'
}

function RiskIcon({ score }: { score: number }) {
  const cls = scoreColorClass(score)
  if (score < RISK_LOW_MAX) return <ShieldCheck className={`w-4 h-4 ${cls}`} />
  if (score < RISK_MEDIUM_MAX) return <ShieldQuestion className={`w-4 h-4 ${cls}`} />
  return <ShieldAlert className={`w-4 h-4 ${cls}`} />
}

export function DeploymentRiskScore() {
  const { t } = useTranslation('cards')

  // Consume the 3 existing data sources. Guards on `.filter` / `.forEach` are
  // mandatory because any of these hooks can return `undefined` when the
  // backend is unreachable (see CLAUDE.md — array safety).
  const argo = useArgoCDApplications()
  const kyverno = useKyverno()
  const pods = useCachedAllPods()

  const isLoading = argo.isLoading || kyverno.isLoading || pods.isLoading
  const isRefreshing = !!argo.isRefreshing || !!kyverno.isRefreshing || !!pods.isRefreshing
  const isDemoData = (!!argo.isDemoData || !!kyverno.isDemoData || !!pods.isDemoFallback) && !isLoading
  const consecutiveFailures = Math.max(
    argo.consecutiveFailures || 0,
    kyverno.consecutiveFailures || 0,
    pods.consecutiveFailures || 0,
  )
  const isFailed = !!argo.isFailed || !!pods.isFailed
  const lastRefresh = Math.max(
    argo.lastRefresh || 0,
    pods.lastRefresh || 0,
    kyverno.lastRefresh ? new Date(kyverno.lastRefresh).getTime() : 0,
  ) || null

  const rows = useMemo<NamespaceRisk[]>(() => {
    // cluster/ns -> partial accumulator
    const buckets = new Map<string, {
      cluster: string
      namespace: string
      argoApps: number
      argoSub: number
      violations: number
      restarts: number
    }>()

    const keyFor = (cluster: string, namespace: string) => `${cluster}/${namespace}`
    const getBucket = (cluster: string, namespace: string) => {
      const k = keyFor(cluster, namespace)
      let b = buckets.get(k)
      if (!b) {
        b = { cluster, namespace, argoApps: 0, argoSub: 0, violations: 0, restarts: 0 }
        buckets.set(k, b)
      }
      return b
    }

    // ── Argo CD ─────────────────────────────────────────────────────────
    for (const app of (argo.applications || [])) {
      const ns = app.namespace || 'default'
      const cl = app.cluster || 'unknown'
      const b = getBucket(cl, ns)
      b.argoApps += 1
      let points = 0
      if (app.syncStatus === 'OutOfSync') points += ARGO_OUT_OF_SYNC_POINTS
      if (app.healthStatus === 'Degraded' || app.healthStatus === 'Missing') {
        points += ARGO_DEGRADED_POINTS
      } else if (app.healthStatus === 'Progressing') {
        points += ARGO_PROGRESSING_POINTS
      }
      // Take the worst-scoring app in the namespace rather than averaging —
      // one broken app is enough to flag the whole namespace.
      if (points > b.argoSub) b.argoSub = points
    }

    // ── Kyverno policy reports ──────────────────────────────────────────
    const kyvernoStatuses = Object.values(kyverno.statuses || {})
    for (const status of kyvernoStatuses) {
      const cluster = status.cluster || 'unknown'
      for (const report of (status.reports || [])) {
        const ns = report.namespace || 'default'
        const b = getBucket(cluster, ns)
        // Use `fail` count directly — this is the #violations per namespace
        // that Kyverno surfaces via PolicyReport.
        b.violations += (report.fail || 0)
      }
    }

    // ── Pod restarts ────────────────────────────────────────────────────
    for (const pod of (pods.pods || [])) {
      if ((pod.restarts || 0) < POD_RESTART_MIN) continue
      const cluster = pod.cluster || 'unknown'
      const ns = pod.namespace || 'default'
      const b = getBucket(cluster, ns)
      b.restarts += (pod.restarts || 0)
    }

    // ── Finalize — compute weighted score ───────────────────────────────
    const out: NamespaceRisk[] = []
    for (const b of buckets.values()) {
      const argoSub = clampScore(b.argoSub)
      const kyvernoSub = clampScore(b.violations * KYVERNO_POINTS_PER_VIOLATION)
      const restartSub = clampScore((b.restarts / POD_RESTART_SATURATION) * MAX_SUB_SCORE)
      const score = Math.round(
        argoSub * ARGO_WEIGHT +
        kyvernoSub * KYVERNO_WEIGHT +
        restartSub * POD_RESTART_WEIGHT
      )
      out.push({
        key: keyFor(b.cluster, b.namespace),
        cluster: b.cluster,
        namespace: b.namespace,
        score,
        argoSub,
        kyvernoSub,
        restartSub,
        argoApps: b.argoApps,
        violations: b.violations,
        restarts: b.restarts,
      })
    }

    return out.sort((a, b) => b.score - a.score)
  }, [argo.applications, kyverno.statuses, pods.pods])

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && rows.length === 0,
    isRefreshing,
    isDemoData,
    hasAnyData: rows.length > 0,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  })

  if (showSkeleton) {
    return <CardSkeleton type="list" rows={5} />
  }

  if (showEmptyState) {
    return (
      <CardEmptyState
        icon={ShieldCheck}
        title={t('deploymentRiskScore.emptyTitle')}
        message={t('deploymentRiskScore.empty')}
        variant="success"
      />
    )
  }

  const visible = rows.slice(0, MAX_ROWS)
  const hidden = rows.length - visible.length

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t('deploymentRiskScore.legend')}</span>
        <span className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-400" />{t('deploymentRiskScore.low')}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-400" />{t('deploymentRiskScore.medium')}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400" />{t('deploymentRiskScore.high')}
          </span>
        </span>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto">
        {(visible || []).map(row => (
          <div
            key={row.key}
            className={`flex items-center gap-3 px-2 py-1.5 rounded ${scoreBgClass(row.score)}`}
          >
            <RiskIcon score={row.score} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs">
                <span className="truncate font-medium">{row.namespace}</span>
                <span className="text-muted-foreground/70 truncate">{row.cluster}</span>
              </div>
              <div className="mt-0.5 h-1 rounded-full bg-secondary/40 overflow-hidden">
                <div
                  className={`h-full ${scoreBarClass(row.score)}`}
                  style={{ width: `${row.score}%` }}
                />
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {t('deploymentRiskScore.breakdown', {
                  argo: row.argoApps,
                  violations: row.violations,
                  restarts: row.restarts,
                })}
              </div>
            </div>
            <span className={`text-sm font-semibold tabular-nums ${scoreColorClass(row.score)}`}>
              {row.score}
            </span>
          </div>
        ))}
      </div>

      {hidden > 0 && (
        <p className="text-[10px] text-muted-foreground italic">
          {t('deploymentRiskScore.more', { count: hidden })}
        </p>
      )}
    </div>
  )
}

export default DeploymentRiskScore
