import { useState, useEffect, useMemo, memo, useCallback } from 'react'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { stigDashboardConfig } from '../../config/dashboards/stig'
import {
  CheckCircle2, XCircle, AlertTriangle, Loader2,
  ArrowRight, Clock, Search
} from 'lucide-react'
import { authFetch } from '../../lib/api'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'

interface Finding {
  id: string
  rule_id: string
  title: string
  severity: 'CAT I' | 'CAT II' | 'CAT III'
  status: string
  benchmark_id: string
  host: string
  comments: string
}

interface Benchmark {
  id: string
  title: string
  version: string
  release: string
  status: string
  profile: string
  total_rules: number
  findings_count: number
}

interface STIGSummary {
  compliance_score: number
  total_findings: number
  open: number
  cat_i_open: number
  cat_ii_open: number
  cat_iii_open: number
  evaluated_at: string
}

const severityBadge = (severity: string) => {
  switch (severity) {
    case 'CAT I': return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30">CAT I</span>
    case 'CAT II': return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30">CAT II</span>
    case 'CAT III': return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-muted text-muted-foreground border border-border">CAT III</span>
    default: return <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">{severity}</span>
  }
}

const statusIcon = (status: string) => {
  switch (status) {
    case 'not_a_finding': return <CheckCircle2 className="w-4 h-4 text-green-400" />
    case 'open': return <XCircle className="w-4 h-4 text-red-400" />
    case 'not_applicable': return <Clock className="w-4 h-4 text-gray-400" />
    case 'not_reviewed': return <Search className="w-4 h-4 text-yellow-400" />
    default: return <AlertTriangle className="w-4 h-4 text-gray-400" />
  }
}

const statusLabel = (status: string) => {
  switch (status) {
    case 'open': return 'Open'
    case 'not_a_finding': return 'Not a Finding'
    case 'not_applicable': return 'Not Applicable'
    case 'not_reviewed': return 'Not Reviewed'
    default: return status
  }
}

