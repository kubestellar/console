import { useState, useEffect, useMemo, memo, useCallback, useRef } from 'react'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { riskRegisterDashboardConfig } from '../../config/dashboards/risk-register'
import {
  Loader2, AlertTriangle, CheckCircle2, Clock,
  ChevronRight, X, Filter,
} from 'lucide-react'
import { authFetch } from '../../lib/api'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'

// ── Types ─────────────────────────────────────────────────────────────

interface Risk {
  id: string
  name: string
  description: string
  category: string
  likelihood: number
  impact: number
  score: number
  owner: string
  status: string
  last_review: string
  next_review: string
  mitigation_plan: string
  controls: string[]
  created_at: string
}

interface CategorySummary {
  category: string
  count: number
  avg_score: number
  open: number
}

interface RegisterSummary {
  total_risks: number
  open_risks: number
  overdue_reviews: number
  avg_risk_score: number
  evaluated_at: string
}

// ── Constants ─────────────────────────────────────────────────────────

const RISK_CATEGORIES = ['All', 'Operational', 'Strategic', 'Financial', 'Compliance', 'Technology', 'Reputational'] as const
const RISK_STATUSES = ['All', 'Open', 'Mitigating', 'Accepted', 'Closed'] as const
const SEVERITY_FILTERS = ['All', 'Critical', 'High', 'Medium', 'Low'] as const

function severityFromScore(score: number): string {
  if (score >= 20) return 'Critical'
  if (score >= 15) return 'High'
  if (score >= 10) return 'Medium'
  return 'Low'
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'Critical': return 'text-red-400'
    case 'High': return 'text-red-300'
    case 'Medium': return 'text-orange-400'
    default: return 'text-green-400'
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'Open': return 'text-yellow-400'
    case 'Mitigating': return 'text-blue-400'
    case 'Accepted': return 'text-muted-foreground'
    case 'Closed': return 'text-green-400'
    default: return 'text-muted-foreground'
  }
}

// ── Component ─────────────────────────────────────────────────────────

interface ContentProps {
  onStateChange?: (state: { loading: boolean; error: string | null }) => void
}

