import { useState, useEffect, useMemo, memo, useCallback } from 'react'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { fedrampDashboardConfig } from '../../config/dashboards/fedramp'
import {
  CheckCircle2, XCircle, AlertTriangle, Loader2,
  ArrowRight, Clock
} from 'lucide-react'
import { authFetch } from '../../lib/api'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'

interface Control {
  id: string
  name: string
  description: string
  family: string
  status: string
  responsible: string
  implementation: string
}

interface POAM {
  id: string
  control_id: string
  title: string
  description: string
  milestone_status: string
  scheduled_completion: string
  risk_level: string
  vendor_dependency: boolean
}

interface FedRAMPScore {
  overall_score: number
  authorization_status?: string | null
  impact_level: string
  controls_satisfied: number
  controls_partially_satisfied: number
  controls_planned: number
  controls_total: number
  poams_open: number
  poams_closed: number
  evaluated_at: string
}

const controlStatusIcon = (status: string) => {
  switch (status) {
    case 'satisfied': return <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
    case 'partially_satisfied': return <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
    case 'planned': return <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
    default: return <XCircle className="w-4 h-4 text-muted-foreground" />
  }
}

const controlStatusLabel = (status: string) => {
  switch (status) {
    case 'satisfied': return 'Satisfied'
    case 'partially_satisfied': return 'Partially Satisfied'
    case 'planned': return 'Planned'
    default: return status
  }
}

const controlStatusColor = (status: string) => {
  switch (status) {
    case 'satisfied': return 'text-green-700 dark:text-green-400 font-medium'
    case 'partially_satisfied': return 'text-yellow-700 dark:text-yellow-400 font-medium'
    case 'planned': return 'text-blue-700 dark:text-blue-400 font-medium'
    default: return 'text-muted-foreground'
  }
}

const authorizationStatusStyle = (status?: string | null) => {
  switch (status) {
    case 'authorized': return 'text-green-700 dark:text-green-400'
    case 'in_progress':
    case 'in_process': return 'text-orange-700 dark:text-orange-400'
    case 'pending': return 'text-yellow-700 dark:text-yellow-400'
    default: return 'text-foreground'
  }
}

const formatAuthorizationStatus = (status?: string | null) => status?.replace(/_/g, ' ') ?? 'Unknown'

const milestoneStatusBadge = (status: string) => {
  switch (status) {
    case 'open': return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-700 dark:text-red-400 border border-red-500/30">Open</span>
    case 'delayed': return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30">Delayed</span>
    case 'closed': return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-500/20 text-green-700 dark:text-green-400 border border-green-500/30">Closed</span>
    default: return <span className="px-2 py-0.5 rounded text-xs bg-secondary text-secondary-foreground">{status}</span>
  }
}

