import { useState, useEffect } from 'react'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { sessionManagementDashboardConfig } from '../../config/dashboards/session-management'
import {
  Clock, CheckCircle2, XCircle, Loader2, RefreshCw,
  Users, ShieldCheck, AlertTriangle, Monitor,
} from 'lucide-react'
import { authFetch } from '../../lib/api'

interface ActiveSession {
  id: string; user: string; login_time: string; last_activity: string
  ip_address: string; user_agent: string; provider: string
  status: string; expires_at: string
}

interface SessionPolicy {
  id: string; name: string; description: string
  idle_timeout_minutes: number; absolute_timeout_hours: number
  max_concurrent: number; enforce_mfa: boolean; scope: string
}

interface SessionSummary {
  active_sessions: number; unique_users: number; avg_duration_minutes: number
  sessions_terminated_24h: number; policy_violations: number
  mfa_sessions_pct: number; evaluated_at: string
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  idle: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  expired: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  terminated: 'bg-red-500/20 text-red-300 border-red-500/30',
}

export function SessionDashboardContent() {
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [policies, setPolicies] = useState<SessionPolicy[]>([])
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'sessions' | 'policies'>('sessions')

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [smRes, sRes, pRes] = await Promise.all([
        authFetch('/api/identity/sessions/summary'),
        authFetch('/api/identity/sessions/active'),
        authFetch('/api/identity/sessions/policies'),
      ])
      if (!smRes.ok || !sRes.ok || !pRes.ok) throw new Error('Failed to load session data')
      setSummary(await smRes.json())
      setSessions(await sRes.json())
      setPolicies(await pRes.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load session data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      <span className="ml-3 text-gray-400">Loading session data…</span>
    </div>
  )

  if (error) return (
    <div className="p-6 text-center">
      <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
      <p className="text-red-300 mb-4">{error}</p>
      <button onClick={fetchData} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm">Retry</button>
    </div>
  )

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Clock className="w-7 h-7 text-blue-400" />
            Session Management
          </h1>
          <p className="text-gray-400 mt-1">
            Active session monitoring and policy enforcement
          </p>
        </div>
        <button onClick={fetchData} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Refresh">
          <RefreshCw className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Active Sessions</div>
            <div className="text-3xl font-bold text-blue-400">{summary.active_sessions}</div>
            <div className="text-xs text-gray-500 mt-1">
              {summary.sessions_terminated_24h} terminated in 24h
            </div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Unique Users</div>
            <div className="text-3xl font-bold text-purple-400">{summary.unique_users}</div>
            <div className="text-xs text-gray-500 mt-1">with active sessions</div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Avg Duration</div>
            <div className="text-3xl font-bold text-cyan-400">{summary.avg_duration_minutes}m</div>
            <div className="text-xs text-gray-500 mt-1">MFA: {summary.mfa_sessions_pct}% of sessions</div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Policy Violations</div>
            <div className={`text-3xl font-bold ${summary.policy_violations > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {summary.policy_violations}
            </div>
            <div className="text-xs text-gray-500 mt-1">enforcement actions</div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-800/30 p-1 rounded-lg w-fit">
        {(['sessions', 'policies'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab === 'sessions' ? 'Active Sessions' : 'Policies'}
          </button>
        ))}
      </div>

      {/* Sessions Tab */}
      {activeTab === 'sessions' && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-left">
                <th className="p-3">User</th>
                <th className="p-3">Provider</th>
                <th className="p-3">Login Time</th>
                <th className="p-3">Last Activity</th>
                <th className="p-3">IP Address</th>
                <th className="p-3">User Agent</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id} className="border-b border-gray-700/50 hover:bg-white/5">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-purple-400" />
                      <span className="text-white font-medium">{s.user}</span>
                    </div>
                  </td>
                  <td className="p-3 text-gray-300">{s.provider}</td>
                  <td className="p-3 text-gray-400 text-xs">{new Date(s.login_time).toLocaleString()}</td>
                  <td className="p-3 text-gray-400 text-xs">{new Date(s.last_activity).toLocaleString()}</td>
                  <td className="p-3 text-gray-300 font-mono text-xs">{s.ip_address}</td>
                  <td className="p-3 text-gray-400 text-xs truncate max-w-[150px]">
                    <div className="flex items-center gap-1">
                      <Monitor className="w-3 h-3 shrink-0" />
                      <span className="truncate">{s.user_agent}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${STATUS_STYLES[s.status] || 'bg-gray-500/20 text-gray-300 border-gray-500/30'}`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Policies Tab */}
      {activeTab === 'policies' && (
        <div className="space-y-3">
          {policies.map(p => (
            <div key={p.id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-blue-400" />
                  <div>
                    <div className="text-white font-medium">{p.name}</div>
                    <div className="text-sm text-gray-400">{p.description}</div>
                  </div>
                </div>
                <span className="px-2 py-1 bg-gray-700/50 rounded text-xs text-gray-300">{p.scope}</span>
              </div>
              <div className="grid grid-cols-4 gap-4 mt-3">
                <div>
                  <p className="text-xs text-gray-400">Idle Timeout</p>
                  <p className="text-sm font-medium text-white">{p.idle_timeout_minutes} min</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Absolute Timeout</p>
                  <p className="text-sm font-medium text-white">{p.absolute_timeout_hours} hrs</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Max Concurrent</p>
                  <p className="text-sm font-medium text-white">{p.max_concurrent}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Enforce MFA</p>
                  <p className="text-sm font-medium">
                    {p.enforce_mfa ? (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" /> Yes
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-400">
                        <AlertTriangle className="w-3 h-3" /> No
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          ))}
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
}

export default function SessionDashboard() {
  return <UnifiedDashboard config={sessionManagementDashboardConfig} />
}