export const RiskRegisterDashboardContent = memo(function RiskRegisterDashboardContent({ onStateChange }: ContentProps) {
  const [risks, setRisks] = useState<Risk[]>([])
  const [categories, setCategories] = useState<CategorySummary[]>([])
  const [summary, setSummary] = useState<RegisterSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [severityFilter, setSeverityFilter] = useState('All')
  const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const cancelledRef = useRef(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rRes, cRes, sRes] = await Promise.all([
        authFetch('/api/v1/compliance/erm/risk-register/risks'),
        authFetch('/api/v1/compliance/erm/risk-register/categories'),
        authFetch('/api/v1/compliance/erm/risk-register/summary'),
      ])
      if (!rRes.ok || !cRes.ok || !sRes.ok) throw new Error('Failed to fetch risk register data')
      const rData = await rRes.json()
      if (cancelledRef.current) return
      setRisks(Array.isArray(rData) ? rData : [])
      const cData = await cRes.json()
      setCategories(Array.isArray(cData) ? cData : [])
      const sData = await sRes.json()
      // Guard against non-object responses (e.g. catch-all mock returning [])
      setSummary(sData && typeof sData === 'object' && !Array.isArray(sData) && 'total_risks' in sData ? sData : null)
    } catch (e: unknown) {
      if (cancelledRef.current) return
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      if (!cancelledRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    cancelledRef.current = false
    fetchData()
    return () => { cancelledRef.current = true }
  }, [fetchData])

  useEffect(() => {
    onStateChange?.({ loading, error })
  }, [loading, error, onStateChange])

  const filteredRisks = useMemo(() => {
    return risks.filter(r => {
      if (categoryFilter !== 'All' && r.category !== categoryFilter) return false
      if (statusFilter !== 'All' && r.status !== statusFilter) return false
      if (severityFilter !== 'All' && severityFromScore(r.score) !== severityFilter) return false
      return true
    })
  }, [risks, categoryFilter, statusFilter, severityFilter])

  if (loading) return (
    <div className="flex items-center justify-center h-64 bg-gray-900 rounded-lg">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      <span className="ml-3 text-foreground">Loading risk register…</span>
    </div>
  )

  if (error) return (
    <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-lg space-y-3">
      <p className="text-red-400 font-medium">Unable to load risk register data</p>
      <p className="text-sm text-muted-foreground">{error}</p>
      <button
        onClick={fetchData}
        className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded text-sm text-red-300 transition-colors"
      >
        Retry
      </button>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <DashboardHeader
        title="Risk Register"
        subtitle="Comprehensive risk tracking with mitigation plans and controls"
        isFetching={loading}
        onRefresh={fetchData}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="risk-register-auto-refresh"
        rightExtra={<RotatingTip page="compliance" />}
      />

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-muted-foreground">Total Risks</p>
            <p className="text-2xl font-bold text-foreground">{summary.total_risks}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-yellow-500/30">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <p className="text-sm text-muted-foreground">Open Risks</p>
            </div>
            <p className="text-2xl font-bold text-yellow-400">{summary.open_risks}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-red-500/30">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-red-400" />
              <p className="text-sm text-muted-foreground">Overdue Reviews</p>
            </div>
            <p className="text-2xl font-bold text-red-400">{summary.overdue_reviews}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-muted-foreground">Avg Risk Score</p>
            <p className="text-2xl font-bold text-orange-400">{(summary.avg_risk_score ?? 0).toFixed(1)}</p>
          </div>
        </div>
      )}

      {/* Category breakdown */}
      {categories.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {categories.map(cat => (
            <button
              key={cat.category}
              onClick={() => setCategoryFilter(categoryFilter === cat.category ? 'All' : cat.category)}
              className={`bg-gray-800/50 rounded-lg p-3 border transition-colors text-left ${
                categoryFilter === cat.category ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <p className="text-xs text-muted-foreground truncate">{cat.category}</p>
              <p className="text-lg font-bold text-foreground">{cat.count}</p>
              <p className="text-xs text-muted-foreground">{cat.open} open · avg {(cat.avg_score ?? 0).toFixed(1)}</p>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-foreground"
        >
          {RISK_CATEGORIES.map(c => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-foreground"
        >
          {RISK_STATUSES.map(s => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>)}
        </select>
        <select
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-foreground"
        >
          {SEVERITY_FILTERS.map(s => <option key={s} value={s}>{s === 'All' ? 'All Severities' : s}</option>)}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{filteredRisks.length} risks shown</span>
      </div>

      {/* Risk table */}
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b border-gray-700">
              <th className="text-left p-3">ID</th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Category</th>
              <th className="text-center p-3">L</th>
              <th className="text-center p-3">I</th>
              <th className="text-center p-3">Score</th>
              <th className="text-left p-3">Owner</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Last Review</th>
              <th className="text-left p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredRisks.map(r => (
              <tr key={r.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer" tabIndex={0} onClick={() => setSelectedRisk(r)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedRisk(r) } }}>
                <td className="p-3 font-mono text-blue-300">{r.id}</td>
                <td className="p-3 text-foreground">{r.name}</td>
                <td className="p-3"><span className="px-2 py-0.5 rounded bg-gray-700 text-foreground text-xs">{r.category}</span></td>
                <td className="p-3 text-center text-foreground">{r.likelihood}</td>
                <td className="p-3 text-center text-foreground">{r.impact}</td>
                <td className="p-3 text-center">
                  <span className={`font-bold ${severityColor(severityFromScore(r.score))}`}>{r.score}</span>
                </td>
                <td className="p-3 text-foreground">{r.owner}</td>
                <td className="p-3"><span className={`text-xs font-medium ${statusColor(r.status)}`}>{r.status}</span></td>
                <td className="p-3 text-xs text-muted-foreground">{new Date(r.last_review).toLocaleDateString()}</td>
                <td className="p-3"><ChevronRight className="w-4 h-4 text-muted-foreground" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selectedRisk && (
        <div className="bg-gray-800/50 rounded-lg border border-blue-500/30 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{selectedRisk.name}</h2>
              <p className="text-sm text-muted-foreground">{selectedRisk.id} · {selectedRisk.category}</p>
            </div>
            <button
              onClick={() => setSelectedRisk(null)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close risk details"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-sm text-foreground mb-4">{selectedRisk.description}</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-muted-foreground">Likelihood</p>
              <p className="text-lg font-bold text-foreground">{selectedRisk.likelihood}/5</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Impact</p>
              <p className="text-lg font-bold text-foreground">{selectedRisk.impact}/5</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Risk Score</p>
              <p className={`text-lg font-bold ${severityColor(severityFromScore(selectedRisk.score))}`}>{selectedRisk.score}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className={`text-lg font-bold ${statusColor(selectedRisk.status)}`}>{selectedRisk.status}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Mitigation Plan</p>
              <p className="text-sm text-foreground bg-gray-900/50 rounded p-3">{selectedRisk.mitigation_plan}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Controls</p>
              <div className="flex gap-2 flex-wrap">
                {selectedRisk.controls.map(c => (
                  <span key={c} className="px-2 py-1 rounded bg-gray-700 text-foreground text-xs flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-400" />{c}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex gap-6 text-xs text-muted-foreground">
              <span>Owner: {selectedRisk.owner}</span>
              <span>Last Review: {new Date(selectedRisk.last_review).toLocaleDateString()}</span>
              <span>Next Review: {new Date(selectedRisk.next_review).toLocaleDateString()}</span>
              <span>Created: {new Date(selectedRisk.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

export default function RiskRegisterDashboard() {
  const [contentState, setContentState] = useState<{ loading: boolean; error: string | null }>({ loading: true, error: null })

  return (<>
    <RiskRegisterDashboardContent onStateChange={setContentState} />
    {!contentState.error && !contentState.loading && (
      <UnifiedDashboard config={riskRegisterDashboardConfig} />
    )}
  </>)
}
