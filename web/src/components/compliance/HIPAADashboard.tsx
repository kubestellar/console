import { useState, useEffect, useMemo } from 'react'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { hipaaDashboardConfig } from '../../config/dashboards/hipaa'
import {
  Shield, CheckCircle2, XCircle, AlertTriangle, Loader2,
  RefreshCw, Activity, Lock, Eye, UserCheck, Network,
  ArrowRight, Server,
} from 'lucide-react'
import { authFetch } from '../../lib/api'

interface HIPAACheck {
  id: string; name: string; description: string; status: string
  evidence: string; remediation: string
}
interface HIPAASafeguard {
  id: string; section: string; name: string; description: string
  status: string; checks: HIPAACheck[]
}
interface PHINamespace {
  name: string; cluster: string; labels: string[]; encrypted: boolean
  audit_enabled: boolean; rbac_restricted: boolean; compliant: boolean
}
interface DataFlow {
  source: string; destination: string; protocol: string
  encrypted: boolean; mutual_tls: boolean
}
interface HIPAASummary {
  overall_score: number; safeguards_passed: number; safeguards_failed: number
  safeguards_partial: number; total_safeguards: number; phi_namespaces: number
  compliant_namespaces: number; data_flows: number; encrypted_flows: number
  evaluated_at: string
}

const STATUS_STYLES: Record<string, string> = {
  pass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  fail: 'bg-red-500/20 text-red-300 border-red-500/30',
  partial: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
}
const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  pass: CheckCircle2, fail: XCircle, partial: AlertTriangle,
}
const SAFEGUARD_ICONS: Record<string, typeof Shield> = {
  '164.312(a)': Lock, '164.312(b)': Eye, '164.312(c)': Shield,
  '164.312(d)': UserCheck, '164.312(e)': Network,
}

