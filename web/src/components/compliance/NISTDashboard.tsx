import { useState, useEffect, useMemo } from 'react'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { nistDashboardConfig } from '../../config/dashboards/nist'
import {
  CheckCircle2, XCircle, AlertTriangle, Loader2,
  Shield, ArrowRight, Clock
} from 'lucide-react'
import { authFetch } from '../../lib/api'

interface Control {
  id: string
  name: string
  description: string
  priority: string
  baseline: string
  status: string
  evidence: string
  remediation: string
}

interface ControlFamily {
  id: string
  name: string
  description: string
  controls: Control[]
  pass_rate: number
}

interface ControlMapping {
  control_id: string
  resources: string[]
  namespaces: string[]
  clusters: string[]
  automated: boolean
  last_assessed: string
}

interface NISTSummary {
  total_controls: number
  implemented_controls: number
  partial_controls: number
  planned_controls: number
  not_applicable: number
  overall_score: number
  baseline: string
  evaluated_at: string
}

const statusIcon = (status: string) => {
  switch (status) {
    case 'implemented': return <CheckCircle2 className="w-4 h-4 text-green-400" />
    case 'partial': return <AlertTriangle className="w-4 h-4 text-yellow-400" />
    case 'planned': return <Clock className="w-4 h-4 text-blue-400" />
    default: return <XCircle className="w-4 h-4 text-gray-400" />
  }
}

const statusLabel = (status: string) => {
  switch (status) {
    case 'implemented': return 'Implemented'
    case 'partial': return 'Partially Implemented'
    case 'planned': return 'Planned'
    case 'not_applicable': return 'N/A'
    default: return status
  }
}

export function NISTDashboardContent() {
  const [families, setFamilies] = useState<ControlFamily[]>([])
  const [mappings, setMappings] = useState<ControlMapping[]>([])
  const [summary, setSummary] = useState<NISTSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'families' | 'mappings' | 'summary'>('families')
  const [familyFilter, setFamilyFilter] = useState<string>('all')

  useEffect(() => {
    const load = async () => {
      try {
        const [fRes, mRes, sRes] = await Promise.all([
          authFetch('/api/compliance/nist/families'),
          authFetch('/api/compliance/nist/mappings'),
          authFetch('/api/compliance/nist/summary'),
        ])
        if (!fRes.ok || !mRes.ok || !sRes.ok) throw new Error('Failed to fetch NIST data')
        setFamilies(await fRes.json())
        setMappings(await mRes.json())
        setSummary(await sRes.json())
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filteredFamilies = useMemo(() => {
    if (familyFilter === 'all') return families
    return families.filter(f => f.id === familyFilter)
  }, [families, familyFilter])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      <span className="ml-3 text-gray-300">Loading NIST 800-53 controls…</span>
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
          <h1 className="text-2xl font-bold text-white">NIST 800-53 Control Mapping</h1>
          <p className="text-gray-400">Federal information security controls mapped to Kubernetes infrastructure</p>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-gray-400">Overall Score</p>
            <p className="text-2xl font-bold text-white">{summary.overall_score}%</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-green-500/30">
            <p className="text-sm text-gray-400">Implemented</p>
            <p className="text-2xl font-bold text-green-400">{summary.implemented_controls}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-yellow-500/30">
            <p className="text-sm text-gray-400">Partial</p>
            <p className="text-2xl font-bold text-yellow-400">{summary.partial_controls}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-blue-500/30">
            <p className="text-sm text-gray-400">Planned</p>
            <p className="text-2xl font-bold text-blue-400">{summary.planned_controls}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-gray-400">Baseline</p>
            <p className="text-2xl font-bold text-white capitalize">{summary.baseline}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700 pb-2">
        {(['families', 'mappings', 'summary'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab === 'families' ? 'Control Families' : tab === 'mappings' ? 'Resource Mappings' : 'Assessment Summary'}
          </button>
        ))}
      </div>

      {/* Families tab */}
      {activeTab === 'families' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFamilyFilter('all')}
              className={`px-3 py-1 rounded text-xs ${familyFilter === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300'}`}
            >All</button>
            {families.map(f => (
              <button
                key={f.id}
                onClick={() => setFamilyFilter(f.id)}
                className={`px-3 py-1 rounded text-xs ${familyFilter === f.id ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300'}`}
              >{f.id} — {f.name}</button>
            ))}
          </div>

          {filteredFamilies.map(family => (
            <div key={family.id} className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">{family.id} — {family.name}</h3>
                  <p className="text-sm text-gray-400">{family.description}</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-white">{family.pass_rate}%</span>
                  <p className="text-xs text-gray-400">pass rate</p>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-700">
                    <th className="text-left p-3">Control</th>
                    <th className="text-left p-3">Name</th>
                    <th className="text-left p-3">Priority</th>
                    <th className="text-left p-3">Baseline</th>
                    <th className="text-left p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {family.controls.map(ctrl => (
                    <tr key={ctrl.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="p-3 font-mono text-blue-300">{ctrl.id}</td>
                      <td className="p-3 text-white">{ctrl.name}</td>
                      <td className="p-3"><span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300">{ctrl.priority}</span></td>
                      <td className="p-3 capitalize text-gray-300">{ctrl.baseline}</td>
                      <td className="p-3">
                        <span className="flex items-center gap-1.5">
                          {statusIcon(ctrl.status)}
                          <span className="text-gray-300">{statusLabel(ctrl.status)}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Mappings tab */}
      {activeTab === 'mappings' && (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left p-3">Control</th>
                <th className="text-left p-3">Resources</th>
                <th className="text-left p-3">Namespaces</th>
                <th className="text-left p-3">Clusters</th>
                <th className="text-left p-3">Automated</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map(m => (
                <tr key={m.control_id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="p-3 font-mono text-blue-300">{m.control_id}</td>
                  <td className="p-3">
                    <div className="flex gap-1 flex-wrap">
                      {m.resources.map(r => (
                        <span key={r} className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 text-xs">{r}</span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-gray-300">{m.namespaces.join(', ')}</td>
                  <td className="p-3 text-gray-300">{m.clusters.join(', ')}</td>
                  <td className="p-3">
                    {m.automated
                      ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                      : <span className="text-yellow-400 text-xs">Manual</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary tab */}
      {activeTab === 'summary' && summary && (
        <div className="space-y-4">
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Assessment Overview</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-400">Total Controls Assessed</p>
                <p className="text-xl font-bold text-white">{summary.total_controls}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Assessment Baseline</p>
                <p className="text-xl font-bold text-white capitalize">{summary.baseline}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Compliance Score</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full"
                      style={{ width: `${summary.overall_score}%` }}
                    />
                  </div>
                  <span className="text-white font-bold">{summary.overall_score}%</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-400">Last Evaluated</p>
                <p className="text-sm text-gray-300">{new Date(summary.evaluated_at).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Breakdown by family */}
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Family Breakdown</h3>
            <div className="space-y-3">
              {families.map(f => (
                <div key={f.id} className="flex items-center gap-3">
                  <span className="w-8 text-sm font-mono text-blue-300">{f.id}</span>
                  <span className="w-48 text-sm text-gray-300 truncate">{f.name}</span>
                  <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${f.pass_rate}%` }}
                    />
                  </div>
                  <span className="text-sm text-white w-12 text-right">{f.pass_rate}%</span>
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

export default function NISTDashboard() {
  return <UnifiedDashboard config={nistDashboardConfig} />
}
