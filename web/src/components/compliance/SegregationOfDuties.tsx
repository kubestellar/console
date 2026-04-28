import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { sodDashboardConfig } from '../../config/dashboards/segregation-of-duties'
import {
  Users, ShieldAlert, CheckCircle2, XCircle, AlertTriangle,
  Loader2, RefreshCw, Filter, UserCheck, UserX,
} from 'lucide-react'
import { authFetch } from '../../lib/api'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'
import { Select } from '../ui/Select'

interface SoDRule {
  id: string; name: string; description: string; role_a: string; role_b: string
  conflict_type: string; severity: string; regulation: string
}

interface Principal {
  name: string; type: string; roles: string[]; clusters: string[]
}

interface SoDViolation {
  id: string; rule_id: string; principal: string; principal_type: string
  role_a: string; role_b: string; clusters: string[]; severity: string; description: string
}

interface SoDSummary {
  total_rules: number; total_principals: number; total_violations: number
  by_severity: Record<string, number>; by_conflict_type: Record<string, number>
  compliance_score: number; clean_principals: number; conflicted_principals: number
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
  high:     'bg-orange-500/20 text-orange-300 border-orange-500/30',
  medium:   'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  low:      'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
}

const TYPE_ICONS: Record<string, string> = {
  user: '👤', group: '👥', serviceaccount: '🤖',
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-yellow-400'
  if (score >= 40) return 'text-orange-400'
  return 'text-red-400'
}

