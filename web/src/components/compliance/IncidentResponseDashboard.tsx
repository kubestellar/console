import React, { memo } from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  CheckCircle2, Loader2, Clock,
  XCircle, ArrowRight, Play, Shield
} from 'lucide-react'
import { authFetch } from '../../lib/api'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'

// ── Types ───────────────────────────────────────────────────────────────

interface Incident {
  id: string
  title: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'open' | 'investigating' | 'mitigating' | 'resolved' | 'closed'
  assignee: string
  created_at: string
  updated_at: string
  escalation_level: number
  cluster: string
  playbook_id: string | null
}

interface IncidentMetrics {
  total_incidents: number
  active_incidents: number
  resolved_last_30d: number
  mttr_hours: number
  mttr_trend: 'improving' | 'stable' | 'degrading'
  escalation_rate: number
  by_severity: { critical: number; high: number; medium: number; low: number }
  by_status: { open: number; investigating: number; mitigating: number; resolved: number; closed: number }
}

interface Playbook {
  id: string
  name: string
  description: string
  last_executed: string
  execution_count: number
  avg_resolution_min: number
  status: 'active' | 'draft' | 'deprecated'
  steps: number
}

// ── Helpers ─────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-blue-400',
}

const SEVERITY_BG: Record<string, string> = {
  critical: 'bg-red-500/20 border-red-500/30',
  high: 'bg-orange-500/20 border-orange-500/30',
  medium: 'bg-yellow-500/20 border-yellow-500/30',
  low: 'bg-blue-500/20 border-blue-500/30',
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  open: <XCircle className="w-4 h-4 text-red-400" />,
  investigating: <Clock className="w-4 h-4 text-yellow-400" />,
  mitigating: <Shield className="w-4 h-4 text-orange-400" />,
  resolved: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  closed: <CheckCircle2 className="w-4 h-4 text-gray-400" />,
}

const TREND_COLORS: Record<string, string> = {
  improving: 'text-green-400',
  stable: 'text-blue-400',
  degrading: 'text-red-400',
}