export const STIGDashboardContent = memo(function STIGDashboardContent() {
  const [findings, setFindings] = useState<Finding[]>([])
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([])
  const [summary, setSummary] = useState<STIGSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'findings' | 'benchmarks' | 'summary'>('findings')
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [bRes, fRes, sRes] = await Promise.all([
        authFetch('/api/compliance/stig/benchmarks'),
        authFetch('/api/compliance/stig/findings'),
        authFetch('/api/compliance/stig/summary'),
      ])
      if (!bRes.ok || !fRes.ok || !sRes.ok) throw new Error('Failed to fetch STIG data')
      setBenchmarks(await bRes.json())
      setFindings(await fRes.json())
      setSummary(await sRes.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredFindings = useMemo(() => {
    if (severityFilter === 'all') return findings
    return findings.filter(f => f.severity === severityFilter)
  }, [findings, severityFilter])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      <span className="ml-3 text-muted-foreground">Loading DISA STIG compliance…</span>
    </div>
  )

  if (error) return (
    <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-lg">
      <p className="text-red-400">{error}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="DISA STIG Compliance"
        subtitle="Security Technical Implementation Guides for hardened Kubernetes clusters"
        isFetching={loading}
        onRefresh={fetchData}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="stig-auto-refresh"
        rightExtra={<RotatingTip page="compliance" />}
      />

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-card/50 rounded-lg p-4 border border-border">
            <p className="text-sm text-muted-foreground">Compliance Score</p>
            <p className="text-2xl font-bold text-foreground">{summary.compliance_score}%</p>
          </div>
          <div className="bg-card/50 rounded-lg p-4 border border-border">
            <p className="text-sm text-muted-foreground">Total Findings</p>
            <p className="text-2xl font-bold text-foreground">{summary.total_findings}</p>
          </div>
          <div className="bg-card/50 rounded-lg p-4 border border-red-500/30">
            <p className="text-sm text-muted-foreground">Open</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.open}</p>
          </div>
          <div className="bg-card/50 rounded-lg p-4 border border-red-500/30">
            <p className="text-sm text-muted-foreground">CAT I Open</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.cat_i_open}</p>
          </div>
          <div className="bg-card/50 rounded-lg p-4 border border-yellow-500/30">
            <p className="text-sm text-muted-foreground">CAT II Open</p>
            <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{summary.cat_ii_open}</p>
          </div>
          <div className="bg-card/50 rounded-lg p-4 border border-border">
            <p className="text-sm text-muted-foreground">CAT III Open</p>
            <p className="text-2xl font-bold text-muted-foreground">{summary.cat_iii_open}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-2">
        {(['findings', 'benchmarks', 'summary'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'findings' ? 'Findings' : tab === 'benchmarks' ? 'Benchmarks' : 'Summary'}
          </button>
        ))}
      </div>

      {/* Findings tab */}
      {activeTab === 'findings' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {['all', 'CAT I', 'CAT II', 'CAT III'].map(sev => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                className={`px-3 py-1 rounded text-xs ${severityFilter === sev ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground'}`}
              >{sev === 'all' ? 'All Severities' : sev}</button>
            ))}
          </div>

          <div className="bg-card/50 rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left p-3">Rule ID</th>
                  <th className="text-left p-3">Title</th>
                  <th className="text-left p-3">Severity</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Host</th>
                </tr>
              </thead>
              <tbody>
                {filteredFindings.map(f => (
                  <tr key={f.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-3 font-mono text-blue-600 dark:text-blue-300">{f.rule_id}</td>
                    <td className="p-3 text-foreground">{f.title}</td>
                    <td className="p-3">{severityBadge(f.severity)}</td>
                    <td className="p-3">
                      <span className="flex items-center gap-1.5">
                        {statusIcon(f.status)}
                        <span className="text-muted-foreground">{statusLabel(f.status)}</span>
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">{f.host}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Benchmarks tab */}
      {activeTab === 'benchmarks' && (
        <div className="bg-card/50 rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left p-3">Benchmark</th>
                <th className="text-left p-3">Version</th>
                <th className="text-left p-3">Release</th>
                <th className="text-left p-3">Profile</th>
                <th className="text-left p-3">Total Rules</th>
                <th className="text-left p-3">Findings</th>
                <th className="text-left p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {benchmarks.map(b => (
                <tr key={b.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="p-3 font-mono text-blue-600 dark:text-blue-300">{b.id}</td>
                  <td className="p-3 text-foreground">{b.version}</td>
                  <td className="p-3 text-muted-foreground">{b.release}</td>
                  <td className="p-3 text-muted-foreground">{b.profile}</td>
                  <td className="p-3 text-foreground">{b.total_rules}</td>
                  <td className="p-3 text-yellow-700 dark:text-yellow-400">{b.findings_count}</td>
                  <td className="p-3">
                    <span className="flex items-center gap-1.5">
                      {b.status === 'compliant'
                        ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                        : <AlertTriangle className="w-4 h-4 text-yellow-400" />
                      }
                      <span className="text-muted-foreground capitalize">{b.status}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary tab */}
      {activeTab === 'summary' && summary && (
        <div className="space-y-4">
          <div className="bg-card/50 rounded-lg border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">STIG Assessment Overview</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Findings</p>
                <p className="text-xl font-bold text-foreground">{summary.total_findings}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Open Findings</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">{summary.open}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Compliance Score</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-linear-to-r from-blue-500 to-green-500 rounded-full"
                      style={{ width: `${summary.compliance_score}%` }}
                    />
                  </div>
                  <span className="text-foreground font-bold">{summary.compliance_score}%</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last Evaluated</p>
                <p className="text-sm text-muted-foreground">{new Date(summary.evaluated_at).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Severity breakdown */}
          <div className="bg-card/50 rounded-lg border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Severity Breakdown</h3>
            <div className="space-y-3">
              {[
                { label: 'CAT I (Critical)', count: summary.cat_i_open, color: 'bg-red-500', textColor: 'text-red-600 dark:text-red-400' },
                { label: 'CAT II (Medium)', count: summary.cat_ii_open, color: 'bg-yellow-500', textColor: 'text-yellow-700 dark:text-yellow-400' },
                { label: 'CAT III (Low)', count: summary.cat_iii_open, color: 'bg-slate-400 dark:bg-slate-500', textColor: 'text-muted-foreground' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="w-36 text-sm text-foreground">{item.label}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.color} rounded-full`}
                      style={{ width: summary.total_findings > 0 ? `${(item.count / summary.total_findings) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className={`text-sm w-12 text-right font-bold ${item.textColor}`}>{item.count}</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

export default function STIGDashboard() {
  return (<>
    <STIGDashboardContent />
    <UnifiedDashboard config={stigDashboardConfig} />
  </>)
}
