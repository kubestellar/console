/**
 * License Compliance Dashboard — Issue #9648
 *
 * Scans container images and source dependencies for open-source licenses,
 * flags deny-listed licenses (GPL, AGPL, SSPL, etc.) and warn-listed ones
 * (LGPL, MPL), and provides a fleet-wide license inventory.
 */
import { useState, useEffect } from 'react'
import {
  Scale, CheckCircle2, XCircle, AlertTriangle, Loader2,
  RefreshCw, BookOpen,
} from 'lucide-react'
import { authFetch } from '../../lib/api'

/** How often to re-scan license data (ms) */
const LICENSE_REFRESH_MS = 300_000

type LicenseRisk = 'allowed' | 'warn' | 'denied'

interface LicensePackage {
  name: string
  version: string
  license: string
  risk: LicenseRisk
  workload: string
  namespace: string
  cluster: string
  spdx_id: string
}

interface LicenseCategory {
  name: string
  count: number
  risk: LicenseRisk
  examples: string[]
}

interface LicenseSummary {
  total_packages: number
  allowed_packages: number
  warned_packages: number
  denied_packages: number
  unique_licenses: number
  workloads_scanned: number
  evaluated_at: string
}

const RISK_STYLES: Record<LicenseRisk, string> = {
  allowed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  warn: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  denied: 'bg-red-500/20 text-red-300 border-red-500/30',
}

const RISK_ICONS: Record<LicenseRisk, typeof CheckCircle2> = {
  allowed: CheckCircle2,
  warn: AlertTriangle,
  denied: XCircle,
}

export default function LicenseComplianceDashboard() {
  const [packages, setPackages] = useState<LicensePackage[]>([])
  const [categories, setCategories] = useState<LicenseCategory[]>([])
  const [summary, setSummary] = useState<LicenseSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'violations' | 'inventory' | 'categories'>('violations')
  const [filterRisk, setFilterRisk] = useState<LicenseRisk | null>('denied')

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [pkgRes, catRes, sumRes] = await Promise.all([
        authFetch('/api/supply-chain/licenses/packages'),
        authFetch('/api/supply-chain/licenses/categories'),
        authFetch('/api/supply-chain/licenses/summary'),
      ])
      if (!pkgRes.ok || !catRes.ok || !sumRes.ok) throw new Error('Failed to load license data')
      setPackages(await pkgRes.json())
      setCategories(await catRes.json())
      setSummary(await sumRes.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load license data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, LICENSE_REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
      <span className="ml-3 text-gray-400">Scanning license inventory…</span>
    </div>
  )

  if (error) return (
    <div className="p-6 text-center">
      <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
      <p className="text-red-300 mb-4">{error}</p>
      <button onClick={fetchData} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm">Retry</button>
    </div>
  )

  const violations = packages.filter((p) => p.risk === 'denied')
  const warnings = packages.filter((p) => p.risk === 'warn')

  const displayPackages = activeTab === 'violations'
    ? (filterRisk ? packages.filter((p) => p.risk === filterRisk) : violations)
    : packages

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Scale className="w-7 h-7 text-indigo-400" />
            License Compliance Scanner
          </h1>
          <p className="text-gray-400 mt-1">
            Open-source license inventory with deny/warn-list violation detection
          </p>
        </div>
        <button onClick={fetchData} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Refresh">
          <RefreshCw className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Denied Licenses</div>
            <div className={`text-3xl font-bold ${summary.denied_packages > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {summary.denied_packages}
            </div>
            <div className="text-xs text-gray-500 mt-1">must be remediated</div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Warnings</div>
            <div className={`text-3xl font-bold ${summary.warned_packages > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {summary.warned_packages}
            </div>
            <div className="text-xs text-gray-500 mt-1">require legal review</div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Allowed</div>
            <div className="text-3xl font-bold text-emerald-400">{summary.allowed_packages}</div>
            <div className="text-xs text-gray-500 mt-1">of {summary.total_packages} total</div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Unique Licenses</div>
            <div className="text-3xl font-bold text-indigo-400">{summary.unique_licenses}</div>
            <div className="text-xs text-gray-500 mt-1">{summary.workloads_scanned} workloads scanned</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800/30 p-1 rounded-lg w-fit">
        {(['violations', 'inventory', 'categories'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab)
              if (tab === 'violations') setFilterRisk('denied')
            }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab === 'violations'
              ? `Violations (${violations.length + warnings.length})`
              : tab === 'inventory'
              ? 'Full Inventory'
              : 'License Categories'}
          </button>
        ))}
      </div>

      {/* Violations / Inventory Tab */}
      {(activeTab === 'violations' || activeTab === 'inventory') && (
        <>
          {activeTab === 'violations' && (
            <div className="flex gap-2">
              {(['denied', 'warn', 'allowed'] as const).map((risk) => {
                const RiskIcon = RISK_ICONS[risk]
                return (
                  <button
                    key={risk}
                    onClick={() => setFilterRisk(filterRisk === risk ? null : risk)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                      filterRisk === risk
                        ? RISK_STYLES[risk]
                        : 'border-gray-700 bg-gray-900/50 text-gray-400 hover:bg-gray-700/50'
                    }`}
                  >
                    <RiskIcon className="w-3.5 h-3.5" />
                    {risk.charAt(0).toUpperCase() + risk.slice(1)}
                    {' '}({packages.filter((p) => p.risk === risk).length})
                  </button>
                )
              })}
            </div>
          )}

          <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
            {displayPackages.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                <p className="text-gray-300">No license violations detected.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-left">
                    <th className="p-3">Package</th>
                    <th className="p-3">License</th>
                    <th className="p-3">Workload</th>
                    <th className="p-3">Cluster</th>
                    <th className="p-3">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {displayPackages.map((pkg, i) => {
                    const RiskIcon = RISK_ICONS[pkg.risk]
                    return (
                      <tr key={i} className="border-b border-gray-700/50 hover:bg-white/5">
                        <td className="p-3">
                          <div className="text-white font-mono text-xs">{pkg.name}</div>
                          <div className="text-gray-500 text-[10px]">v{pkg.version}</div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-gray-300 text-xs">{pkg.license}</span>
                          </div>
                          <div className="text-[10px] text-gray-500">{pkg.spdx_id}</div>
                        </td>
                        <td className="p-3">
                          <div className="text-gray-300">{pkg.workload}</div>
                          <div className="text-xs text-gray-500">{pkg.namespace}</div>
                        </td>
                        <td className="p-3 text-gray-400">{pkg.cluster}</td>
                        <td className="p-3">
                          <span className={`flex items-center gap-1 w-fit px-2 py-0.5 rounded-full text-xs border ${RISK_STYLES[pkg.risk]}`}>
                            <RiskIcon className="w-3 h-3" />
                            {pkg.risk}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categories.map((cat, i) => {
            const CatIcon = RISK_ICONS[cat.risk]
            return (
              <div key={i} className={`rounded-xl border p-4 ${RISK_STYLES[cat.risk]}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CatIcon className="w-5 h-5" />
                    <div>
                      <div className="font-medium text-white">{cat.name}</div>
                      <div className="text-xs opacity-70">{cat.count} package{cat.count !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs border ${RISK_STYLES[cat.risk]}`}>
                    {cat.risk}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {cat.examples.map((ex, j) => (
                    <span key={j} className="px-1.5 py-0.5 bg-black/20 rounded text-[10px] font-mono">
                      {ex}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {summary && (
        <div className="text-xs text-gray-500 text-right">
          Last scanned: {new Date(summary.evaluated_at).toLocaleString()}
        </div>
      )}
    </div>
  )
}
