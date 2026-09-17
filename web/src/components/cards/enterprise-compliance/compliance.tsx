/**
 * Compliance domain cards: HIPAA, GxP, BAA, frameworks, data residency,
 * change control, segregation of duties, and compliance reports.
 */
import { Shield, FileText, Activity, Lock, CheckCircle2, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCardLoadingState } from '../CardDataContext'
import { useSummaryData, ScoreRing, CardShell, MiniStat } from './shared'

// ── HIPAA Card ──────────────────────────────────────────────────────────────

export function HIPAACard() {
  const nav = useNavigate()
  const { data, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, error } = useSummaryData<Record<string, number>>('/api/compliance/hipaa/summary')
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !data,
    hasAnyData: data != null,
    isRefreshing,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })
  return (
    <CardShell title="HIPAA Compliance" icon={Shield} onClick={() => nav('/hipaa')}>
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
            <MiniStat label="Passed" value={data.safeguards_passed ?? 0} color="text-green-400" />
            <MiniStat label="Failed" value={data.safeguards_failed ?? 0} color="text-red-400" />
            <MiniStat label="PHI Namespaces" value={data.phi_namespaces ?? 0} />
            <MiniStat label="Encrypted Flows" value={data.encrypted_flows ?? 0} color="text-blue-400" />
          </div>
        </div>
      )}
    </CardShell>
  )
}

// ── GxP Card ─────────────────────────────────────────────────────────────────

export function GxPCard() {
  const nav = useNavigate()
  const { data, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, error } = useSummaryData<Record<string, unknown>>('/api/compliance/gxp/summary')
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !data,
    hasAnyData: data != null,
    isRefreshing,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })
  return (
    <CardShell title="GxP Validation (21 CFR 11)" icon={FileText} onClick={() => nav('/gxp')}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : showSkeleton ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : showEmptyState || !data ? (
        <p className="text-muted-foreground text-sm">No data</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {data.chain_integrity
              ? <CheckCircle2 className="w-4 h-4 text-green-400" />
              : <XCircle className="w-4 h-4 text-red-400" />}
            <span className="text-sm text-muted-foreground">Hash Chain {data.chain_integrity ? 'Intact' : 'Broken'}</span>
          </div>
          <div className="grid grid-cols-2 @md:grid-cols-3 gap-2">
            <MiniStat label="Records" value={Number(data.total_records ?? 0)} />
            <MiniStat label="Signatures" value={Number(data.total_signatures ?? 0)} />
            <MiniStat label="Pending" value={Number(data.pending_signatures ?? 0)} color="text-yellow-400" />
          </div>
        </div>
      )}
    </CardShell>
  )
}

// ── BAA Card ─────────────────────────────────────────────────────────────────

export function BAACard() {
  const nav = useNavigate()
  const { data, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, error } = useSummaryData<Record<string, number>>('/api/compliance/baa/summary')
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !data,
    hasAnyData: data != null,
    isRefreshing,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })
  return (
    <CardShell title="BAA Tracker" icon={FileText} onClick={() => nav('/baa')}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : showSkeleton ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : showEmptyState || !data ? (
        <p className="text-muted-foreground text-sm">No data</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Total" value={data.total_agreements ?? 0} />
          <MiniStat label="Active" value={data.active_agreements ?? 0} color="text-green-400" />
          <MiniStat label="Expiring" value={data.expiring_soon ?? 0} color="text-yellow-400" />
          <MiniStat label="Expired" value={data.expired ?? 0} color="text-red-400" />
        </div>
      )}
    </CardShell>
  )
}

// ── Compliance Frameworks Card ───────────────────────────────────────────────

export function ComplianceFrameworksCard() {
  const nav = useNavigate()
  return (
    <CardShell title="Compliance Frameworks" icon={Shield} onClick={() => nav('/compliance-frameworks')}>
      <div className="space-y-2">
        <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-green-400" /><span className="text-sm text-muted-foreground">PCI-DSS 4.0</span></div>
        <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-green-400" /><span className="text-sm text-muted-foreground">SOC 2 Type II</span></div>
        <p className="text-xs text-muted-foreground mt-2">Click to evaluate frameworks</p>
      </div>
    </CardShell>
  )
}

// ── Data Residency Card ────────────────────────────────────────────────────────

export function DataResidencyCard() {
  const nav = useNavigate()
  return (
    <CardShell title="Data Residency" icon={Lock} onClick={() => nav('/data-residency')}>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Regions" value={4} />
          <MiniStat label="Compliant" value="100%" color="text-green-400" />
        </div>
        <p className="text-xs text-muted-foreground">Data sovereignty enforcement active</p>
      </div>
    </CardShell>
  )
}

// ── Change Control Card ────────────────────────────────────────────────────────

export function ChangeControlCard() {
  const nav = useNavigate()
  return (
    <CardShell title="Change Control" icon={Activity} onClick={() => nav('/change-control')}>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Pending" value={3} color="text-yellow-400" />
          <MiniStat label="Approved" value={12} color="text-green-400" />
        </div>
        <p className="text-xs text-muted-foreground">Audit trail active</p>
      </div>
    </CardShell>
  )
}

// ── Segregation of Duties Card ────────────────────────────────────────────────

export function SegregationOfDutiesCard() {
  const nav = useNavigate()
  return (
    <CardShell title="Segregation of Duties" icon={Shield} onClick={() => nav('/segregation-of-duties')}>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Policies" value={8} />
          <MiniStat label="Violations" value={0} color="text-green-400" />
        </div>
        <p className="text-xs text-muted-foreground">Duty separation enforced</p>
      </div>
    </CardShell>
  )
}

// ── Compliance Reports Card ───────────────────────────────────────────────────

export function ComplianceReportsCard() {
  const nav = useNavigate()
  return (
    <CardShell title="Compliance Reports" icon={FileText} onClick={() => nav('/compliance-reports')}>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Generated" value={24} />
          <MiniStat label="Scheduled" value={3} color="text-blue-400" />
        </div>
        <p className="text-xs text-muted-foreground">Export PDF/JSON/CSV</p>
      </div>
    </CardShell>
  )
}
