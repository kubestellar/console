/**
 * SecOps cards: SIEM integration, incident response, and threat
 * intelligence.
 */
import { Activity, Shield } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCardLoadingState } from '../CardDataContext'
import { ScoreRing, CardShell, MiniStat } from './shared'
import { useSummaryData } from './useSummaryData'

// ── SIEM Integration Card ───────────────────────────────────────────────

export function SIEMIntegrationCard() {
  const nav = useNavigate()
  const { data, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, error } = useSummaryData<Record<string, number>>('/api/v1/compliance/siem/summary')
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !data,
    hasAnyData: data != null,
    isRefreshing,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })
  return (
    <CardShell title="SIEM Integration" icon={Activity} onClick={() => nav('/enterprise/siem')}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : showSkeleton ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : showEmptyState || !data ? (
        <p className="text-muted-foreground text-sm">No data</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Events (24h)" value={(data.events_last_24h ?? 0).toLocaleString()} />
          <MiniStat label="Total Alerts" value={data.total_alerts ?? 0} />
          <MiniStat label="Critical" value={data.critical_alerts ?? 0} color="text-red-400" />
          <MiniStat label="Active" value={data.active_alerts ?? 0} color="text-yellow-400" />
        </div>
      )}
    </CardShell>
  )
}

// ── Incident Response Card ──────────────────────────────────────────────────

export function IncidentResponseCard() {
  const nav = useNavigate()
  const { data, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, error } = useSummaryData<Record<string, unknown>>('/api/v1/compliance/incidents/metrics')
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !data,
    hasAnyData: data != null,
    isRefreshing,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })
  return (
    <CardShell title="Incident Response" icon={Shield} onClick={() => nav('/enterprise/incident-response')}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : showSkeleton ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : showEmptyState || !data ? (
        <p className="text-muted-foreground text-sm">No data</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Active" value={Number(data.active_incidents ?? 0)} color="text-red-400" />
          <MiniStat label="MTTR" value={`${Number(data.mttr_hours ?? 0)}h`} />
          <MiniStat label="Resolved (30d)" value={Number(data.resolved_last_30d ?? 0)} color="text-green-400" />
          <MiniStat label="Escalation" value={`${Number(data.escalation_rate ?? 0)}%`} color="text-yellow-400" />
        </div>
      )}
    </CardShell>
  )
}

// ── Threat Intelligence Card ──────────────────────────────────────────────────

export function ThreatIntelCard() {
  const nav = useNavigate()
  const { data, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, error } = useSummaryData<Record<string, number>>('/api/v1/compliance/threat-intel/summary')
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !data,
    hasAnyData: data != null,
    isRefreshing,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })
  return (
    <CardShell title="Threat Intelligence" icon={Shield} onClick={() => nav('/enterprise/threat-intel')}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : showSkeleton ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : showEmptyState || !data ? (
        <p className="text-muted-foreground text-sm">No data</p>
      ) : (
        <div className="flex items-center gap-4">
          <ScoreRing score={100 - (data.risk_score ?? 0)} />
          <div className="grid grid-cols-2 gap-2 flex-1">
            <MiniStat label="Active Feeds" value={data.active_feeds ?? 0} color="text-green-400" />
            <MiniStat label="IOC Matches" value={data.active_matches ?? 0} color="text-red-400" />
            <MiniStat label="Indicators" value={(data.total_indicators ?? 0).toLocaleString()} />
            <MiniStat label="Risk Score" value={data.risk_score ?? 0} color="text-yellow-400" />
          </div>
        </div>
      )}
    </CardShell>
  )
}
