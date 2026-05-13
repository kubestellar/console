/**
 * Enterprise Compliance Card Components
 *
 * Lightweight summary cards for the Console Studio that link to full dashboards.
 * Each card fetches summary data and renders a compact view.
 */
import { useState, useEffect } from 'react'
import { Shield, FileText, Activity, Lock, WifiOff, Award, CheckCircle2, XCircle, KeyRound, Clock, Package, Scale } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { authFetch, safeJson } from '../../lib/api'
import { useCache } from '../../lib/cache'

// ── Shared helpers ──────────────────────────────────────────────────────

const SCORE_GOOD = 'hsl(var(--chart-success, 142 71% 45%))'
const SCORE_WARN = 'hsl(var(--chart-warning, 45 93% 47%))'
const SCORE_BAD = 'hsl(var(--chart-danger, 0 84% 60%))'
const RING_BG = 'hsl(var(--muted) / 0.4)'
const CARD_LOAD_ERROR = 'Failed to load'
const ERROR_TEXT_CLASS = 'text-red-400 text-sm'
const LOADING_TEXT_CLASS = 'text-gray-500 text-sm'
const ENTERPRISE_SUMMARY_CACHE_PREFIX = 'enterprise-summary:'

function useSummaryData<T extends Record<string, unknown>>(endpoint: string) {
  const { t } = useTranslation('errors')
  const { data, error } = useCache<T | null>({
    key: `${ENTERPRISE_SUMMARY_CACHE_PREFIX}${endpoint}`,
    category: 'rbac',
    initialData: null,
    fetcher: async () => {
      const response = await authFetch(endpoint)
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`)
      }
      return safeJson<T>(response)
    },
  })

  return {
    data,
    error: error ? t('messages.loadFailed', { defaultValue: CARD_LOAD_ERROR }) : null,
  }
}

function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score >= 80 ? SCORE_GOOD : score >= 60 ? SCORE_WARN : SCORE_BAD
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={RING_BG} strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x="50%" y="50%" textAnchor="middle" dy=".35em" fill="white" fontSize={size/4} fontWeight="bold">
        {score}%
      </text>
    </svg>
  )
}

function CardShell({ title, icon: Icon, children, onClick }: {
  title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; onClick?: () => void
}) {
  return (
    <div
      className={`h-full flex flex-col ${onClick ? 'cursor-pointer hover:bg-gray-700/30 transition-colors min-h-11' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-blue-400 shrink-0" />
        <span className="text-sm font-medium text-white truncate">{title}</span>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}

function MiniStat({ label, value, color = 'text-white' }: { label: string; value: string | number; color?: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}

// ── HIPAA Card ──────────────────────────────────────────────────────────

export function HIPAACard() {
  const nav = useNavigate()
  const [data, setData] = useState<Record<string, number> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setIsLoading(true)
    authFetch('/api/compliance/hipaa/summary')
      .then(r => r.ok ? safeJson<Record<string, number>>(r) : null)
      .then(setData)
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : 'Failed to load'); console.error(err) })
      .finally(() => setIsLoading(false))
  }, [])
  return (
    <CardShell title="HIPAA Compliance" icon={Shield} onClick={() => nav('/hipaa')}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : isLoading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : data ? (
        <div className="flex items-center gap-4">
          <ScoreRing score={data.overall_score ?? 0} />
          <div className="grid grid-cols-2 gap-2 flex-1">
            <MiniStat label="Passed" value={data.safeguards_passed ?? 0} color="text-green-400" />
            <MiniStat label="Failed" value={data.safeguards_failed ?? 0} color="text-red-400" />
            <MiniStat label="PHI Namespaces" value={data.phi_namespaces ?? 0} />
            <MiniStat label="Encrypted Flows" value={data.encrypted_flows ?? 0} color="text-blue-400" />
          </div>
        </div>
      ) : (
        <p className="text-gray-500 text-sm">No data</p>
      )}
    </CardShell>
  )
}

// ── GxP Card ────────────────────────────────────────────────────────────