export const FedRAMPDashboardContent = memo(function FedRAMPDashboardContent() {
  const [controls, setControls] = useState<Control[]>([])
  const [poams, setPOAMs] = useState<POAM[]>([])
  const [score, setScore] = useState<FedRAMPScore | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'controls' | 'poams' | 'readiness'>('controls')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cRes, pRes, sRes] = await Promise.all([
        authFetch('/api/compliance/fedramp/controls'),
        authFetch('/api/compliance/fedramp/poams'),
        authFetch('/api/compliance/fedramp/score'),
      ])
      if (!cRes.ok || !pRes.ok || !sRes.ok) throw new Error('Failed to fetch FedRAMP data')
      setControls(await cRes.json())
      setPOAMs(await pRes.json())
      setScore(await sRes.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredControls = useMemo(() => {
    if (statusFilter === 'all') return controls
    return controls.filter(c => c.status === statusFilter)
  }, [controls, statusFilter])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <span className="ml-3 text-muted-foreground">Loading FedRAMP readiness…</span>
    </div>
  )

  if (error) return (
    <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-lg">
      <p className="text-red-600 dark:text-red-400">{error}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="FedRAMP Readiness"
        subtitle="Federal Risk and Authorization Management Program compliance assessment"
        isFetching={loading}
        onRefresh={fetchData}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="fedramp-auto-refresh"
        rightExtra={<RotatingTip page="compliance" />}
      />

      {/* Summary cards */}
      {score && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-card rounded-lg p-4 border border-border shadow-sm">
            <p className="text-sm text-muted-foreground">Overall Score</p>
            <p className="text-2xl font-bold text-foreground">{score.overall_score}%</p>
          </div>
          <div className="bg-card rounded-lg p-4 border border-border shadow-sm">
            <p className="text-sm text-muted-foreground">Authorization</p>
            <p className={`text-2xl font-bold capitalize ${authorizationStatusStyle(score.authorization_status)}`}>{formatAuthorizationStatus(score.authorization_status)}</p>
          </div>
          <div className="bg-card rounded-lg p-4 border border-green-500/30 shadow-sm">
            <p className="text-sm text-muted-foreground">Satisfied</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">{score.controls_satisfied}</p>
          </div>
          <div className="bg-card rounded-lg p-4 border border-yellow-500/30 shadow-sm">
            <p className="text-sm text-muted-foreground">Partial</p>
            <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{score.controls_partially_satisfied}</p>
          </div>
          <div className="bg-card rounded-lg p-4 border border-blue-500/30 shadow-sm">
            <p className="text-sm text-muted-foreground">Impact Level</p>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-400 capitalize">{score.impact_level}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-2">
        {(['controls', 'poams', 'readiness'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'controls' ? 'Controls' : tab === 'poams' ? 'POAMs' : 'Readiness'}
          </button>
        ))}
      </div>

      {/* Controls tab */}
      {activeTab === 'controls' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {['all', 'satisfied', 'partially_satisfied', 'planned'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded text-xs font-medium ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
              >{s === 'all' ? 'All Statuses' : controlStatusLabel(s)}</button>
            ))}
          </div>

          <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-border bg-muted/50">
                  <th className="text-left p-3 font-medium">Control</th>
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Family</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Responsible</th>
                </tr>
              </thead>
              <tbody>
                {filteredControls.map(c => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-3 font-mono text-primary">{c.id}</td>
                    <td className="p-3 text-foreground">{c.name}</td>
                    <td className="p-3"><span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-xs font-medium">{c.family}</span></td>
                    <td className="p-3">
                      <span className="flex items-center gap-1.5">
                        {controlStatusIcon(c.status)}
                        <span className={controlStatusColor(c.status)}>{controlStatusLabel(c.status)}</span>
                      </span>
                    </td>
                    <td className="p-3 text-foreground">{c.responsible}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* POAMs tab */}
      {activeTab === 'poams' && (
        <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b border-border bg-muted/50">
                <th className="text-left p-3 font-medium">POAM ID</th>
                <th className="text-left p-3 font-medium">Control</th>
                <th className="text-left p-3 font-medium">Title</th>
                <th className="text-left p-3 font-medium">Risk</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Scheduled</th>
                <th className="text-left p-3 font-medium">Vendor</th>
              </tr>
            </thead>
            <tbody>
              {poams.map(p => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="p-3 font-mono text-primary">{p.id}</td>
                  <td className="p-3 text-muted-foreground">{p.control_id}</td>
                  <td className="p-3 text-foreground">{p.title}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      p.risk_level === 'high' ? 'bg-red-500/20 text-red-700 dark:text-red-400' :
                      p.risk_level === 'moderate' ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400' :
                      'bg-muted text-muted-foreground'
                    }`}>{p.risk_level}</span>
                  </td>
                  <td className="p-3">{milestoneStatusBadge(p.milestone_status)}</td>
                  <td className="p-3 text-muted-foreground text-xs">{new Date(p.scheduled_completion).toLocaleDateString()}</td>
                  <td className="p-3">
                    {p.vendor_dependency
                      ? <span className="text-yellow-700 dark:text-yellow-400 text-xs font-medium">Yes</span>
                      : <span className="text-muted-foreground text-xs">No</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Readiness tab */}
      {activeTab === 'readiness' && score && (
        <div className="space-y-4">
          <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-foreground mb-4">FedRAMP Readiness Overview</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Controls</p>
                <p className="text-xl font-bold text-foreground">{score.controls_total}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Authorization Status</p>
                <p className={`text-xl font-bold capitalize ${authorizationStatusStyle(score.authorization_status)}`}>{formatAuthorizationStatus(score.authorization_status)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Overall Score</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-linear-to-r from-blue-500 to-green-500 rounded-full"
                      style={{ width: `${score.overall_score}%` }}
                    />
                  </div>
                  <span className="text-foreground font-bold">{score.overall_score}%</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Impact Level</p>
                <p className="text-xl font-bold text-blue-700 dark:text-blue-400 capitalize">{score.impact_level}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Open POAMs</p>
                <p className="text-xl font-bold text-red-700 dark:text-red-400">{score.poams_open}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last Evaluated</p>
                <p className="text-sm text-foreground">{new Date(score.evaluated_at).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Control status breakdown */}
          <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-foreground mb-4">Control Status Breakdown</h3>
            <div className="space-y-3">
              {[
                { label: 'Satisfied', count: score.controls_satisfied, color: 'bg-green-500', textColor: 'text-green-700 dark:text-green-400' },
                { label: 'Partially Satisfied', count: score.controls_partially_satisfied, color: 'bg-yellow-500', textColor: 'text-yellow-700 dark:text-yellow-400' },
                { label: 'Planned', count: score.controls_planned, color: 'bg-blue-500', textColor: 'text-blue-700 dark:text-blue-400' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="w-40 text-sm text-foreground">{item.label}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.color} rounded-full`}
                      style={{ width: score.controls_total > 0 ? `${(item.count / score.controls_total) * 100}%` : '0%' }}
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

export default function FedRAMPDashboard() {
  return (<>
    <FedRAMPDashboardContent />
    <UnifiedDashboard config={fedrampDashboardConfig} />
  </>)
}
