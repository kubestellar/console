/**
 * Government / security posture cards: NIST 800-53, DISA STIG, air-gap
 * readiness, and FedRAMP.
 */
import { Shield, WifiOff, Award } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCardLoadingState } from '../CardDataContext'
import { useSummaryData, ScoreRing, CardShell, MiniStat } from './shared'

// ── NIST 800-53 Card ─────────────────────────────────────────────────────────────

export function NISTCard() {
  const nav = useNavigate()
  const { data, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, error } = useSummaryData<Record<string, number>>('/api/compliance/nist/summary')
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !data,
    hasAnyData: data != null,
    isRefreshing,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })
  return (
    <CardShell title="NIST 800-53" icon={Shield} onClick={() => nav('/nist')}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : showSkeleton ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : showEmptyState || !data ? (
        <p className="text-muted-foreground text-sm">No data</p>
      ) : (
        <div className="flex items-center gap-4">
          <ScoreRing score={data.overall_score ?? 0} />
          <div className="grid grid-cols-2 gap-2 flex-1">
            <MiniStat label="Implemented" value={data.implemented_controls ?? 0} color="text-green-400" />
            <MiniStat label="Partial" value={data.partial_controls ?? 0} color="text-yellow-400" />
            <MiniStat label="Planned" value={data.planned_controls ?? 0} color="text-blue-400" />
            <MiniStat label="Total" value={data.total_controls ?? 0} />
          </div>
        </div>
      )}
    </CardShell>
  )
}

// ── STIG Card ───────────────────────────────────────────────────────────────────

export function STIGCard() {
  const nav = useNavigate()
  const { data, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, error } = useSummaryData<Record<string, number>>('/api/compliance/stig/summary')
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !data,
    hasAnyData: data != null,
    isRefreshing,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })
  return (
    <CardShell title="DISA STIG" icon={Shield} onClick={() => nav('/stig')}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : showSkeleton ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : showEmptyState || !data ? (
        <p className="text-muted-foreground text-sm">No data</p>
      ) : (
        <div className="flex items-center gap-4">
          <ScoreRing score={data.compliance_score ?? 0} />
          <div className="grid grid-cols-2 gap-2 flex-1">
            <MiniStat label="Findings" value={data.total_findings ?? 0} />
            <MiniStat label="Open" value={data.open ?? 0} color="text-red-400" />
            <MiniStat label="CAT I Open" value={data.cat_i_open ?? 0} color="text-red-400" />
            <MiniStat label="Not a Finding" value={data.not_a_finding ?? 0} color="text-green-400" />
          </div>
        </div>
      )}
    </CardShell>
  )
}

// ── Air-Gap Card ────────────────────────────────────────────────────────────────

export function AirGapCard() {
  const nav = useNavigate()
  const { data, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, error } = useSummaryData<Record<string, number>>('/api/compliance/airgap/summary')
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !data,
    hasAnyData: data != null,
    isRefreshing,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })
  return (
    <CardShell title="Air-Gap Readiness" icon={WifiOff} onClick={() => nav('/air-gap')}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : showSkeleton ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : showEmptyState || !data ? (
        <p className="text-muted-foreground text-sm">No data</p>
      ) : (
        <div className="flex items-center gap-4">
          <ScoreRing score={data.overall_score ?? 0} />
          <div className="grid grid-cols-2 gap-2 flex-1">
            <MiniStat label="Clusters Ready" value={data.ready_clusters ?? 0} color="text-green-400" />
            <MiniStat label="Not Ready" value={data.not_ready_clusters ?? 0} color="text-red-400" />
            <MiniStat label="Requirements" value={data.total_requirements ?? 0} />
            <MiniStat label="Met" value={data.met_requirements ?? 0} color="text-green-400" />
          </div>
        </div>
      )}
    </CardShell>
  )
}

// ── FedRAMP Card ───────────────────────────────────────────────────────────────

export function FedRAMPCard() {
  const nav = useNavigate()
  const { data, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, error } = useSummaryData<Record<string, unknown>>('/api/compliance/fedramp/score')
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !data,
    hasAnyData: data != null,
    isRefreshing,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })
  return (
    <CardShell title="FedRAMP Readiness" icon={Award} onClick={() => nav('/fedramp')}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : showSkeleton ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : showEmptyState || !data ? (
        <p className="text-muted-foreground text-sm">No data</p>
      ) : (
        <div className="flex items-center gap-4">
          <ScoreRing score={Number(data.overall_score ?? 0)} />
          <div className="grid grid-cols-2 gap-2 flex-1">
            <MiniStat label="Satisfied" value={Number(data.satisfied_controls ?? 0)} color="text-green-400" />
            <MiniStat label="Partial" value={Number(data.partial_controls ?? 0)} color="text-yellow-400" />
            <MiniStat label="Open POAMs" value={Number(data.open_poams ?? 0)} color="text-red-400" />
            <MiniStat label="Status" value={String(data.authorization_status ?? 'unknown').replace(/_/g, ' ')} color={
              ({ authorized: 'text-green-400', in_process: 'text-orange-400', in_progress: 'text-orange-400', pending: 'text-yellow-400' } as Record<string, string>)[String(data.authorization_status ?? '')] ?? 'text-foreground'
            } />
          </div>
        </div>
      )}
    </CardShell>
  )
}