export const SegregationOfDutiesContent = memo(function SegregationOfDutiesContent() {
  const [summary, setSummary] = useState<SoDSummary | null>(null)
  const [rules, setRules] = useState<SoDRule[]>([])
  const [principals, setPrincipals] = useState<Principal[]>([])
  const [violations, setViolations] = useState<SoDViolation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterSeverity, setFilterSeverity] = useState('all')
  const [activeTab, setActiveTab] = useState<'violations' | 'principals' | 'rules'>('violations')
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [sRes, rRes, pRes, vRes] = await Promise.all([
        authFetch('/api/compliance/sod/summary'),
        authFetch('/api/compliance/sod/rules'),
        authFetch('/api/compliance/sod/principals'),
        authFetch('/api/compliance/sod/violations'),
      ])
      if (!sRes.ok || !rRes.ok || !pRes.ok || !vRes.ok) throw new Error('Failed to load SoD data')
      setSummary(await sRes.json())
      setRules(await rRes.json())
      setPrincipals(await pRes.json())
      setViolations(await vRes.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredViolations = useMemo(() =>
    filterSeverity === 'all' ? violations : violations.filter(v => v.severity === filterSeverity),
    [violations, filterSeverity]
  )

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-zinc-400" /></div>

  if (error) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <p className="text-red-400 font-medium">{error}</p>
      <button onClick={fetchData} className="text-indigo-400 hover:text-indigo-300 text-sm flex items-center gap-1 min-h-11 min-w-11 px-3 py-2"><RefreshCw className="w-4 h-4" /> Retry</button>
    </div>
  )

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Segregation of Duties"
        subtitle="Detect conflicting privilege assignments across RBAC roles"
        isFetching={loading}
        onRefresh={fetchData}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="sod-auto-refresh"
        rightExtra={<RotatingTip page="compliance" />}
      />

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-4">
            <div className="flex items-center gap-2 mb-2"><ShieldAlert className="w-5 h-5 text-indigo-400" /><span className="text-xs text-zinc-400">Compliance Score</span></div>
            <p className={`text-2xl font-bold ${scoreColor(summary.compliance_score)}`}>{summary.compliance_score}%</p>
          </div>
          <SummaryCard label="Rules" value={summary.total_rules} icon={<ShieldAlert className="w-5 h-5 text-blue-400" />} />
          <SummaryCard label="Principals" value={summary.total_principals} icon={<Users className="w-5 h-5 text-zinc-400" />} />
          <SummaryCard label="Clean" value={summary.clean_principals} icon={<UserCheck className="w-5 h-5 text-emerald-400" />} />
          <SummaryCard label="Conflicted" value={summary.conflicted_principals} icon={<UserX className="w-5 h-5 text-red-400" />} accent={summary.conflicted_principals > 0 ? 'red' : undefined} />
        </div>
      )}

      <div className="flex gap-1 border-b border-zinc-700/50 pb-0">
        {(['violations', 'principals', 'rules'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === tab ? 'bg-zinc-700/50 text-zinc-100 border-b-2 border-indigo-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}>
            {tab === 'violations' && `Violations (${violations.length})`}
            {tab === 'principals' && `Principals (${principals.length})`}
            {tab === 'rules' && `Rules (${rules.length})`}
          </button>
        ))}
      </div>

      {activeTab === 'violations' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-zinc-400" />
            <div className="w-40">
              <Select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} selectSize="sm">
                <option value="all">All severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </Select>
            </div>
          </div>
          {filteredViolations.length === 0 ? <p className="text-zinc-500 text-sm text-center py-8">No violations found</p> : filteredViolations.map(v => (
            <div key={v.id} className="rounded-lg border border-zinc-700/30 bg-zinc-800/50 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${SEVERITY_STYLES[v.severity] ?? SEVERITY_STYLES.medium}`}>{v.severity}</span>
                  <span className="text-sm font-medium text-zinc-200">{TYPE_ICONS[v.principal_type] ?? '👤'} {v.principal}</span>
                </div>
                <code className="text-xs text-zinc-500">{v.rule_id}</code>
              </div>
              <p className="text-sm text-zinc-300 mb-2">{v.description}</p>
              <div className="flex gap-2 text-xs">
                <span className="bg-red-500/10 text-red-300 px-2 py-0.5 rounded">{v.role_a}</span>
                <span className="text-zinc-500">conflicts with</span>
                <span className="bg-red-500/10 text-red-300 px-2 py-0.5 rounded">{v.role_b}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'principals' && (
        <div className="space-y-2">
          {principals.map(p => {
            const hasViolation = violations.some(v => v.principal === p.name)
            return (
              <div key={p.name} className={`rounded-lg border p-3 ${hasViolation ? 'border-red-500/30 bg-red-500/5' : 'border-zinc-700/30 bg-zinc-900/30'}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span>{TYPE_ICONS[p.type] ?? '👤'}</span>
                    <span className="text-sm font-medium text-zinc-200">{p.name}</span>
                    <code className="text-xs text-zinc-500">{p.type}</code>
                    {hasViolation ? <AlertTriangle className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(p.roles || []).map(r => <span key={r} className="text-xs bg-zinc-700/50 px-1.5 py-0.5 rounded text-zinc-300">{r}</span>)}
                </div>
                <div className="text-xs text-zinc-500 mt-1">Clusters: {(p.clusters || []).join(', ')}</div>
              </div>
            )
          })}
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="space-y-2">
          {rules.map(r => (
            <div key={r.id} className="rounded-lg border border-zinc-700/30 bg-zinc-900/30 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${SEVERITY_STYLES[r.severity] ?? SEVERITY_STYLES.medium}`}>{r.severity}</span>
                  <span className="text-sm font-medium text-zinc-200">{r.name}</span>
                </div>
                <code className="text-xs bg-zinc-700/50 px-1.5 py-0.5 rounded text-zinc-400">{r.regulation}</code>
              </div>
              <p className="text-sm text-zinc-400 mb-2">{r.description}</p>
              <div className="flex gap-2 text-xs">
                <span className="bg-zinc-700/50 px-2 py-0.5 rounded text-zinc-300">{r.role_a}</span>
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="bg-zinc-700/50 px-2 py-0.5 rounded text-zinc-300">{r.role_b}</span>
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
    <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-4">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-zinc-400">{label}</span></div>
      <p className={`text-2xl font-bold ${accent === 'red' ? 'text-red-400' : 'text-zinc-100'}`}>{value}</p>
    </div>
  )
}

export default function SegregationOfDuties() {
  return (<>
    <SegregationOfDutiesContent />
    <UnifiedDashboard config={sodDashboardConfig} />
  </>)
}
