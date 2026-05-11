import { useState, useEffect, useMemo, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { gxpDashboardConfig } from '../../config/dashboards/gxp'
import {
  CheckCircle2, XCircle, AlertTriangle, Loader2,
  Lock, Link2, PenTool, Clock, Hash,
} from 'lucide-react'
import { authFetch } from '../../lib/api'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'

interface AuditRecord {
  id: string; timestamp: string; user_id: string; action: string
  resource: string; detail: string; previous_hash: string; record_hash: string
}
interface Signature {
  id: string; record_id: string; user_id: string; meaning: string
  auth_method: string; timestamp: string
}
interface ChainStatus {
  valid: boolean; total_records: number; verified_records: number
  broken_at_index: number; verified_at: string; message: string
}
interface GxPConfig {
  enabled: boolean; enabled_at: string; enabled_by: string
  append_only: boolean; require_signature: boolean; hash_algorithm: string
}
interface GxPSummary {
  config: GxPConfig; total_records: number; total_signatures: number
  chain_integrity: boolean; last_verified: string; pending_signatures: number
  evaluated_at: string
}

const MEANING_STYLES: Record<string, string> = {
  approved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  reviewed: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  verified: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  rejected: 'bg-red-500/20 text-red-300 border-red-500/30',
}
const ACTION_STYLES: Record<string, string> = {
  deploy: 'bg-blue-500/20 text-blue-300',
  config_change: 'bg-amber-500/20 text-amber-300',
  review: 'bg-purple-500/20 text-purple-300',
}

export const GxPDashboardContent = memo(function GxPDashboardContent() {
  const { t } = useTranslation()
  const [summary, setSummary] = useState<GxPSummary | null>(null)
  const [records, setRecords] = useState<AuditRecord[]>([])
  const [signatures, setSignatures] = useState<Signature[]>([])
  const [chainStatus, setChainStatus] = useState<ChainStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'audit' | 'signatures'>('overview')
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [smRes, recRes, sigRes, chainRes] = await Promise.all([
        authFetch('/api/compliance/gxp/summary'),
        authFetch('/api/compliance/gxp/records'),
        authFetch('/api/compliance/gxp/signatures'),
        authFetch('/api/compliance/gxp/chain/verify'),
      ])
      if (!smRes.ok || !recRes.ok || !sigRes.ok || !chainRes.ok) throw new Error('Failed to load GxP data')
      const smData = await smRes.json()
      // Guard against non-object responses (e.g. catch-all mock returning [])
      setSummary(smData && typeof smData === 'object' && !Array.isArray(smData) && 'config' in smData ? smData : null)
      const recData = await recRes.json()
      setRecords(Array.isArray(recData) ? recData : [])
      const sigData = await sigRes.json()
      setSignatures(Array.isArray(sigData) ? sigData : [])
      const chainData = await chainRes.json()
      setChainStatus(chainData && typeof chainData === 'object' && !Array.isArray(chainData) ? chainData : null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load GxP data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const sigByRecord = useMemo(() => {
    const map = new Map<string, Signature[]>()
    for (const s of signatures) {
      const list = map.get(s.record_id) || []
      list.push(s)
      map.set(s.record_id, list)
    }
    return map
  }, [signatures])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      <span className="ml-3 text-muted-foreground">Loading GxP validation data…</span>
    </div>
  )

  if (error) return (
    <div className="p-6 text-center">
      <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
      <p className="text-red-300 mb-4">{error}</p>
      <button onClick={fetchData} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm">{t('common.retry', 'Retry')}</button>
    </div>
  )

  return (
    <div className="space-y-6 p-6">
      <DashboardHeader
        title="GxP Validation Mode"
        subtitle="21 CFR Part 11 — Electronic records and signatures"
        isFetching={loading}
        onRefresh={fetchData}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="gxp-auto-refresh"
        rightExtra={<RotatingTip page="compliance" />}
      />

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-card/50 border border-border rounded-xl p-4">
            <div className="text-sm text-muted-foreground mb-1">GxP Mode</div>
            <div className={`text-xl font-bold ${summary.config?.enabled ? 'text-emerald-400' : 'text-muted-foreground'}`}>
              {summary.config?.enabled ? '● ENABLED' : '○ DISABLED'}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {summary.config?.append_only ? 'Append-only' : 'Standard'} mode
            </div>
          </div>
          <div className="bg-card/50 border border-border rounded-xl p-4">
            <div className="text-sm text-muted-foreground mb-1">Chain Integrity</div>
            <div className={`text-xl font-bold flex items-center gap-2 ${summary.chain_integrity ? 'text-emerald-400' : 'text-red-400'}`}>
              {summary.chain_integrity ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
              {summary.chain_integrity ? 'VALID' : 'BROKEN'}
            </div>
          </div>
          <div className="bg-card/50 border border-border rounded-xl p-4">
            <div className="text-sm text-muted-foreground mb-1">Audit Records</div>
            <div className="text-3xl font-bold text-blue-400">{summary.total_records}</div>
          </div>
          <div className="bg-card/50 border border-border rounded-xl p-4">
            <div className="text-sm text-muted-foreground mb-1">Signatures</div>
            <div className="text-3xl font-bold text-purple-400">{summary.total_signatures}</div>
          </div>
          <div className="bg-card/50 border border-border rounded-xl p-4">
            <div className="text-sm text-muted-foreground mb-1">Pending Signatures</div>
            <div className={`text-3xl font-bold ${summary.pending_signatures > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {summary.pending_signatures}
            </div>
          </div>
        </div>
      )}

      {/* Chain Verification Banner */}
      {chainStatus && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 ${
          chainStatus.valid ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
        }`}>
          {chainStatus.valid ? <Link2 className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-red-400" />}
          <div>
            <div className={`font-medium ${chainStatus.valid ? 'text-emerald-300' : 'text-red-300'}`}>
              {chainStatus.message}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {chainStatus.verified_records}/{chainStatus.total_records} records verified
              {' · '}Algorithm: {summary?.config?.hash_algorithm || 'SHA-256'}
              {' · '}Verified: {new Date(chainStatus.verified_at).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/30 p-1 rounded-lg w-fit">
        {(['overview', 'audit', 'signatures'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-blue-600 text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            {tab === 'overview' ? 'Configuration' : tab === 'audit' ? 'Audit Trail' : 'Signatures'}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && summary && (
        <div className="bg-card/50 border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Lock className="w-5 h-5 text-blue-400" />
            GxP Configuration
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: 'Mode', value: summary.config?.enabled ? 'Enabled' : 'Disabled' },
              { label: 'Enabled At', value: summary.config?.enabled_at ? new Date(summary.config.enabled_at).toLocaleString() : '—' },
              { label: 'Enabled By', value: summary.config?.enabled_by ?? '—' },
              { label: 'Append Only', value: summary.config?.append_only ? 'Yes' : 'No' },
              { label: 'Require Signature', value: summary.config?.require_signature ? 'Yes' : 'No' },
              { label: 'Hash Algorithm', value: summary.config?.hash_algorithm ?? '—' },
            ].map(({ label, value }) => (
              <div key={label} className="p-3 bg-muted rounded-lg">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-sm text-foreground font-medium mt-1">{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit Trail Tab */}
      {activeTab === 'audit' && (
        <div className="space-y-2">
          {records.map((r, i) => {
            const sigs = sigByRecord.get(r.id) || []
            return (
              <div key={r.id} className="bg-card/50 border border-border rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground font-mono">
                        {i + 1}
                      </div>
                      {i < records.length - 1 && <div className="w-0.5 h-6 bg-muted mt-1" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTION_STYLES[r.action] || 'bg-gray-500/20 text-muted-foreground'}`}>
                          {r.action}
                        </span>
                        <span className="text-foreground font-medium">{r.resource}</span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">{r.detail}</div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(r.timestamp).toLocaleString()}</span>
                        <span>{r.user_id}</span>
                        <span className="flex items-center gap-1 font-mono"><Hash className="w-3 h-3" />{r.record_hash.slice(0, 12)}…</span>
                      </div>
                      {sigs.length > 0 && (
                        <div className="flex gap-2 mt-2">
                          {sigs.map(s => (
                            <span key={s.id} className={`px-2 py-0.5 rounded text-xs border ${MEANING_STYLES[s.meaning] || ''}`}>
                              <PenTool className="w-3 h-3 inline mr-1" />
                              {s.meaning} by {s.user_id.split('@')[0]} ({s.auth_method})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Signatures Tab */}
      {activeTab === 'signatures' && (
        <div className="bg-card/50 border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-left">
                <th className="p-3">ID</th>
                <th className="p-3">Record</th>
                <th className="p-3">Signer</th>
                <th className="p-3">Meaning</th>
                <th className="p-3">Auth Method</th>
                <th className="p-3">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {signatures.map(s => (
                <tr key={s.id} className="border-b border-border/50 hover:bg-muted/50">
                  <td className="p-3 font-mono text-xs text-muted-foreground">{s.id}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{s.record_id}</td>
                  <td className="p-3 text-foreground">{s.user_id}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs border ${MEANING_STYLES[s.meaning] || ''}`}>
                      {s.meaning}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">{s.auth_method}</td>
                  <td className="p-3 text-muted-foreground text-xs">{new Date(s.timestamp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary && (
        <div className="text-xs text-muted-foreground text-right">
          Last evaluated: {new Date(summary.evaluated_at).toLocaleString()}
        </div>
      )}
    </div>
  )
})

export default function GxPDashboard() {
  return (<>
    <GxPDashboardContent />
    <UnifiedDashboard config={gxpDashboardConfig} />
  </>)
}
