/**
 * Identity cards: OIDC federation, RBAC audit, and session management.
 */
import { KeyRound, Lock, Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCardLoadingState } from '../CardDataContext'
import { TechnicalAcronym } from '../../shared/TechnicalAcronym'
import { ScoreRing, CardShell, MiniStat } from './shared'
import { useSummaryData } from './useSummaryData'

// ── OIDC Federation Card ───────────────────────────────────────────────────

export function OIDCFederationCard() {
  const nav = useNavigate()
  const { data, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, error } = useSummaryData<Record<string, number>>('/api/identity/oidc/summary')
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !data,
    hasAnyData: data != null,
    isRefreshing,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })
  return (
    <CardShell title="OIDC Federation" icon={KeyRound} onClick={() => nav('/enterprise/oidc')}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : showSkeleton ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : showEmptyState || !data ? (
        <p className="text-muted-foreground text-sm">No data</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Providers" value={`${data.active_providers ?? 0}/${data.total_providers ?? 0}`} color="text-blue-400" />
          <MiniStat label="Users" value={data.total_users ?? 0} />
          <MiniStat label="Sessions" value={data.active_sessions ?? 0} color="text-green-400" />
          <MiniStat label="MFA" value={`${data.mfa_adoption ?? 0}%`} color="text-cyan-400" />
        </div>
      )}
    </CardShell>
  )
}

// ── RBAC Audit Card ───────────────────────────────────────────────────────────

export function RBACAuditCard() {
  const nav = useNavigate()
  const { data, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, error } = useSummaryData<Record<string, number>>('/api/identity/rbac/summary')
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !data,
    hasAnyData: data != null,
    isRefreshing,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })
  return (
    <CardShell title={<><TechnicalAcronym term="RBAC" /> Audit</>} icon={Lock} onClick={() => nav('/enterprise/rbac-audit')}>
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
            <MiniStat label="Bindings" value={data.total_bindings ?? 0} />
            <MiniStat label="Over-Priv" value={data.over_privileged ?? 0} color="text-red-400" />
            <MiniStat label="Unused" value={data.unused_bindings ?? 0} color="text-yellow-400" />
            <MiniStat label="Score" value={`${data.compliance_score ?? 0}%`} color="text-green-400" />
          </div>
        </div>
      )}
    </CardShell>
  )
}

// ── Session Management Card ──────────────────────────────────────────────────

export function SessionManagementCard() {
  const nav = useNavigate()
  const { data, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, error } = useSummaryData<Record<string, number>>('/api/identity/sessions/summary')
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !data,
    hasAnyData: data != null,
    isRefreshing,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })
  return (
    <CardShell title="Session Management" icon={Clock} onClick={() => nav('/enterprise/sessions')}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : showSkeleton ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : showEmptyState || !data ? (
        <p className="text-muted-foreground text-sm">No data</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Active" value={data.active_sessions ?? 0} color="text-blue-400" />
          <MiniStat label="Users" value={data.unique_users ?? 0} />
          <MiniStat label="Avg Duration" value={`${data.avg_duration_minutes ?? 0}m`} />
          <MiniStat label="Violations" value={data.policy_violations ?? 0} color={data.policy_violations > 0 ? 'text-red-400' : 'text-green-400'} />
        </div>
      )}
    </CardShell>
  )
}