export function HIPAADashboardContent() {
  const [safeguards, setSafeguards] = useState<HIPAASafeguard[]>([])
  const [phiNamespaces, setPHINamespaces] = useState<PHINamespace[]>([])
  const [dataFlows, setDataFlows] = useState<DataFlow[]>([])
  const [summary, setSummary] = useState<HIPAASummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSafeguard, setExpandedSafeguard] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'safeguards' | 'phi' | 'flows'>('safeguards')

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [sgRes, nsRes, flRes, smRes] = await Promise.all([
        authFetch('/api/compliance/hipaa/safeguards'),
        authFetch('/api/compliance/hipaa/phi-namespaces'),
        authFetch('/api/compliance/hipaa/data-flows'),
        authFetch('/api/compliance/hipaa/summary'),
      ])
      if (!sgRes.ok || !nsRes.ok || !flRes.ok || !smRes.ok) throw new Error('Failed to load HIPAA data')
      setSafeguards(await sgRes.json())
      setPHINamespaces(await nsRes.json())
      setDataFlows(await flRes.json())
      setSummary(await smRes.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load HIPAA data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const scoreColor = useMemo(() => {
    if (!summary) return 'text-gray-400'
    if (summary.overall_score >= 80) return 'text-emerald-400'
    if (summary.overall_score >= 60) return 'text-amber-400'
    return 'text-red-400'
  }, [summary])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      <span className="ml-3 text-gray-400">Loading HIPAA compliance data…</span>
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
            <Shield className="w-7 h-7 text-blue-400" />
            HIPAA Security Rule Compliance
          </h1>
          <p className="text-gray-400 mt-1">
            Technical safeguards assessment per 45 CFR §164.312
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
            <div className="text-sm text-gray-400 mb-1">Overall Score</div>
            <div className={`text-3xl font-bold ${scoreColor}`}>{summary.overall_score}%</div>
            <div className="text-xs text-gray-500 mt-1">
              {summary.safeguards_passed}/{summary.total_safeguards} safeguards passing
            </div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">PHI Namespaces</div>
            <div className="text-3xl font-bold text-blue-400">{summary.phi_namespaces}</div>
            <div className="text-xs text-gray-500 mt-1">
              {summary.compliant_namespaces} compliant
            </div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Data Flows</div>
            <div className="text-3xl font-bold text-purple-400">{summary.data_flows}</div>
            <div className="text-xs text-gray-500 mt-1">
              {summary.encrypted_flows} encrypted
            </div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Safeguards</div>
            <div className="flex gap-3 mt-1">
              <span className="text-emerald-400 font-bold">{summary.safeguards_passed} ✓</span>
              <span className="text-amber-400 font-bold">{summary.safeguards_partial} ◐</span>
              <span className="text-red-400 font-bold">{summary.safeguards_failed} ✗</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-800/30 p-1 rounded-lg w-fit">
        {(['safeguards', 'phi', 'flows'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab === 'safeguards' ? 'Technical Safeguards' : tab === 'phi' ? 'PHI Namespaces' : 'Data Flows'}
          </button>
        ))}
      </div>

      {/* Safeguards Tab */}
      {activeTab === 'safeguards' && (
        <div className="space-y-3">
          {safeguards.map(sg => {
            const Icon = SAFEGUARD_ICONS[sg.id] || Shield
            const StatusIcon = STATUS_ICONS[sg.status] || AlertTriangle
            const isExpanded = expandedSafeguard === sg.id
            return (
              <div key={sg.id} className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedSafeguard(isExpanded ? null : sg.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-blue-400" />
                    <div className="text-left">
                      <div className="text-white font-medium">{sg.section} — {sg.name}</div>
                      <div className="text-sm text-gray-400">{sg.description}</div>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${STATUS_STYLES[sg.status] || ''}`}>
                    <StatusIcon className="w-3 h-3 inline mr-1" />
                    {sg.status.toUpperCase()}
                  </span>
                </button>
                {isExpanded && (
                  <div className="border-t border-gray-700 p-4 space-y-2">
                    {sg.checks.map(check => {
                      const ChkIcon = STATUS_ICONS[check.status] || AlertTriangle
                      return (
                        <div key={check.id} className="flex items-start gap-3 p-3 bg-gray-900/50 rounded-lg">
                          <ChkIcon className={`w-4 h-4 mt-0.5 ${
                            check.status === 'pass' ? 'text-emerald-400' :
                            check.status === 'fail' ? 'text-red-400' : 'text-amber-400'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white font-medium">{check.name}</div>
                            <div className="text-xs text-gray-400 mt-0.5">{check.description}</div>
                            {check.evidence && (
                              <div className="text-xs text-gray-500 mt-1">
                                <span className="text-gray-400">Evidence:</span> {check.evidence}
                              </div>
                            )}
                            {check.remediation && (
                              <div className="text-xs text-amber-400/80 mt-1">
                                <span className="font-medium">Remediation:</span> {check.remediation}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* PHI Namespaces Tab */}
      {activeTab === 'phi' && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-left">
                <th className="p-3">Namespace</th>
                <th className="p-3">Cluster</th>
                <th className="p-3">Encrypted</th>
                <th className="p-3">Audit</th>
                <th className="p-3">RBAC</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {phiNamespaces.map(ns => (
                <tr key={`${ns.cluster}-${ns.name}`} className="border-b border-gray-700/50 hover:bg-white/5">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-gray-500" />
                      <span className="text-white font-medium">{ns.name}</span>
                    </div>
                    <div className="flex gap-1 mt-1">
                      {ns.labels.map(l => (
                        <span key={l} className="px-1.5 py-0.5 bg-blue-500/10 text-blue-300 text-[10px] rounded">
                          {l}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-gray-300">{ns.cluster}</td>
                  <td className="p-3">{ns.encrypted ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}</td>
                  <td className="p-3">{ns.audit_enabled ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}</td>
                  <td className="p-3">{ns.rbac_restricted ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${ns.compliant ? STATUS_STYLES.pass : STATUS_STYLES.fail}`}>
                      {ns.compliant ? 'Compliant' : 'Non-Compliant'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Data Flows Tab */}
      {activeTab === 'flows' && (
        <div className="space-y-3">
          {dataFlows.map((flow, i) => (
            <div key={i} className={`flex items-center gap-4 p-4 rounded-xl border ${
              flow.encrypted && flow.mutual_tls ? 'bg-emerald-500/5 border-emerald-500/20' :
              flow.encrypted ? 'bg-amber-500/5 border-amber-500/20' :
              'bg-red-500/5 border-red-500/20'
            }`}>
              <div className="flex items-center gap-2 min-w-[140px]">
                <Activity className="w-4 h-4 text-blue-400" />
                <span className="text-white font-medium">{flow.source}</span>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-500" />
              <div className="flex items-center gap-2 min-w-[140px]">
                <Activity className="w-4 h-4 text-purple-400" />
                <span className="text-white font-medium">{flow.destination}</span>
              </div>
              <span className="px-2 py-1 bg-gray-700/50 rounded text-xs text-gray-300">{flow.protocol}</span>
              <div className="flex gap-2 ml-auto">
                {flow.encrypted ? (
                  <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded text-xs">Encrypted</span>
                ) : (
                  <span className="px-2 py-1 bg-red-500/20 text-red-300 rounded text-xs">Unencrypted</span>
                )}
                {flow.mutual_tls ? (
                  <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded text-xs">mTLS</span>
                ) : (
                  <span className="px-2 py-1 bg-amber-500/20 text-amber-300 rounded text-xs">No mTLS</span>
                )}
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

export default function HIPAADashboard() {
  return <UnifiedDashboard config={hipaaDashboardConfig} />
}
