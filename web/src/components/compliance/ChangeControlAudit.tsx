import { useState, useEffect, useMemo, memo, useRef } from 'react'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { changeControlDashboardConfig } from '../../config/dashboards/change-control'
import {
  ShieldAlert, AlertTriangle, CheckCircle2, XCircle,
  Clock, GitCommit, Loader2, RefreshCw, Filter, User, FileText,
} from 'lucide-react'
import { authFetch } from '../../lib/api'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'
import { Select } from '../ui/Select'

interface ChangeRecord {
  id: string; timestamp: string; cluster: string; namespace: string
  resource_kind: string; resource_name: string; change_type: string
  actor: string; approval_status: string; approved_by?: string
  ticket_ref?: string; description: string; diff_summary?: string; risk_score: number
}

interface PolicyViolation {
  id: string; change_id: string; policy: string; severity: string
  description: string; detected_at: string; acknowledged: boolean
}

interface ChangePolicy {
  id: string; name: string; description: string; scope: string
  requires_approval: boolean; requires_ticket: boolean; severity: string
}

interface AuditSummary {
  total_changes: number; approved_changes: number; unapproved_changes: number
  emergency_changes: number; policy_violations: number; risk_score: number
  by_cluster: Record<string, number>; by_type: Record<string, number>; by_actor: Record<string, number>
}

const APPROVAL_STYLES: Record<string, { bg: string; label: string }> = {
  approved:   { bg: 'bg-emerald-500/20 border-emerald-500/30', label: 'Approved' },
  pending:    { bg: 'bg-yellow-500/20 border-yellow-500/30',  label: 'Pending' },
  rejected:   { bg: 'bg-red-500/20 border-red-500/30',        label: 'Rejected' },
  emergency:  { bg: 'bg-orange-500/20 border-orange-500/30',  label: 'Emergency' },
  unapproved: { bg: 'bg-red-500/20 border-red-500/30',        label: 'Unapproved' },
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high:     'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium:   'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low:      'bg-secondary text-muted-foreground border-border',
}

function riskColor(score: number): string {
  if (score >= 70) return 'text-red-400'
  if (score >= 40) return 'text-orange-400'
  if (score >= 20) return 'text-yellow-400'
  return 'text-emerald-400'
}

function riskBg(score: number): string {
  if (score >= 70) return 'bg-red-500/20'
  if (score >= 40) return 'bg-orange-500/20'
  if (score >= 20) return 'bg-yellow-500/20'
  return 'bg-emerald-500/20'
}

