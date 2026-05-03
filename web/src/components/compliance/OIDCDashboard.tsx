import { useState, useEffect, useCallback, memo } from 'react'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { oidcDashboardConfig } from '../../config/dashboards/oidc'
import {
  CheckCircle2, XCircle, AlertTriangle, Loader2,
  Users, ShieldCheck, Fingerprint, Clock,
} from 'lucide-react'
import { authFetch } from '../../lib/api'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'

interface OIDCProvider {
  id: string; name: string; issuer_url: string; status: string
  protocol: string; client_id: string; users_synced: number
  last_sync: string; groups_mapped: number
}

interface OIDCSession {
  id: string; user: string; provider_id: string; provider_name: string
  login_time: string; expires_at: string; ip_address: string; active: boolean
}

interface OIDCSummary {
  total_providers: number; active_providers: number; total_users: number
  active_sessions: number; failed_logins_24h: number; mfa_adoption: number
  evaluated_at: string
}

const STATUS_STYLES: Record<string, string> = {
  connected: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  degraded: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  disconnected: 'bg-red-500/20 text-red-300 border-red-500/30',
  error: 'bg-red-500/20 text-red-300 border-red-500/30',
}

export const OIDCDashboardContent = memo(function OIDCDashboardContent() {
  const [providers, setProviders] = useState<OIDCProvider[]>([])
  const [sessions, setSessions] = useState<OIDCSession[]>([])
  const [summary, setSummary] = useState<OIDCSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'providers' | 'sessions'>('providers')
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [smRes, pRes, sRes] = await Promise.all([
        authFetch('/api/identity/oidc/summary'),
        authFetch('/api/identity/oidc/providers'),
        authFetch('/api/identity/oidc/sessions'),
      ])
      if (!smRes.ok || !pRes.ok || !sRes.ok) throw new Error('Failed to load OIDC data')
      setSummary(await smRes.json())
      setProviders(await pRes.json())
      setSessions(await sRes.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load OIDC data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      <span className="ml-3 text-gray-400">Loading OIDC federation data…</span>
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
      <DashboardHeader
        title="OIDC Federation"
        subtitle="Identity provider federation and session management"
        isFetching={loading}
        onRefresh={fetchData}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="oidc-auto-refresh"
        rightExtra={<RotatingTip page="compliance" />}
      />

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Providers</div>
            <div className="text-3xl font-bold text-blue-400">{summary.active_providers}/{summary.total_providers}</div>
            <div className="text-xs text-gray-500 mt-1">active / total</div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Users Synced</div>
            <div className="text-3xl font-bold text-purple-400">{summary.total_users}</div>
            <div className="text-xs text-gray-500 mt-1">across all providers</div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Active Sessions</div>
            <div className="text-3xl font-bold text-emerald-400">{summary.active_sessions}</div>
            <div className="text-xs text-gray-500 mt-1">currently active</div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">MFA Adoption</div>
            <div className="text-3xl font-bold text-cyan-400">{summary.mfa_adoption}%</div>
            <div className="text-xs text-gray-500 mt-1">of all users</div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Failed Logins (24h)</div>
            <div className={`text-3xl font-bold ${summary.failed_logins_24h > 10 ? 'text-red-400' : 'text-amber-400'}`}>
              {summary.failed_logins_24h}
            </div>
            <div className="text-xs text-gray-500 mt-1">last 24 hours</div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-800/30 p-1 rounded-lg w-fit">
        {(['providers', 'sessions'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab === 'providers' ? 'Providers' : 'Active Sessions'}
          </button>
        ))}
      </div>

      {/* Providers Tab */}
      {activeTab === 'providers' && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-left">
                <th className="p-3">Provider</th>
                <th className="p-3">Issuer URL</th>
                <th className="p-3">Protocol</th>
                <th className="p-3">Users Synced</th>
                <th className="p-3">Groups</th>
                <th className="p-3">Last Sync</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {providers.map(p => (
                <tr key={p.id} className="border-b border-gray-700/50 hover:bg-white/5">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Fingerprint className="w-4 h-4 text-blue-400" />
                      <span className="text-white font-medium">{p.name}</span>
                    </div>
                  </td>
                  <td className="p-3 text-gray-300 font-mono text-xs truncate max-w-[200px]">{p.issuer_url}</td>
                  <td className="p-3">
                    <span className="px-2 py-1 bg-gray-700/50 rounded text-xs text-gray-300">{p.protocol}</span>
                  </td>
                  <td className="p-3 text-gray-300">{p.users_synced}</td>
                  <td className="p-3 text-gray-300">{p.groups_mapped}</td>
                  <td className="p-3 text-gray-400 text-xs">{new Date(p.last_sync).toLocaleString()}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${STATUS_STYLES[p.status] || 'bg-gray-500/20 text-gray-300 border-gray-500/30'}`}>
                      {p.status === 'connected' ? <CheckCircle2 className="w-3 h-3 inline mr-1" /> :
                       p.status === 'degraded' ? <AlertTriangle className="w-3 h-3 inline mr-1" /> :
                       <XCircle className="w-3 h-3 inline mr-1" />}
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sessions Tab */}
      {activeTab === 'sessions' && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-left">
                <th className="p-3">User</th>
                <th className="p-3">Provider</th>
                <th className="p-3">Login Time</th>
                <th className="p-3">Expires</th>
                <th className="p-3">IP Address</th>
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
                  <td className="p-3 text-gray-300">{s.provider_name}</td>
                  <td className="p-3 text-gray-400 text-xs">{new Date(s.login_time).toLocaleString()}</td>
                  <td className="p-3 text-gray-400 text-xs">{new Date(s.expires_at).toLocaleString()}</td>
                  <td className="p-3 text-gray-300 font-mono text-xs">{s.ip_address}</td>
                  <td className="p-3">
                    {s.active ? (
                      <span className="px-2 py-1 rounded-full text-xs font-medium border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                        <ShieldCheck className="w-3 h-3 inline mr-1" />active
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs font-medium border bg-gray-500/20 text-gray-300 border-gray-500/30">
                        <Clock className="w-3 h-3 inline mr-1" />expired
                      </span>
                    )}
                  </td>
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

export default function OIDCDashboard() {
  return (<>
    <OIDCDashboardContent />
    <UnifiedDashboard config={oidcDashboardConfig} />
  </>)
}
