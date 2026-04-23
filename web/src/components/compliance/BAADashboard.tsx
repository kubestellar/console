import { useState, useEffect, useMemo } from 'react'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { baaDashboardConfig } from '../../config/dashboards/baa'
import {
  FileText, CheckCircle2, XCircle, AlertTriangle, Loader2,
  RefreshCw, Clock, Building2, Cloud, Server, Mail,
} from 'lucide-react'
import { authFetch } from '../../lib/api'

interface BAAgreement {
  id: string; provider: string; provider_type: string
  baa_signed_date: string; baa_expiry_date: string
  covered_clusters: string[]; contact_name: string; contact_email: string
  status: string; notes: string
}
interface BAAAlert {
  agreement_id: string; provider: string; expiry_date: string
  days_left: number; severity: string
}
interface BAASummary {
  total_agreements: number; active_agreements: number; expiring_soon: number
  expired: number; pending: number; covered_clusters: number
  uncovered_clusters: number; active_alerts: number; evaluated_at: string
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  expiring_soon: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  expired: 'bg-red-500/20 text-red-300 border-red-500/30',
  pending: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
}
const PROVIDER_ICONS: Record<string, typeof Cloud> = {
  cloud: Cloud, saas: Server, managed_service: Building2, consulting: FileText,
}

export function BAADashboardContent() {
  const [agreements, setAgreements] = useState<BAAgreement[]>([])
  const [alerts, setAlerts] = useState<BAAAlert[]>([])
  const [summary, setSummary] = useState<BAASummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'agreements' | 'alerts'>('agreements')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [agRes, alRes, smRes] = await Promise.all([
        authFetch('/api/compliance/baa/agreements'),
        authFetch('/api/compliance/baa/alerts'),
        authFetch('/api/compliance/baa/summary'),
      ])
      if (!agRes.ok || !alRes.ok || !smRes.ok) throw new Error('Failed to load BAA data')
      setAgreements(await agRes.json())
      setAlerts(await alRes.json())
      setSummary(await smRes.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load BAA data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const filtered = useMemo(() =>
    statusFilter === 'all' ? agreements : agreements.filter(a => a.status === statusFilter),
    [agreements, statusFilter]
  )

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      <span className="ml-3 text-gray-400">Loading BAA data…</span>
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
            <FileText className="w-7 h-7 text-blue-400" />
            Business Associate Agreements
          </h1>
          <p className="text-gray-400 mt-1">
            HIPAA BAA tracking across cloud providers and vendors
          </p>
        </div>
        <button onClick={fetchData} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Refresh">
          <RefreshCw className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Total BAAs</div>
            <div className="text-3xl font-bold text-white">{summary.total_agreements}</div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Active</div>
            <div className="text-3xl font-bold text-emerald-400">{summary.active_agreements}</div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Expiring Soon</div>
            <div className={`text-3xl font-bold ${summary.expiring_soon > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
              {summary.expiring_soon}
            </div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Expired</div>
            <div className={`text-3xl font-bold ${summary.expired > 0 ? 'text-red-400' : 'text-gray-500'}`}>
              {summary.expired}
            </div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Cluster Coverage</div>
            <div className="text-xl font-bold text-blue-400">
              {summary.covered_clusters}/{summary.covered_clusters + summary.uncovered_clusters}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {summary.uncovered_clusters > 0 ? `${summary.uncovered_clusters} uncovered` : 'All covered'}
            </div>
          </div>
        </div>
      )}

      {/* Alert Banner */}
      {alerts.length > 0 && (
        <div className="p-4 rounded-xl border bg-red-500/5 border-red-500/20">
          <div className="flex items-center gap-2 text-red-300 font-medium mb-2">
            <AlertTriangle className="w-5 h-5" />
            {alerts.length} BAA Alert{alerts.length > 1 ? 's' : ''} Requiring Attention
          </div>
          <div className="space-y-2">
            {alerts.map(a => (
              <div key={a.agreement_id} className="flex items-center gap-3 text-sm">
                <span className="text-white font-medium">{a.provider}</span>
                <span className="text-gray-400">expires {a.expiry_date}</span>
                <span className={`px-2 py-0.5 rounded text-xs ${
                  a.days_left <= 0 ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'
                }`}>
                  {a.days_left <= 0 ? 'EXPIRED' : `${a.days_left} days left`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs + Filter */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-800/30 p-1 rounded-lg">
          {(['agreements', 'alerts'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab === 'agreements' ? 'Agreements' : `Alerts (${alerts.length})`}
            </button>
          ))}
        </div>
        {activeTab === 'agreements' && (
          <div className="flex gap-2">
            {['all', 'active', 'expiring_soon', 'expired', 'pending'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs transition-colors ${
                  statusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-700/50 text-gray-400 hover:text-white'
                }`}
              >
                {s === 'all' ? 'All' : s.replace('_', ' ')}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Agreements Tab */}
      {activeTab === 'agreements' && (
        <div className="space-y-3">
          {filtered.map(a => {
            const Icon = PROVIDER_ICONS[a.provider_type] || Building2
            return (
              <div key={a.id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-700/50 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-semibold text-lg">{a.provider}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_STYLES[a.status] || ''}`}>
                          {a.status.replace('_', ' ')}
                        </span>
                        <span className="px-2 py-0.5 bg-gray-700/50 rounded text-xs text-gray-400">{a.provider_type.replace('_', ' ')}</span>
                      </div>
                      <div className="text-sm text-gray-400 mt-1">{a.notes}</div>
                      <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-gray-500">
                        {a.baa_signed_date && (
                          <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" />Signed: {a.baa_signed_date}</span>
                        )}
                        {a.baa_expiry_date && (
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Expires: {a.baa_expiry_date}</span>
                        )}
                        <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{a.contact_name} ({a.contact_email})</span>
                      </div>
                      {a.covered_clusters.length > 0 && (
                        <div className="flex gap-1 mt-2">
                          {a.covered_clusters.map(c => (
                            <span key={c} className="px-2 py-0.5 bg-blue-500/10 text-blue-300 text-xs rounded">{c}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="text-center text-gray-500 py-8">No agreements match the selected filter.</div>
          )}
        </div>
      )}

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              No BAA expiry alerts
            </div>
          ) : (
            alerts.map(a => (
              <div key={a.agreement_id} className={`p-4 rounded-xl border ${
                a.days_left <= 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-amber-500/5 border-amber-500/20'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-semibold">{a.provider}</div>
                    <div className="text-sm text-gray-400 mt-1">
                      Expiry: {a.expiry_date} · Agreement: {a.agreement_id}
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                    a.days_left <= 0 ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'
                  }`}>
                    {a.days_left <= 0 ? 'EXPIRED' : `${a.days_left}d remaining`}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {summary && (
        <div className="text-xs text-gray-500 text-right">
          Last evaluated: {new Date(summary.evaluated_at).toLocaleString()}
        </div>
      )}
    </div>
  )
}

export default function BAADashboard() {
  return <UnifiedDashboard config={baaDashboardConfig} />
}