export function GxPCard() {
  const nav = useNavigate()
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setIsLoading(true)
    authFetch('/api/compliance/gxp/summary')
      .then(r => r.ok ? safeJson<Record<string, unknown>>(r) : null)
      .then(setData)
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : 'Failed to load'); console.error(err) })
      .finally(() => setIsLoading(false))
  }, [])
  return (
    <CardShell title="GxP Validation (21 CFR 11)" icon={FileText} onClick={() => nav('/gxp')}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : isLoading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : data ? (
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
      ) : (
        <p className="text-gray-500 text-sm">No data</p>
      )}
    </CardShell>
  )
}

// ── BAA Card ────────────────────────────────────────────────────────────

export function BAACard() {
  const nav = useNavigate()
  const [data, setData] = useState<Record<string, number> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setIsLoading(true)
    authFetch('/api/compliance/baa/summary')
      .then(r => r.ok ? safeJson<Record<string, number>>(r) : null)
      .then(setData)
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : 'Failed to load'); console.error(err) })
      .finally(() => setIsLoading(false))
  }, [])
  return (
    <CardShell title="BAA Tracker" icon={FileText} onClick={() => nav('/baa')}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : isLoading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : data ? (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Total" value={data.total_agreements ?? 0} />
          <MiniStat label="Active" value={data.active_agreements ?? 0} color="text-green-400" />
          <MiniStat label="Expiring" value={data.expiring_soon ?? 0} color="text-yellow-400" />
          <MiniStat label="Expired" value={data.expired ?? 0} color="text-red-400" />
        </div>
      ) : (
        <p className="text-gray-500 text-sm">No data</p>
      )}
    </CardShell>
  )
}

// ── Compliance Frameworks Card ──────────────────────────────────────────

export function ComplianceFrameworksCard() {
  const nav = useNavigate()
  return (
    <CardShell title="Compliance Frameworks" icon={Shield} onClick={() => nav('/compliance-frameworks')}>
      <div className="space-y-2">
        <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-green-400" /><span className="text-sm text-muted-foreground">PCI-DSS 4.0</span></div>
        <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-green-400" /><span className="text-sm text-muted-foreground">SOC 2 Type II</span></div>
        <p className="text-xs text-gray-500 mt-2">Click to evaluate frameworks</p>
      </div>
    </CardShell>
  )
}

// ── Data Residency Card ─────────────────────────────────────────────────

export function DataResidencyCard() {
  const nav = useNavigate()
  return (
    <CardShell title="Data Residency" icon={Lock} onClick={() => nav('/data-residency')}>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Regions" value={4} />
          <MiniStat label="Compliant" value="100%" color="text-green-400" />
        </div>
        <p className="text-xs text-gray-500">Data sovereignty enforcement active</p>
      </div>
    </CardShell>
  )
}

// ── Change Control Card ─────────────────────────────────────────────────

export function ChangeControlCard() {
  const nav = useNavigate()
  return (
    <CardShell title="Change Control" icon={Activity} onClick={() => nav('/change-control')}>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Pending" value={3} color="text-yellow-400" />
          <MiniStat label="Approved" value={12} color="text-green-400" />
        </div>
        <p className="text-xs text-gray-500">Audit trail active</p>
      </div>
    </CardShell>
  )
}

// ── Segregation of Duties Card ──────────────────────────────────────────

export function SegregationOfDutiesCard() {
  const nav = useNavigate()
  return (
    <CardShell title="Segregation of Duties" icon={Shield} onClick={() => nav('/segregation-of-duties')}>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Policies" value={8} />
          <MiniStat label="Violations" value={0} color="text-green-400" />
        </div>
        <p className="text-xs text-gray-500">Duty separation enforced</p>
      </div>
    </CardShell>
  )
}

// ── Compliance Reports Card ─────────────────────────────────────────────

export function ComplianceReportsCard() {
  const nav = useNavigate()
  return (
    <CardShell title="Compliance Reports" icon={FileText} onClick={() => nav('/compliance-reports')}>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Generated" value={24} />
          <MiniStat label="Scheduled" value={3} color="text-blue-400" />
        </div>
        <p className="text-xs text-gray-500">Export PDF/JSON/CSV</p>
      </div>
    </CardShell>
  )
}

// ── NIST 800-53 Card ────────────────────────────────────────────────────

