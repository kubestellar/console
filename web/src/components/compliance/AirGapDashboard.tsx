import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { airgapDashboardConfig } from '../../config/dashboards/airgap'
import {
  CheckCircle2, XCircle, AlertTriangle, Loader2,
  ArrowRight
} from 'lucide-react'
import { authFetch } from '../../lib/api'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'

interface Requirement {
  id: string
  name: string
  description: string
  category: string
  status: string
  details: string
}

interface ClusterReadiness {
  id: string
  name: string
  readiness_score: number
  status: string
  requirements_met: number
  requirements_total: number
  last_checked: string
}

interface AirGapSummary {
  total_requirements: number
  ready: number
  not_ready: number
  partial: number
  overall_readiness: number
  evaluated_at: string
}

const CATEGORIES = ['all', 'registry', 'dns', 'ntp', 'updates', 'telemetry'] as const

const statusIcon = (status: string) => {
  switch (status) {
    case 'ready': return <CheckCircle2 className="w-4 h-4 text-green-400" />
    case 'not_ready': return <XCircle className="w-4 h-4 text-red-400" />
    case 'partial': return <AlertTriangle className="w-4 h-4 text-yellow-400" />
    default: return <AlertTriangle className="w-4 h-4 text-gray-400" />
  }
}

const statusLabel = (status: string) => {
  switch (status) {
    case 'ready': return 'Ready'
    case 'not_ready': return 'Not Ready'
    case 'partial': return 'Partial'
    default: return status
  }
}

const statusColor = (status: string) => {
  switch (status) {
    case 'ready': return 'text-green-400'
    case 'not_ready': return 'text-red-400'
    case 'partial': return 'text-yellow-400'
    default: return 'text-gray-400'
  }
}

export const AirGapDashboardContent = memo(function AirGapDashboardContent() {
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [clusters, setClusters] = useState<ClusterReadiness[]>([])
  const [summary, setSummary] = useState<AirGapSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'requirements' | 'clusters' | 'summary'>('requirements')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rRes, cRes, sRes] = await Promise.all([
        authFetch('/api/compliance/airgap/requirements'),
        authFetch('/api/compliance/airgap/clusters'),
        authFetch('/api/compliance/airgap/summary'),
      ])
      if (!rRes.ok || !cRes.ok || !sRes.ok) throw new Error('Failed to fetch air-gap data')
      setRequirements(await rRes.json())
      setClusters(await cRes.json())
      setSummary(await sRes.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredRequirements = useMemo(() => {
    if (categoryFilter === 'all') return requirements
    return requirements.filter(r => r.category === categoryFilter)
  }, [requirements, categoryFilter])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      <span className="ml-3 text-muted-foreground">Loading air-gap readiness…</span>
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
        title="Air-Gap Readiness"
        subtitle="Disconnected environment readiness assessment for Kubernetes clusters"
        isFetching={loading}
        onRefresh={fetchData}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="airgap-auto-refresh"
        rightExtra={<RotatingTip page="compliance" />}
      />

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-card/50 rounded-lg p-4 border border-border">
            <p className="text-sm text-muted-foreground">Overall Readiness</p>
            <p className="text-2xl font-bold text-foreground">{summary.overall_readiness}%</p>
          </div>
          <div className="bg-card/50 rounded-lg p-4 border border-border">
            <p className="text-sm text-muted-foreground">Total Requirements</p>
            <p className="text-2xl font-bold text-foreground">{summary.total_requirements}</p>
          </div>
          <div className="bg-card/50 rounded-lg p-4 border border-green-500/30">
            <p className="text-sm text-muted-foreground">Ready</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{summary.ready}</p>
          </div>
          <div className="bg-card/50 rounded-lg p-4 border border-red-500/30">
            <p className="text-sm text-muted-foreground">Not Ready</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.not_ready}</p>
          </div>
          <div className="bg-card/50 rounded-lg p-4 border border-yellow-500/30">
            <p className="text-sm text-muted-foreground">Partial</p>
            <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{summary.partial}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-2">
        {(['requirements', 'clusters', 'summary'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'requirements' ? 'Requirements' : tab === 'clusters' ? 'Clusters' : 'Summary'}
          </button>
        ))}
      </div>

      {/* Requirements tab */}
      {activeTab === 'requirements' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1 rounded text-xs capitalize ${categoryFilter === cat ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground'}`}
              >{cat === 'all' ? 'All Categories' : cat}</button>
            ))}
          </div>

          <div className="bg-card/50 rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left p-3">ID</th>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Category</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequirements.map(r => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-3 font-mono text-blue-600 dark:text-blue-300">{r.id}</td>
                    <td className="p-3 text-foreground">{r.name}</td>
                    <td className="p-3"><span className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-xs capitalize">{r.category}</span></td>
                    <td className="p-3">
                      <span className="flex items-center gap-1.5">
                        {statusIcon(r.status)}
                        <span className={statusColor(r.status)}>{statusLabel(r.status)}</span>
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs max-w-xs truncate">{r.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Clusters tab */}
      {activeTab === 'clusters' && (
        <div className="space-y-4">
          {clusters.map(cluster => (
            <div key={cluster.id} className="bg-card/50 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {statusIcon(cluster.status)}
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{cluster.name}</h3>
                    <p className="text-sm text-muted-foreground">{cluster.requirements_met} of {cluster.requirements_total} requirements met</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-foreground">{cluster.readiness_score}%</span>
                  <p className="text-xs text-muted-foreground">readiness</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      cluster.readiness_score >= 80 ? 'bg-green-500' :
                      cluster.readiness_score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${cluster.readiness_score}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">Last checked: {new Date(cluster.last_checked).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary tab */}
      {activeTab === 'summary' && summary && (
        <div className="space-y-4">
          <div className="bg-card/50 rounded-lg border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Air-Gap Assessment Overview</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Requirements</p>
                <p className="text-xl font-bold text-foreground">{summary.total_requirements}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Not Ready</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">{summary.not_ready}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Overall Readiness</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-linear-to-r from-blue-500 to-green-500 rounded-full"
                      style={{ width: `${summary.overall_readiness}%` }}
                    />
                  </div>
                  <span className="text-foreground font-bold">{summary.overall_readiness}%</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last Evaluated</p>
                <p className="text-sm text-muted-foreground">{new Date(summary.evaluated_at).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Cluster readiness breakdown */}
          <div className="bg-card/50 rounded-lg border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Cluster Readiness</h3>
            <div className="space-y-3">
              {clusters.map(c => (
                <div key={c.id} className="flex items-center gap-3">
                  <span className="w-40 text-sm text-foreground truncate">{c.name}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        c.readiness_score >= 80 ? 'bg-green-500' :
                        c.readiness_score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${c.readiness_score}%` }}
                    />
                  </div>
                  <span className="text-sm text-foreground w-12 text-right">{c.readiness_score}%</span>
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

export default function AirGapDashboard() {
  return (<>
    <AirGapDashboardContent />
    <UnifiedDashboard config={airgapDashboardConfig} />
  </>)
}
