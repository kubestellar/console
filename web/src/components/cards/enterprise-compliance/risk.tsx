/**
 * Risk cards: risk matrix, risk register, and risk appetite.
 */
import { Scale } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCardLoadingState } from '../CardDataContext'
import { useSummaryData, CardShell, MiniStat } from './shared'

// ── Risk Matrix Card ─────────────────────────────────────────────────────────────

export function RiskMatrixCard() {
  const nav = useNavigate()
  const { data, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, error } = useSummaryData<Record<string, number>>('/api/v1/compliance/erm/risk-matrix/summary')
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !data,
    hasAnyData: data != null,
    isRefreshing,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })
  return (
    <CardShell title="Risk Matrix" icon={Scale} onClick={() => nav('/enterprise/risk-matrix')}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : showSkeleton ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : showEmptyState || !data ? (
        <p className="text-muted-foreground text-sm">No data</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Total Risks" value={data.total_risks ?? 0} />
          <MiniStat label="Critical" value={data.critical ?? 0} color="text-red-400" />
          <MiniStat label="High" value={data.high ?? 0} color="text-red-300" />
          <MiniStat label="Medium" value={data.medium ?? 0} color="text-orange-400" />
        </div>
      )}
    </CardShell>
  )
}

// ── Risk Register Card ───────────────────────────────────────────────────────────

export function RiskRegisterCard() {
  const nav = useNavigate()
  const { data, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, error } = useSummaryData<Record<string, number>>('/api/v1/compliance/erm/risk-register/summary')
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !data,
    hasAnyData: data != null,
    isRefreshing,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })
  return (
    <CardShell title="Risk Register" icon={Scale} onClick={() => nav('/enterprise/risk-register')}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : showSkeleton ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : showEmptyState || !data ? (
        <p className="text-muted-foreground text-sm">No data</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Open Risks" value={data.open_risks ?? 0} color="text-yellow-400" />
          <MiniStat label="Overdue" value={data.overdue_reviews ?? 0} color="text-red-400" />
          <MiniStat label="Total" value={data.total_risks ?? 0} />
          <MiniStat label="Avg Score" value={Number(data.avg_risk_score ?? 0).toFixed(1)} color="text-orange-400" />
        </div>
      )}
    </CardShell>
  )
}

// ── Risk Appetite Card ───────────────────────────────────────────────────────────

export function RiskAppetiteCard() {
  const nav = useNavigate()
  const { data, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, error } = useSummaryData<Record<string, number>>('/api/v1/compliance/erm/risk-appetite/summary')
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !data,
    hasAnyData: data != null,
    isRefreshing,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })
  return (
    <CardShell title="Risk Appetite" icon={Scale} onClick={() => nav('/enterprise/risk-appetite')}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : showSkeleton ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : showEmptyState || !data ? (
        <p className="text-muted-foreground text-sm">No data</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Breaches" value={data.breaches ?? 0} color="text-red-400" />
          <MiniStat label="KRIs" value={data.total_kris ?? 0} />
          <MiniStat label="Within" value={data.within_appetite ?? 0} color="text-green-400" />
          <MiniStat label="KRI Breach" value={data.kri_breaches ?? 0} color="text-red-400" />
        </div>
      )}
    </CardShell>
  )
}