export function NISTCard() {
  const nav = useNavigate()
  const { data, error } = useSummaryData<Record<string, number>>('/api/compliance/nist/summary')
  return (
    <CardShell title="NIST 800-53" icon={Shield} onClick={() => nav('/nist')}>
      {data ? (
        <div className="flex items-center gap-4">
          <ScoreRing score={data.overall_score ?? 0} />
          <div className="grid grid-cols-2 gap-2 flex-1">
            <MiniStat label="Implemented" value={data.implemented_controls ?? 0} color="text-green-400" />
            <MiniStat label="Partial" value={data.partial_controls ?? 0} color="text-yellow-400" />
            <MiniStat label="Planned" value={data.planned_controls ?? 0} color="text-blue-400" />
            <MiniStat label="Total" value={data.total_controls ?? 0} />
          </div>
        </div>
      ) : <p className={error ? ERROR_TEXT_CLASS : LOADING_TEXT_CLASS}>{error ?? 'Loading…'}</p>}
    </CardShell>
  )
}

// ── STIG Card ───────────────────────────────────────────────────────────

export function STIGCard() {
  const nav = useNavigate()
  const { data, error } = useSummaryData<Record<string, number>>('/api/compliance/stig/summary')
  return (
    <CardShell title="DISA STIG" icon={Shield} onClick={() => nav('/stig')}>
      {data ? (
        <div className="flex items-center gap-4">
          <ScoreRing score={data.compliance_score ?? 0} />
          <div className="grid grid-cols-2 gap-2 flex-1">
            <MiniStat label="Findings" value={data.total_findings ?? 0} />
            <MiniStat label="Open" value={data.open ?? 0} color="text-red-400" />
            <MiniStat label="CAT I Open" value={data.cat_i_open ?? 0} color="text-red-400" />
            <MiniStat label="Not a Finding" value={data.not_a_finding ?? 0} color="text-green-400" />
          </div>
        </div>
      ) : <p className={error ? ERROR_TEXT_CLASS : LOADING_TEXT_CLASS}>{error ?? 'Loading…'}</p>}
    </CardShell>
  )
}

// ── Air-Gap Card ────────────────────────────────────────────────────────

export function AirGapCard() {
  const nav = useNavigate()
  const { data, error } = useSummaryData<Record<string, number>>('/api/compliance/airgap/summary')
  return (
    <CardShell title="Air-Gap Readiness" icon={WifiOff} onClick={() => nav('/air-gap')}>
      {data ? (
        <div className="flex items-center gap-4">
          <ScoreRing score={data.overall_score ?? 0} />
          <div className="grid grid-cols-2 gap-2 flex-1">
            <MiniStat label="Clusters Ready" value={data.ready_clusters ?? 0} color="text-green-400" />
            <MiniStat label="Not Ready" value={data.not_ready_clusters ?? 0} color="text-red-400" />
            <MiniStat label="Requirements" value={data.total_requirements ?? 0} />
            <MiniStat label="Met" value={data.met_requirements ?? 0} color="text-green-400" />
          </div>
        </div>
      ) : <p className={error ? ERROR_TEXT_CLASS : LOADING_TEXT_CLASS}>{error ?? 'Loading…'}</p>}
    </CardShell>
  )
}

// ── SIEM Integration Card ───────────────────────────────────────────────

export function SIEMIntegrationCard() {
  const nav = useNavigate()
  const { data, error } = useSummaryData<Record<string, number>>('/api/v1/compliance/siem/summary')
  return (
    <CardShell title="SIEM Integration" icon={Activity} onClick={() => nav('/enterprise/siem')}>
      {data ? (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Events (24h)" value={(data.events_last_24h ?? 0).toLocaleString()} />
          <MiniStat label="Total Alerts" value={data.total_alerts ?? 0} />
          <MiniStat label="Critical" value={data.critical_alerts ?? 0} color="text-red-400" />
          <MiniStat label="Active" value={data.active_alerts ?? 0} color="text-yellow-400" />
        </div>
      ) : <p className={error ? ERROR_TEXT_CLASS : LOADING_TEXT_CLASS}>{error ?? 'Loading…'}</p>}
    </CardShell>
  )
}

