import { useState, useEffect, useMemo } from 'react'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { fedrampDashboardConfig } from '../../config/dashboards/fedramp'
import {
  CheckCircle2, XCircle, AlertTriangle, Loader2,
  Shield, ArrowRight, Clock
} from 'lucide-react'
import { authFetch } from '../../lib/api'

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
  authorization_status: string
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
    case 'satisfied': return <CheckCircle2 className="w-4 h-4 text-green-400" />
    case 'partially_satisfied': return <AlertTriangle className="w-4 h-4 text-yellow-400" />
    case 'planned': return <Clock className="w-4 h-4 text-blue-400" />
    default: return <XCircle className="w-4 h-4 text-gray-400" />
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
    case 'satisfied': return 'text-green-400'
    case 'partially_satisfied': return 'text-yellow-400'
    case 'planned': return 'text-blue-400'
    default: return 'text-gray-400'
  }
}

const milestoneStatusBadge = (status: string) => {
  switch (status) {
    case 'open': return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">Open</span>
    case 'delayed': return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">Delayed</span>
    case 'closed': return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30">Closed</span>
    default: return <span className="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-300">{status}</span>
  }
}

export function FedRAMPDashboardContent() {
  const [controls, setControls] = useState<Control[]>([])
  const [poams, setPOAMs] = useState<POAM[]>([])
  const [score, setScore] = useState<FedRAMPScore | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'controls' | 'poams' | 'readiness'>('controls')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    const load = async () => {
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
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filteredControls = useMemo(() => {
    if (statusFilter === 'all') return controls
    return controls.filter(c => c.status === statusFilter)
  }, [controls, statusFilter])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      <span className="ml-3 text-gray-300">Loading FedRAMP readiness…</span>
    </div>
  )

  if (error) return (
    <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-lg">
      <p className="text-red-400">{error}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-8 h-8 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">FedRAMP Readiness</h1>
          <p className="text-gray-400">Federal Risk and Authorization Management Program compliance assessment</p>
        </div>
      </div>

      {/* Summary cards */}
      {score && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-gray-400">Overall Score</p>
            <p className="text-2xl font-bold text-white">{score.overall_score}%</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-gray-400">Authorization</p>
            <p className="text-2xl font-bold text-white capitalize">{score.authorization_status}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-green-500/30">
            <p className="text-sm text-gray-400">Satisfied</p>
            <p className="text-2xl font-bold text-green-400">{score.controls_satisfied}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-yellow-500/30">
            <p className="text-sm text-gray-400">Partial</p>
            <p className="text-2xl font-bold text-yellow-400">{score.controls_partially_satisfied}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-blue-500/30">
            <p className="text-sm text-gray-400">Impact Level</p>
            <p className="text-2xl font-bold text-blue-400 capitalize">{score.impact_level}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700 pb-2">
        {(['controls', 'poams', 'readiness'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
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
                className={`px-3 py-1 rounded text-xs ${statusFilter === s ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300'}`}
              >{s === 'all' ? 'All Statuses' : controlStatusLabel(s)}</button>
            ))}
          </div>

          <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left p-3">Control</th>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Family</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Responsible</th>
                </tr>
              </thead>
              <tbody>
                {filteredControls.map(c => (
                  <tr key={c.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="p-3 font-mono text-blue-300">{c.id}</td>
                    <td className="p-3 text-white">{c.name}</td>
                    <td className="p-3"><span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 text-xs">{c.family}</span></td>
                    <td className="p-3">
                      <span className="flex items-center gap-1.5">
                        {controlStatusIcon(c.status)}
                        <span className={controlStatusColor(c.status)}>{controlStatusLabel(c.status)}</span>
                      </span>
                    </td>
                    <td className="p-3 text-gray-300">{c.responsible}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* POAMs tab */}
      {activeTab === 'poams' && (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left p-3">POAM ID</th>
                <th className="text-left p-3">Control</th>
                <th className="text-left p-3">Title</th>
                <th className="text-left p-3">Risk</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Scheduled</th>
                <th className="text-left p-3">Vendor</th>
              </tr>
            </thead>
            <tbody>
              {poams.map(p => (
                <tr key={p.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="p-3 font-mono text-blue-300">{p.id}</td>
                  <td className="p-3 text-gray-300">{p.control_id}</td>
                  <td className="p-3 text-white">{p.title}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      p.risk_level === 'high' ? 'bg-red-500/20 text-red-400' :
                      p.risk_level === 'moderate' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>{p.risk_level}</span>
                  </td>
                  <td className="p-3">{milestoneStatusBadge(p.milestone_status)}</td>
                  <td className="p-3 text-gray-300 text-xs">{new Date(p.scheduled_completion).toLocaleDateString()}</td>
                  <td className="p-3">
                    {p.vendor_dependency
                      ? <span className="text-yellow-400 text-xs">Yes</span>
                      : <span className="text-gray-500 text-xs">No</span>
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
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">FedRAMP Readiness Overview</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-400">Total Controls</p>
                <p className="text-xl font-bold text-white">{score.controls_total}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Authorization Status</p>
                <p className="text-xl font-bold text-white capitalize">{score.authorization_status}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Overall Score</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full"
                      style={{ width: `${score.overall_score}%` }}
                    />
                  </div>
                  <span className="text-white font-bold">{score.overall_score}%</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-400">Impact Level</p>
                <p className="text-xl font-bold text-blue-400 capitalize">{score.impact_level}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Open POAMs</p>
                <p className="text-xl font-bold text-red-400">{score.poams_open}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Last Evaluated</p>
                <p className="text-sm text-gray-300">{new Date(score.evaluated_at).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Control status breakdown */}
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Control Status Breakdown</h3>
            <div className="space-y-3">
              {[
                { label: 'Satisfied', count: score.controls_satisfied, color: 'bg-green-500', textColor: 'text-green-400' },
                { label: 'Partially Satisfied', count: score.controls_partially_satisfied, color: 'bg-yellow-500', textColor: 'text-yellow-400' },
                { label: 'Planned', count: score.controls_planned, color: 'bg-blue-500', textColor: 'text-blue-400' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="w-40 text-sm text-gray-300">{item.label}</span>
                  <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.color} rounded-full`}
                      style={{ width: score.controls_total > 0 ? `${(item.count / score.controls_total) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className={`text-sm w-12 text-right font-bold ${item.textColor}`}>{item.count}</span>
                  <ArrowRight className="w-4 h-4 text-gray-500" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function FedRAMPDashboard() {
  return <UnifiedDashboard config={fedrampDashboardConfig} />
}
