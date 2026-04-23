import React from 'react'
import { useState, useEffect } from 'react'
import {
  Monitor, CheckCircle2, Loader2,
  ArrowRight, Clock, XCircle
} from 'lucide-react'
import { authFetch } from '../../lib/api'

// ── Types ───────────────────────────────────────────────────────────────

interface SIEMEvent {
  id: string
  timestamp: string
  source: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  category: string
  message: string
  cluster: string
}

interface SIEMAlert {
  id: string
  name: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'active' | 'acknowledged' | 'resolved'
  source: string
  triggered_at: string
  correlated_events: number
}

interface SIEMSummary {
  total_events: number
  events_last_24h: number
  total_alerts: number
  active_alerts: number
  critical_alerts: number
  high_alerts: number
  medium_alerts: number
  low_alerts: number
  top_sources: Array<{ source: string; count: number }>
  ingestion_rate: number
}

// ── Severity helpers ────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-blue-400',
  info: 'text-gray-400',
}

const SEVERITY_BG: Record<string, string> = {
  critical: 'bg-red-500/20 border-red-500/30',
  high: 'bg-orange-500/20 border-orange-500/30',
  medium: 'bg-yellow-500/20 border-yellow-500/30',
  low: 'bg-blue-500/20 border-blue-500/30',
  info: 'bg-gray-500/20 border-gray-500/30',
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  active: <XCircle className="w-4 h-4 text-red-400" />,
  acknowledged: <Clock className="w-4 h-4 text-yellow-400" />,
  resolved: <CheckCircle2 className="w-4 h-4 text-green-400" />,
}

export default function SIEMDashboard() {
  const [events, setEvents] = useState<SIEMEvent[]>([])
  const [alerts, setAlerts] = useState<SIEMAlert[]>([])
  const [summary, setSummary] = useState<SIEMSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'events' | 'alerts' | 'overview'>('overview')

  useEffect(() => {
    const load = async () => {
      try {
        const [eRes, aRes, sRes] = await Promise.all([
          authFetch('/api/v1/compliance/siem/events'),
          authFetch('/api/v1/compliance/siem/alerts'),
          authFetch('/api/v1/compliance/siem/summary'),
        ])
        if (!eRes.ok || !aRes.ok || !sRes.ok) throw new Error('Failed to fetch SIEM data')
        setEvents(await eRes.json())
        setAlerts(await aRes.json())
        setSummary(await sRes.json())
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      <span className="ml-3 text-gray-300">Loading SIEM data…</span>
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
        <Monitor className="w-8 h-8 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">SIEM Integration</h1>
          <p className="text-gray-400">Security event monitoring, log aggregation, and alert correlation</p>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-gray-400">Events (24h)</p>
            <p className="text-2xl font-bold text-white">{summary.events_last_24h.toLocaleString()}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-red-500/30">
            <p className="text-sm text-gray-400">Critical Alerts</p>
            <p className="text-2xl font-bold text-red-400">{summary.critical_alerts}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-yellow-500/30">
            <p className="text-sm text-gray-400">Active Alerts</p>
            <p className="text-2xl font-bold text-yellow-400">{summary.active_alerts}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-blue-500/30">
            <p className="text-sm text-gray-400">Ingestion Rate</p>
            <p className="text-2xl font-bold text-blue-400">{summary.ingestion_rate}/s</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700 pb-2">
        {(['overview', 'events', 'alerts'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab === 'overview' ? 'Overview' : tab === 'events' ? 'Event Timeline' : 'Alert Correlation'}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Severity distribution */}
            <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Severity Distribution</h3>
              <div className="space-y-3">
                {[
                  { label: 'Critical', count: summary.critical_alerts, color: 'bg-red-500' },
                  { label: 'High', count: summary.high_alerts, color: 'bg-orange-500' },
                  { label: 'Medium', count: summary.medium_alerts, color: 'bg-yellow-500' },
                  { label: 'Low', count: summary.low_alerts, color: 'bg-blue-500' },
                ].map(s => {
                  const total = summary.total_alerts || 1
                  const pct = Math.round((s.count / total) * 100)
                  return (
                    <div key={s.label} className="flex items-center gap-3">
                      <span className="w-16 text-sm text-gray-300">{s.label}</span>
                      <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full ${s.color} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm text-white w-8 text-right">{s.count}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Top sources */}
            <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Top Event Sources</h3>
              <div className="space-y-3">
                {summary.top_sources.map(src => (
                  <div key={src.source} className="flex items-center gap-3">
                    <span className="w-32 text-sm text-gray-300 truncate">{src.source}</span>
                    <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.round((src.count / summary.events_last_24h) * 100)}%` }} />
                    </div>
                    <span className="text-sm text-white w-16 text-right">{src.count.toLocaleString()}</span>
                    <ArrowRight className="w-4 h-4 text-gray-500" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Events tab */}
      {activeTab === 'events' && (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left p-3">Time</th>
                <th className="text-left p-3">Severity</th>
                <th className="text-left p-3">Source</th>
                <th className="text-left p-3">Category</th>
                <th className="text-left p-3">Message</th>
                <th className="text-left p-3">Cluster</th>
              </tr>
            </thead>
            <tbody>
              {events.map(evt => (
                <tr key={evt.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="p-3 text-gray-300 text-xs">{new Date(evt.timestamp).toLocaleTimeString()}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs border ${SEVERITY_BG[evt.severity]} ${SEVERITY_COLORS[evt.severity]}`}>
                      {evt.severity}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-blue-300">{evt.source}</td>
                  <td className="p-3 text-gray-300">{evt.category}</td>
                  <td className="p-3 text-white truncate max-w-xs">{evt.message}</td>
                  <td className="p-3 text-gray-300">{evt.cluster}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Alerts tab */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left p-3">Alert</th>
                  <th className="text-left p-3">Severity</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Source</th>
                  <th className="text-left p-3">Triggered</th>
                  <th className="text-left p-3">Correlated</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map(alert => (
                  <tr key={alert.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="p-3 text-white font-medium">{alert.name}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs border ${SEVERITY_BG[alert.severity]} ${SEVERITY_COLORS[alert.severity]}`}>
                        {alert.severity}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="flex items-center gap-1.5">
                        {STATUS_ICON[alert.status]}
                        <span className="text-gray-300 capitalize">{alert.status}</span>
                      </span>
                    </td>
                    <td className="p-3 font-mono text-blue-300">{alert.source}</td>
                    <td className="p-3 text-gray-300 text-xs">{new Date(alert.triggered_at).toLocaleString()}</td>
                    <td className="p-3 text-white">{alert.correlated_events}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