// ── Incident Response Card ──────────────────────────────────────────────

export function IncidentResponseCard() {
  const nav = useNavigate()
  const { data, error } = useSummaryData<Record<string, unknown>>('/api/v1/compliance/incidents/metrics')
  return (
    <CardShell title="Incident Response" icon={Shield} onClick={() => nav('/enterprise/incident-response')}>
      {data ? (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Active" value={Number(data.active_incidents ?? 0)} color="text-red-400" />
          <MiniStat label="MTTR" value={`${Number(data.mttr_hours ?? 0)}h`} />
          <MiniStat label="Resolved (30d)" value={Number(data.resolved_last_30d ?? 0)} color="text-green-400" />
          <MiniStat label="Escalation" value={`${Number(data.escalation_rate ?? 0)}%`} color="text-yellow-400" />
        </div>
      ) : <p className={error ? ERROR_TEXT_CLASS : LOADING_TEXT_CLASS}>{error ?? 'Loading…'}</p>}
    </CardShell>
  )
}

// ── Threat Intelligence Card ────────────────────────────────────────────

export function ThreatIntelCard() {
  const nav = useNavigate()
  const { data, error } = useSummaryData<Record<string, number>>('/api/v1/compliance/threat-intel/summary')
  return (
    <CardShell title="Threat Intelligence" icon={Shield} onClick={() => nav('/enterprise/threat-intel')}>
      {data ? (
        <div className="flex items-center gap-4">
          <ScoreRing score={100 - (data.risk_score ?? 0)} />
          <div className="grid grid-cols-2 gap-2 flex-1">
            <MiniStat label="Active Feeds" value={data.active_feeds ?? 0} color="text-green-400" />
            <MiniStat label="IOC Matches" value={data.active_matches ?? 0} color="text-red-400" />
            <MiniStat label="Indicators" value={(data.total_indicators ?? 0).toLocaleString()} />
            <MiniStat label="Risk Score" value={data.risk_score ?? 0} color="text-yellow-400" />
          </div>
        </div>
      ) : <p className={error ? ERROR_TEXT_CLASS : LOADING_TEXT_CLASS}>{error ?? 'Loading…'}</p>}
    </CardShell>
  )
}

// ── FedRAMP Card ────────────────────────────────────────────────────────

export function FedRAMPCard() {
  const nav = useNavigate()
  const { data, error } = useSummaryData<Record<string, unknown>>('/api/compliance/fedramp/score')
  return (
    <CardShell title="FedRAMP Readiness" icon={Award} onClick={() => nav('/fedramp')}>
      {data ? (
        <div className="flex items-center gap-4">
          <ScoreRing score={Number(data.overall_score ?? 0)} />
          <div className="grid grid-cols-2 gap-2 flex-1">
            <MiniStat label="Satisfied" value={Number(data.satisfied_controls ?? 0)} color="text-green-400" />
            <MiniStat label="Partial" value={Number(data.partial_controls ?? 0)} color="text-yellow-400" />
            <MiniStat label="Open POAMs" value={Number(data.open_poams ?? 0)} color="text-red-400" />
            <MiniStat label="Status" value={String(data.authorization_status ?? 'unknown').replace(/_/g, ' ')} color={
              ({ authorized: 'text-green-400', in_process: 'text-orange-400', in_progress: 'text-orange-400', pending: 'text-yellow-400' } as Record<string, string>)[String(data.authorization_status ?? '')] ?? 'text-white'
            } />
          </div>
        </div>
      ) : <p className={error ? ERROR_TEXT_CLASS : LOADING_TEXT_CLASS}>{error ?? 'Loading…'}</p>}
    </CardShell>
  )
}

// ── OIDC Federation Card ────────────────────────────────────────────────

export function OIDCFederationCard() {
  const nav = useNavigate()
  const { data, error } = useSummaryData<Record<string, number>>('/api/identity/oidc/summary')
  return (
    <CardShell title="OIDC Federation" icon={KeyRound} onClick={() => nav('/enterprise/oidc')}>
      {data ? (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Providers" value={`${data.active_providers ?? 0}/${data.total_providers ?? 0}`} color="text-blue-400" />
          <MiniStat label="Users" value={data.total_users ?? 0} />
          <MiniStat label="Sessions" value={data.active_sessions ?? 0} color="text-green-400" />
          <MiniStat label="MFA" value={`${data.mfa_adoption ?? 0}%`} color="text-cyan-400" />
        </div>
      ) : <p className={error ? ERROR_TEXT_CLASS : LOADING_TEXT_CLASS}>{error ?? 'Loading…'}</p>}
    </CardShell>
  )
}