const IncidentResponseDashboard = memo(function IncidentResponseDashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [metrics, setMetrics] = useState<IncidentMetrics | null>(null)
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'incidents' | 'playbooks' | 'metrics'>('incidents')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const cancelledRef = useRef(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [iRes, mRes, pRes] = await Promise.all([
        authFetch('/api/v1/compliance/incidents'),
        authFetch('/api/v1/compliance/incidents/metrics'),
        authFetch('/api/v1/compliance/incidents/playbooks'),
      ])
      if (!iRes.ok || !mRes.ok || !pRes.ok) throw new Error('Failed to fetch incident data')
      const iData = await iRes.json()
      const mData = await mRes.json()
      const pData = await pRes.json()
      if (cancelledRef.current) return
      setIncidents(iData)
      setMetrics(mData)
      setPlaybooks(pData)
    } catch (e: unknown) {
      if (cancelledRef.current) return
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      if (cancelledRef.current) return
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cancelledRef.current = false
    fetchData()
    return () => { cancelledRef.current = true }
  }, [fetchData])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      <span className="ml-3 text-gray-300">Loading incident data…</span>
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
        title="Incident Response"
        subtitle="Security incident tracking, response timelines, and playbook execution"
        isFetching={loading}
        onRefresh={fetchData}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="incident-auto-refresh"
        rightExtra={<RotatingTip page="compliance" />}
      />

      {/* Summary cards */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800/50 rounded-lg p-4 border border-red-500/30">
            <p className="text-sm text-gray-400">Active Incidents</p>
            <p className="text-2xl font-bold text-red-400">{metrics.active_incidents}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-gray-400">MTTR</p>
            <p className="text-2xl font-bold text-white">{metrics.mttr_hours}h</p>
            <p className={`text-xs ${TREND_COLORS[metrics.mttr_trend]}`}>{metrics.mttr_trend}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-green-500/30">
            <p className="text-sm text-gray-400">Resolved (30d)</p>
            <p className="text-2xl font-bold text-green-400">{metrics.resolved_last_30d}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-yellow-500/30">
            <p className="text-sm text-gray-400">Escalation Rate</p>
            <p className="text-2xl font-bold text-yellow-400">{metrics.escalation_rate}%</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700 pb-2">
        {(['incidents', 'playbooks', 'metrics'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab === 'incidents' ? 'Active Incidents' : tab === 'playbooks' ? 'Playbooks' : 'MTTR Metrics'}
          </button>
        ))}
      </div>

      {/* Incidents tab */}
      {activeTab === 'incidents' && (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left p-3">ID</th>
                <th className="text-left p-3">Title</th>
                <th className="text-left p-3">Severity</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Assignee</th>
                <th className="text-left p-3">Escalation</th>
                <th className="text-left p-3">Cluster</th>
                <th className="text-left p-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map(inc => (
                <tr key={inc.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="p-3 font-mono text-blue-300">{inc.id}</td>
                  <td className="p-3 text-white font-medium">{inc.title}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs border ${SEVERITY_BG[inc.severity]} ${SEVERITY_COLORS[inc.severity]}`}>
                      {inc.severity}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="flex items-center gap-1.5">
                      {STATUS_ICON[inc.status]}
                      <span className="text-gray-300 capitalize">{inc.status}</span>
                    </span>
                  </td>
                  <td className="p-3 text-gray-300">{inc.assignee}</td>
                  <td className="p-3 text-white">L{inc.escalation_level}</td>
                  <td className="p-3 text-gray-300">{inc.cluster}</td>
                  <td className="p-3 text-gray-300 text-xs">{new Date(inc.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Playbooks tab */}
      {activeTab === 'playbooks' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {playbooks.map(pb => (
            <div key={pb.id} className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <Play className="w-4 h-4 text-green-400" />
                  {pb.name}
                </h3>
                <span className={`px-2 py-0.5 rounded text-xs ${
                  pb.status === 'active' ? 'bg-green-500/20 text-green-400' :
                  pb.status === 'draft' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>{pb.status}</span>
              </div>
              <p className="text-sm text-gray-400 mb-3">{pb.description}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-gray-500">Runs</p>
                  <p className="text-sm font-bold text-white">{pb.execution_count}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Steps</p>
                  <p className="text-sm font-bold text-white">{pb.steps}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Avg Resolve</p>
                  <p className="text-sm font-bold text-white">{pb.avg_resolution_min}m</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Metrics tab */}
      {activeTab === 'metrics' && metrics && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* By severity */}
            <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Incidents by Severity</h3>
              <div className="space-y-3">
                {Object.entries(metrics.by_severity).map(([sev, count]) => {
                  const total = metrics.total_incidents || 1
                  const pct = Math.round((count / total) * 100)
                  return (
                    <div key={sev} className="flex items-center gap-3">
                      <span className={`w-16 text-sm capitalize ${SEVERITY_COLORS[sev] || 'text-gray-300'}`}>{sev}</span>
                      <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm text-white w-8 text-right">{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* By status */}
            <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Incidents by Status</h3>
              <div className="space-y-3">
                {Object.entries(metrics.by_status).map(([st, count]) => (
                  <div key={st} className="flex items-center gap-3">
                    {STATUS_ICON[st] || <ArrowRight className="w-4 h-4 text-gray-500" />}
                    <span className="w-24 text-sm text-gray-300 capitalize">{st}</span>
                    <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.round((count / (metrics.total_incidents || 1)) * 100)}%` }} />
                    </div>
                    <span className="text-sm text-white w-8 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* MTTR trend */}
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Mean Time to Resolution</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-400">Current MTTR</p>
                <p className="text-2xl font-bold text-white">{metrics.mttr_hours}h</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Trend</p>
                <p className={`text-2xl font-bold capitalize ${TREND_COLORS[metrics.mttr_trend]}`}>{metrics.mttr_trend}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Escalation Rate</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${metrics.escalation_rate}%` }} />
                  </div>
                  <span className="text-white font-bold">{metrics.escalation_rate}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

export default IncidentResponseDashboard
