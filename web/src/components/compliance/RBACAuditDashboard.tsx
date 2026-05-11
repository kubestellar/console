import { useState, useEffect, useMemo, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { rbacAuditDashboardConfig } from '../../config/dashboards/rbac-audit'
import {
  Lock, CheckCircle2, XCircle, AlertTriangle, Loader2,
  ShieldAlert, Users, Server,
} from 'lucide-react'
import { authFetch } from '../../lib/api'
import { Select } from '../ui/Select'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'

interface RBACBinding {
  id: string; name: string; kind: string; subject_kind: string
  subject_name: string; role_name: string; namespace: string
  cluster: string; risk_level: string; last_used: string
}

interface RBACFinding {
  id: string; finding_type: string; severity: string; subject: string
  description: string; cluster: string; namespace: string
  recommendation: string
}

interface RBACSummary {
  total_bindings: number; cluster_role_bindings: number
  role_bindings: number; over_privileged: number
  unused_bindings: number; compliance_score: number
  evaluated_at: string
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  medium: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  low: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  info: 'bg-gray-500/20 text-gray-200 border-gray-500/30',
}

const RISK_STYLES: Record<string, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-amber-400',
  low: 'text-emerald-400',
}

export const RBACAuditDashboardContent = memo(function RBACAuditDashboardContent() {
  const { t } = useTranslation()
  const [bindings, setBindings] = useState<RBACBinding[]>([])
  const [findings, setFindings] = useState<RBACFinding[]>([])
  const [summary, setSummary] = useState<RBACSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'findings' | 'bindings'>('findings')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [smRes, bRes, fRes] = await Promise.all([
        authFetch('/api/identity/rbac/summary'),
        authFetch('/api/identity/rbac/bindings'),
        authFetch('/api/identity/rbac/findings'),
      ])
      if (!smRes.ok || !bRes.ok || !fRes.ok) throw new Error('Failed to load RBAC data')
      setSummary(await smRes.json())
      setBindings(await bRes.json())
      setFindings(await fRes.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load RBAC data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const filteredFindings = useMemo(() => {
    if (severityFilter === 'all') return findings
    return findings.filter(f => f.severity === severityFilter)
  }, [findings, severityFilter])

  const scoreColor = useMemo(() => {
    if (!summary) return 'text-gray-400'
    if (summary.compliance_score >= 80) return 'text-emerald-400'
    if (summary.compliance_score >= 60) return 'text-amber-400'
    return 'text-red-400'
  }, [summary])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      <span className="ml-3 text-gray-400">Loading RBAC audit data…</span>
    </div>
  )

  if (error) return (
    <div className="p-6 text-center">
      <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
      <p className="text-red-300 mb-4">{error}</p>
      <button onClick={fetchData} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm">{t('common.retry', 'Retry')}</button>
    </div>
  )

  return (
    <div className="space-y-6 p-6">
      <DashboardHeader
        title="RBAC Audit & Least-Privilege Analysis"
        subtitle="Role binding audit, over-privilege detection, and compliance scoring"
        isFetching={loading}
        onRefresh={fetchData}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="rbac-auto-refresh"
        rightExtra={<RotatingTip page="compliance" />}
      />

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Total Bindings</div>
            <div className="text-3xl font-bold text-blue-400">{summary.total_bindings}</div>
            <div className="text-xs text-gray-500 mt-1">
              {summary.cluster_role_bindings} cluster / {summary.role_bindings} namespace
            </div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Over-Privileged</div>
            <div className={`text-3xl font-bold ${summary.over_privileged > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {summary.over_privileged}
            </div>
            <div className="text-xs text-gray-500 mt-1">bindings with excess permissions</div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Unused (30d)</div>
            <div className={`text-3xl font-bold ${summary.unused_bindings > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {summary.unused_bindings}
            </div>
            <div className="text-xs text-gray-500 mt-1">no activity in 30 days</div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Compliance Score</div>
            <div className={`text-3xl font-bold ${scoreColor}`}>{summary.compliance_score}%</div>
            <div className="text-xs text-gray-500 mt-1">least-privilege adherence</div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex items-center gap-4">
        <div className="flex gap-1 bg-gray-800/30 p-1 rounded-lg">
          {(['findings', 'bindings'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              {tab === 'findings' ? 'Findings' : 'Bindings'}
            </button>
          ))}
        </div>
        {activeTab === 'findings' && (
          <div className="w-40">
            <Select
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </div>
        )}
      </div>

      {/* Findings Tab */}
      {activeTab === 'findings' && (
        <div className="space-y-3">
          {filteredFindings.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
              No findings match the selected filter
            </div>
          ) : (
            filteredFindings.map(f => (
              <div key={f.id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-400" />
                    <div>
                      <div className="text-white font-medium">{(f.finding_type ?? '').replace(/_/g, ' ')}</div>
                      <div className="text-sm text-gray-400">{f.subject} — {f.cluster}/{f.namespace}</div>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${SEVERITY_STYLES[f.severity] || ''}`}>
                    {f.severity}
                  </span>
                </div>
                <p className="text-sm text-gray-200 mb-2">{f.description}</p>
                <p className="text-xs text-blue-300">
                  <span className="font-medium">Recommendation:</span> {f.recommendation}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Bindings Tab */}
      {activeTab === 'bindings' && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-left">
                <th className="p-3">Name</th>
                <th className="p-3">Kind</th>
                <th className="p-3">Subject</th>
                <th className="p-3">Role</th>
                <th className="p-3">Cluster</th>
                <th className="p-3">Namespace</th>
                <th className="p-3">Risk</th>
                <th className="p-3">Last Used</th>
              </tr>
            </thead>
            <tbody>
              {bindings.map(b => (
                <tr key={b.id} className="border-b border-gray-700/50 hover:bg-white/5">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-gray-500" />
                      <span className="text-white font-medium">{b.name}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-1 bg-gray-700/50 rounded text-xs text-gray-200">{b.kind}</span>
                  </td>
                  <td className="p-3 text-gray-200">
                    <div className="flex items-center gap-1">
                      {b.subject_kind === 'User' ? <Users className="w-3 h-3" /> :
                       b.subject_kind === 'Group' ? <Users className="w-3 h-3" /> :
                       <Server className="w-3 h-3" />}
                      <span>{b.subject_name}</span>
                    </div>
                    <span className="text-xs text-gray-500">{b.subject_kind}</span>
                  </td>
                  <td className="p-3 text-gray-200 font-mono text-xs">{b.role_name}</td>
                  <td className="p-3 text-gray-200">{b.cluster}</td>
                  <td className="p-3 text-gray-200">{b.namespace || '—'}</td>
                  <td className="p-3">
                    <span className={`font-medium text-xs ${RISK_STYLES[b.risk_level] || 'text-gray-400'}`}>
                      {b.risk_level === 'critical' ? <AlertTriangle className="w-3 h-3 inline mr-1" /> : null}
                      {b.risk_level}
                    </span>
                  </td>
                  <td className="p-3 text-gray-400 text-xs">{new Date(b.last_used).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Evaluated At */}
      {summary && (
        <div className="text-xs text-gray-500 text-right">
          Last evaluated: {new Date(summary.evaluated_at).toLocaleString()}
        </div>
      )}
    </div>
  )
})

export default function RBACAuditDashboard() {
  return (<>
    <RBACAuditDashboardContent />
    <UnifiedDashboard config={rbacAuditDashboardConfig} />
  </>)
}