export const ChangeControlAuditContent = memo(function ChangeControlAuditContent() {
  const [summary, setSummary] = useState<AuditSummary | null>(null)
  const [changes, setChanges] = useState<ChangeRecord[]>([])
  const [violations, setViolations] = useState<PolicyViolation[]>([])
  const [policies, setPolicies] = useState<ChangePolicy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterApproval, setFilterApproval] = useState('all')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [activeTab, setActiveTab] = useState<'changes' | 'violations' | 'policies'>('changes')
  const cancelledRef = useRef(false)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [sRes, cRes, vRes, pRes] = await Promise.all([
        authFetch('/api/compliance/change-control/summary'),
        authFetch('/api/compliance/change-control/changes'),
        authFetch('/api/compliance/change-control/violations'),
        authFetch('/api/compliance/change-control/policies'),
      ])
      if (!sRes.ok || !cRes.ok || !vRes.ok || !pRes.ok) throw new Error('Failed to load change control data')
      const sData = await sRes.json()
      const cData = await cRes.json()
      const vData = await vRes.json()
      const pData = await pRes.json()
      if (cancelledRef.current) return
      setSummary(sData ?? null)
      setChanges(Array.isArray(cData) ? cData : [])
      setViolations(Array.isArray(vData) ? vData : [])
      setPolicies(Array.isArray(pData) ? pData : [])
    } catch (err: unknown) {
      if (cancelledRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      if (cancelledRef.current) return
      setLoading(false)
    }
  }

  useEffect(() => {
    cancelledRef.current = false
    fetchData()
    return () => { cancelledRef.current = true }
  }, [])

  const filteredChanges = useMemo(() =>
    filterApproval === 'all' ? (changes || []) : (changes || []).filter(c => c.approval_status === filterApproval),
    [changes, filterApproval]
  )

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>

  if (error) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <p className="text-red-400 font-medium">{error}</p>
      <button type="button" onClick={fetchData} className="text-indigo-400 hover:text-indigo-300 text-sm flex items-center gap-1 min-h-11 min-w-11 px-3 py-2"><RefreshCw className="w-4 h-4" /> Retry</button>
    </div>
  )

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Change Control Audit Trail"
        subtitle="SOX/PCI-compliant change tracking with approval workflows"
        isFetching={loading}
        onRefresh={fetchData}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="change-control-auto-refresh"
        rightExtra={<RotatingTip page="compliance" />}
      />

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <SummaryCard label="Total Changes" value={summary.total_changes} icon={<GitCommit className="w-5 h-5 text-blue-400" />} />
          <SummaryCard label="Approved" value={summary.approved_changes} icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />} />
          <SummaryCard label="Unapproved" value={summary.unapproved_changes} icon={<XCircle className="w-5 h-5 text-red-400" />} accent={summary.unapproved_changes > 0 ? 'red' : undefined} />
          <SummaryCard label="Violations" value={summary.policy_violations} icon={<ShieldAlert className="w-5 h-5 text-orange-400" />} accent={summary.policy_violations > 0 ? 'orange' : undefined} />
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2"><AlertTriangle className={`w-5 h-5 ${riskColor(summary.risk_score)}`} /><span className="text-xs text-muted-foreground">Risk Score</span></div>
            <div className="flex items-baseline gap-2">
              <p className={`text-2xl font-bold ${riskColor(summary.risk_score)}`}>{summary.risk_score}</p>
              <span className={`text-xs px-1.5 py-0.5 rounded ${riskBg(summary.risk_score)} ${riskColor(summary.risk_score)}`}>
                {summary.risk_score >= 70 ? 'HIGH' : summary.risk_score >= 40 ? 'MEDIUM' : summary.risk_score >= 20 ? 'LOW-MEDIUM' : 'LOW'}/100
              </span>
            </div>
          </div>
        </div>
      )}

      {!summary && !loading && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">No change control summary available</p>
          <p className="text-xs text-muted-foreground mt-1">Changes will appear here once audit data is collected</p>
        </div>
      )}

      <div className="flex gap-1 border-b border-border pb-0">
        {(['changes', 'violations', 'policies'] as const).map(tab => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === tab ? 'bg-secondary text-foreground border-b-2 border-indigo-400' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}>
            {tab === 'changes' && `Changes (${changes.length})`}
            {tab === 'violations' && `Violations (${violations.length})`}
            {tab === 'policies' && `Policies (${policies.length})`}
          </button>
        ))}
      </div>

      {activeTab === 'changes' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <div className="w-44">
              <Select value={filterApproval} onChange={e => setFilterApproval(e.target.value)} selectSize="sm">
                <option value="all">All statuses</option>
                <option value="approved">Approved</option>
                <option value="unapproved">Unapproved</option>
                <option value="emergency">Emergency</option>
                <option value="pending">Pending</option>
              </Select>
            </div>
          </div>
          {(filteredChanges || []).map(change => {
            const approval = APPROVAL_STYLES[change.approval_status] ?? APPROVAL_STYLES.pending
            return (
              <div key={change.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${approval.bg}`}>{approval.label}</span>
                    <span className="text-sm font-medium text-foreground">{change.resource_kind}/{change.resource_name}</span>
                    <code className="text-xs bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">{change.change_type}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-mono font-bold ${riskColor(change.risk_score)}`}>{change.risk_score}</span>
                    <span className="text-xs text-muted-foreground">{change.cluster}</span>
                  </div>
                </div>
                <p className="text-sm text-foreground mb-2">{change.description}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><User className="w-3 h-3" />{change.actor}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(change.timestamp).toLocaleString()}</span>
                  {change.ticket_ref && <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{change.ticket_ref}</span>}
                  {change.approved_by && <span>Approved by: {change.approved_by}</span>}
                  {change.diff_summary && <code className="bg-secondary px-1 rounded">{change.diff_summary}</code>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {activeTab === 'violations' && (
        <div className="space-y-2">
          {(violations || []).length === 0 ? <p className="text-muted-foreground text-sm text-center py-8">No policy violations detected</p> : (violations || []).map(v => (
            <div key={v.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${SEVERITY_STYLES[v.severity] ?? SEVERITY_STYLES.low}`}>{v.severity}</span>
                  <code className="text-xs text-muted-foreground">{v.policy}</code>
                </div>
                <code className="text-xs text-muted-foreground">{v.change_id}</code>
              </div>
              <p className="text-sm text-foreground">{v.description}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'policies' && (
        <div className="space-y-2">
          {(policies || []).map(p => (
            <div key={p.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${SEVERITY_STYLES[p.severity] ?? SEVERITY_STYLES.low}`}>{p.severity}</span>
                  <span className="text-sm font-medium text-foreground">{p.name}</span>
                </div>
                <code className="text-xs bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">{p.scope}</code>
              </div>
              <p className="text-sm text-muted-foreground mb-2">{p.description}</p>
              <div className="flex gap-3 text-xs text-muted-foreground">
                {p.requires_approval && <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" />Requires approval</span>}
                {p.requires_ticket && <span className="flex items-center gap-1"><FileText className="w-3 h-3 text-blue-400" />Requires ticket</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

function SummaryCard({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-muted-foreground">{label}</span></div>
      <p className={`text-2xl font-bold ${accent === 'red' ? 'text-red-400' : accent === 'orange' ? 'text-orange-400' : 'text-foreground'}`}>{value}</p>
    </div>
  )
}

export default function ChangeControlAudit() {
  return (<>
    <ChangeControlAuditContent />
    <UnifiedDashboard config={changeControlDashboardConfig} />
  </>)
}