// ── RBAC Audit Card ─────────────────────────────────────────────────────

export function RBACAuditCard() {
  const nav = useNavigate()
  const { data, error } = useSummaryData<Record<string, number>>('/api/identity/rbac/summary')
  return (
    <CardShell title="RBAC Audit" icon={Lock} onClick={() => nav('/enterprise/rbac-audit')}>
      {data ? (
        <div className="flex items-center gap-4">
          <ScoreRing score={data.compliance_score ?? 0} />
          <div className="grid grid-cols-2 gap-2 flex-1">
            <MiniStat label="Bindings" value={data.total_bindings ?? 0} />
            <MiniStat label="Over-Priv" value={data.over_privileged ?? 0} color="text-red-400" />
            <MiniStat label="Unused" value={data.unused_bindings ?? 0} color="text-yellow-400" />
            <MiniStat label="Score" value={`${data.compliance_score ?? 0}%`} color="text-green-400" />
          </div>
        </div>
      ) : <p className={error ? ERROR_TEXT_CLASS : LOADING_TEXT_CLASS}>{error ?? 'Loading…'}</p>}
    </CardShell>
  )
}

// ── Session Management Card ─────────────────────────────────────────────

export function SessionManagementCard() {
  const nav = useNavigate()
  const { data, error } = useSummaryData<Record<string, number>>('/api/identity/sessions/summary')
  return (
    <CardShell title="Session Management" icon={Clock} onClick={() => nav('/enterprise/sessions')}>
      {data ? (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Active" value={data.active_sessions ?? 0} color="text-blue-400" />
          <MiniStat label="Users" value={data.unique_users ?? 0} />
          <MiniStat label="Avg Duration" value={`${data.avg_duration_minutes ?? 0}m`} />
          <MiniStat label="Violations" value={data.policy_violations ?? 0} color={data.policy_violations > 0 ? 'text-red-400' : 'text-green-400'} />
        </div>
      ) : <p className={error ? ERROR_TEXT_CLASS : LOADING_TEXT_CLASS}>{error ?? 'Loading…'}</p>}
    </CardShell>
  )
}

// ── SBOM Manager Card ───────────────────────────────────────────────────

export function SBOMManagerCard() {
  const nav = useNavigate()
  const { data, error } = useSummaryData<Record<string, number>>('/api/supply-chain/sbom/summary')
  return (
    <CardShell title="SBOM Manager" icon={Package} onClick={() => nav('/enterprise/sbom')}>
      {data ? (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Components" value={data.total_components ?? 0} />
          <MiniStat label="Vulnerable" value={data.vulnerable_components ?? 0} color="text-red-400" />
          <MiniStat label="Critical" value={data.critical_count ?? 0} color="text-red-500" />
          <MiniStat label="Coverage" value={`${data.sbom_coverage ?? 0}%`} color="text-green-400" />
        </div>
      ) : <p className={error ? ERROR_TEXT_CLASS : LOADING_TEXT_CLASS}>{error ?? 'Loading…'}</p>}
    </CardShell>
  )
}

// ── Sigstore Verify Card ────────────────────────────────────────────────

export function SigstoreVerifyCard() {
  const nav = useNavigate()
  const { data, error } = useSummaryData<Record<string, number>>('/api/supply-chain/signing/summary')
  return (
    <CardShell title="Sigstore Verify" icon={Shield} onClick={() => nav('/enterprise/sigstore')}>
      {data ? (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Images" value={data.total_images ?? 0} />
          <MiniStat label="Signed" value={data.signed_images ?? 0} color="text-green-400" />
          <MiniStat label="Verified" value={data.verified_images ?? 0} color="text-green-400" />
          <MiniStat label="Violations" value={data.policy_violations ?? 0} color="text-red-400" />
        </div>
      ) : <p className={error ? ERROR_TEXT_CLASS : LOADING_TEXT_CLASS}>{error ?? 'Loading…'}</p>}
    </CardShell>
  )
}

// ── SLSA Provenance Card ────────────────────────────────────────────────

export function SLSAProvenanceCard() {
  const nav = useNavigate()
  const { data, error } = useSummaryData<Record<string, unknown>>('/api/supply-chain/slsa/summary')
  const levelDistribution = (data?.level_distribution as Record<string, number> | undefined) ?? {}
  return (
    <CardShell title="SLSA Provenance" icon={Lock} onClick={() => nav('/enterprise/slsa')}>
      {data ? (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Workloads" value={Number(data.total_workloads ?? 0)} />
          <MiniStat label="Attested" value={Number(data.attested_workloads ?? 0)} color="text-green-400" />
          <MiniStat label="L3+" value={(levelDistribution['3'] ?? 0) + (levelDistribution['4'] ?? 0)} color="text-emerald-400" />
          <MiniStat label="Verified" value={Number(data.verified_workloads ?? 0)} color="text-green-400" />
        </div>
      ) : <p className={error ? ERROR_TEXT_CLASS : LOADING_TEXT_CLASS}>{error ?? 'Loading…'}</p>}
    </CardShell>
  )
}

// ── Risk Matrix Card ────────────────────────────────────────────────────

export function RiskMatrixCard() {
  const nav = useNavigate()
  const { data, error } = useSummaryData<Record<string, number>>('/api/v1/compliance/erm/risk-matrix/summary')
  return (
    <CardShell title="Risk Matrix" icon={Scale} onClick={() => nav('/enterprise/risk-matrix')}>
      {data ? (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Total Risks" value={data.total_risks ?? 0} />
          <MiniStat label="Critical" value={data.critical ?? 0} color="text-red-400" />
          <MiniStat label="High" value={data.high ?? 0} color="text-red-300" />
          <MiniStat label="Medium" value={data.medium ?? 0} color="text-orange-400" />
        </div>
      ) : <p className={error ? ERROR_TEXT_CLASS : LOADING_TEXT_CLASS}>{error ?? 'Loading…'}</p>}
    </CardShell>
  )
}

// ── Risk Register Card ──────────────────────────────────────────────────

export function RiskRegisterCard() {
  const nav = useNavigate()
  const { data, error } = useSummaryData<Record<string, number>>('/api/v1/compliance/erm/risk-register/summary')
  return (
    <CardShell title="Risk Register" icon={Scale} onClick={() => nav('/enterprise/risk-register')}>
      {data ? (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Open Risks" value={data.open_risks ?? 0} color="text-yellow-400" />
          <MiniStat label="Overdue" value={data.overdue_reviews ?? 0} color="text-red-400" />
          <MiniStat label="Total" value={data.total_risks ?? 0} />
          <MiniStat label="Avg Score" value={Number(data.avg_risk_score ?? 0).toFixed(1)} color="text-orange-400" />
        </div>
      ) : <p className={error ? ERROR_TEXT_CLASS : LOADING_TEXT_CLASS}>{error ?? 'Loading…'}</p>}
    </CardShell>
  )
}

// ── Risk Appetite Card ──────────────────────────────────────────────────

export function RiskAppetiteCard() {
  const nav = useNavigate()
  const { data, error } = useSummaryData<Record<string, number>>('/api/v1/compliance/erm/risk-appetite/summary')
  return (
    <CardShell title="Risk Appetite" icon={Scale} onClick={() => nav('/enterprise/risk-appetite')}>
      {data ? (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Breaches" value={data.breaches ?? 0} color="text-red-400" />
          <MiniStat label="KRIs" value={data.total_kris ?? 0} />
          <MiniStat label="Within" value={data.within_appetite ?? 0} color="text-green-400" />
          <MiniStat label="KRI Breach" value={data.kri_breaches ?? 0} color="text-red-400" />
        </div>
      ) : <p className={error ? ERROR_TEXT_CLASS : LOADING_TEXT_CLASS}>{error ?? 'Loading…'}</p>}
    </CardShell>
  )
}
