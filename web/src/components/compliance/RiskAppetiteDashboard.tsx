import { useState, useEffect, memo, useCallback } from 'react'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { riskAppetiteDashboardConfig } from '../../config/dashboards/risk-appetite'
import {
  Loader2, AlertTriangle, CheckCircle2, XCircle,
  TrendingUp, ArrowRight,
} from 'lucide-react'
import { authFetch } from '../../lib/api'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'

// ── Types ─────────────────────────────────────────────────────────────

interface AppetiteThreshold {
  category: string
  appetite_level: number
  actual_exposure: number
  tolerance_max: number
  status: 'green' | 'amber' | 'red'
  statement: string
  trend_quarters: number[]
}

interface KRI {
  id: string
  name: string
  category: string
  threshold: number
  actual: number
  unit: string
  status: 'green' | 'amber' | 'red'
  last_updated: string
}

interface AppetiteSummary {
  total_categories: number
  breaches: number
  amber_warnings: number
  within_appetite: number
  total_kris: number
  kri_breaches: number
  evaluated_at: string
}

// ── Constants ─────────────────────────────────────────────────────────

const STATUS_ICON = {
  green: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  amber: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
  red: <XCircle className="w-4 h-4 text-red-400" />,
}

const STATUS_BG = {
  green: 'border-green-500/30 bg-green-500/5',
  amber: 'border-yellow-500/30 bg-yellow-500/5',
  red: 'border-red-500/30 bg-red-500/5',
}

const BAR_COLOR = {
  green: 'bg-green-500',
  amber: 'bg-yellow-500',
  red: 'bg-red-500',
}

// ── Component ─────────────────────────────────────────────────────────

export const RiskAppetiteDashboardContent = memo(function RiskAppetiteDashboardContent() {
  const [thresholds, setThresholds] = useState<AppetiteThreshold[]>([])
  const [kris, setKRIs] = useState<KRI[]>([])
  const [summary, setSummary] = useState<AppetiteSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'appetite' | 'kris' | 'trends'>('appetite')
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [tRes, kRes, sRes] = await Promise.all([
        authFetch('/api/v1/compliance/erm/risk-appetite/thresholds'),
        authFetch('/api/v1/compliance/erm/risk-appetite/kris'),
        authFetch('/api/v1/compliance/erm/risk-appetite/summary'),
      ])
      if (!tRes.ok || !kRes.ok || !sRes.ok) throw new Error('Failed to fetch risk appetite data')
      setThresholds(await tRes.json())
      setKRIs(await kRes.json())
      setSummary(await sRes.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      <span className="ml-3 text-gray-300">Loading risk appetite…</span>
    </div>
  )

  if (error) return (
    <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-lg">
      <p className="text-red-400">{error}</p>
    </div>
  )

  const breachedThresholds = thresholds.filter(t => t.status === 'red')

  return (
    <div className="space-y-6">
      {/* Header */}
      <DashboardHeader
        title="Risk Appetite"
        subtitle="Organizational risk appetite definition, thresholds, and tracking"
        isFetching={loading}
        onRefresh={fetchData}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="risk-appetite-auto-refresh"
        rightExtra={<RotatingTip page="compliance" />}
      />

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-gray-400">Categories</p>
            <p className="text-2xl font-bold text-white">{summary.total_categories}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-red-500/30">
            <p className="text-sm text-gray-400">Breaches</p>
            <p className="text-2xl font-bold text-red-400">{summary.breaches}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-yellow-500/30">
            <p className="text-sm text-gray-400">Amber Warnings</p>
            <p className="text-2xl font-bold text-yellow-400">{summary.amber_warnings}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-green-500/30">
            <p className="text-sm text-gray-400">Within Appetite</p>
            <p className="text-2xl font-bold text-green-400">{summary.within_appetite}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-gray-400">KRI Breaches</p>
            <p className="text-2xl font-bold text-orange-400">{summary.kri_breaches} <span className="text-sm text-gray-500">of {summary.total_kris}</span></p>
          </div>
        </div>
      )}

      {/* Breach alerts */}
      {breachedThresholds.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="w-5 h-5 text-red-400" />
            <h3 className="text-sm font-semibold text-red-300">Active Breach Alerts</h3>
          </div>
          <div className="space-y-2">
            {breachedThresholds.map(t => (
              <div key={t.category} className="flex items-center gap-3 text-sm">
                <span className="text-red-300 font-medium">{t.category}</span>
                <ArrowRight className="w-3 h-3 text-gray-500" />
                <span className="text-gray-400">Actual: <span className="text-red-400 font-bold">{t.actual_exposure}</span></span>
                <span className="text-gray-500">exceeds appetite of {t.appetite_level} (max tolerance: {t.tolerance_max})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700 pb-2">
        {(['appetite', 'kris', 'trends'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab === 'appetite' ? 'Appetite vs Exposure' : tab === 'kris' ? 'Key Risk Indicators' : 'Quarterly Trends'}
          </button>
        ))}
      </div>

      {/* Appetite vs Exposure tab */}
      {activeTab === 'appetite' && (
        <div className="space-y-4">
          {thresholds.map(t => {
            const maxVal = Math.max(t.tolerance_max, t.actual_exposure, t.appetite_level) * 1.2
            const appetitePct = (t.appetite_level / maxVal) * 100
            const actualPct = (t.actual_exposure / maxVal) * 100
            const tolerancePct = (t.tolerance_max / maxVal) * 100

            return (
              <div key={t.category} className={`bg-gray-800/50 rounded-lg border p-4 ${STATUS_BG[t.status]}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {STATUS_ICON[t.status]}
                    <h3 className="text-sm font-semibold text-white">{t.category}</h3>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-gray-400">Appetite: <span className="text-blue-400 font-bold">{t.appetite_level}</span></span>
                    <span className="text-gray-400">Actual: <span className={`font-bold ${
                      t.status === 'red' ? 'text-red-400' : t.status === 'amber' ? 'text-yellow-400' : 'text-green-400'
                    }`}>{t.actual_exposure}</span></span>
                    <span className="text-gray-400">Max: {t.tolerance_max}</span>
                  </div>
                </div>

                {/* Bar chart comparison */}
                <div className="space-y-1.5 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-16">Appetite</span>
                    <div className="flex-1 h-4 bg-gray-700 rounded-full overflow-hidden relative">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${appetitePct}%` }} />
                      {/* Tolerance line */}
                      <div className="absolute top-0 bottom-0 w-0.5 bg-yellow-400" style={{ left: `${tolerancePct}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-16">Actual</span>
                    <div className="flex-1 h-4 bg-gray-700 rounded-full overflow-hidden relative">
                      <div className={`h-full rounded-full ${BAR_COLOR[t.status]}`} style={{ width: `${actualPct}%` }} />
                      <div className="absolute top-0 bottom-0 w-0.5 bg-yellow-400" style={{ left: `${tolerancePct}%` }} />
                    </div>
                  </div>
                </div>

                <p className="text-xs text-gray-500 italic">{t.statement}</p>
              </div>
            )
          })}

          <div className="flex gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /> Appetite</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Within tolerance</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500 inline-block" /> Approaching limit</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> Breached</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-yellow-400 inline-block" /> Tolerance max</span>
          </div>
        </div>
      )}

      {/* KRI tab */}
      {activeTab === 'kris' && (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left p-3">ID</th>
                <th className="text-left p-3">Indicator</th>
                <th className="text-left p-3">Category</th>
                <th className="text-center p-3">Threshold</th>
                <th className="text-center p-3">Actual</th>
                <th className="text-left p-3">Unit</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {kris.map(kri => {
                const pct = (kri.actual / kri.threshold) * 100
                return (
                  <tr key={kri.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="p-3 font-mono text-blue-300">{kri.id}</td>
                    <td className="p-3 text-white">{kri.name}</td>
                    <td className="p-3"><span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 text-xs">{kri.category}</span></td>
                    <td className="p-3 text-center text-gray-300">{kri.threshold}</td>
                    <td className="p-3 text-center">
                      <span className={`font-bold ${
                        kri.status === 'red' ? 'text-red-400' : kri.status === 'amber' ? 'text-yellow-400' : 'text-green-400'
                      }`}>{kri.actual}</span>
                    </td>
                    <td className="p-3 text-gray-400 text-xs">{kri.unit}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {STATUS_ICON[kri.status]}
                        <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${BAR_COLOR[kri.status]}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="p-3 text-xs text-gray-400">{new Date(kri.last_updated).toLocaleDateString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Trends tab */}
      {activeTab === 'trends' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">Appetite vs actual exposure over the last 4 quarters</p>
          {thresholds.map(t => (
            <div key={t.category} className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
              <div className="flex items-center gap-2 mb-3">
                {STATUS_ICON[t.status]}
                <h3 className="text-sm font-semibold text-white">{t.category}</h3>
              </div>
              <div className="flex items-end gap-3 h-20">
                {t.trend_quarters.map((val, idx) => {
                  const isOverAppetite = val > t.appetite_level
                  const maxH = Math.max(t.tolerance_max, ...t.trend_quarters) * 1.1
                  const pct = (val / maxH) * 100
                  const appetitePct = (t.appetite_level / maxH) * 100
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center relative">
                      <div className="w-full flex flex-col items-center relative h-16">
                        {/* Appetite line */}
                        <div className="absolute w-full border-t border-dashed border-blue-400/50" style={{ bottom: `${appetitePct}%` }} />
                        <div
                          className={`w-full rounded-t ${isOverAppetite ? 'bg-red-500' : 'bg-green-500'}`}
                          style={{ height: `${pct}%`, marginTop: 'auto' }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 mt-1">Q{idx + 1}</span>
                    </div>
                  )
                })}
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span>Appetite: {t.appetite_level}</span>
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  <span>Current: {t.actual_exposure}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

export default function RiskAppetiteDashboard() {
  return (<>
    <RiskAppetiteDashboardContent />
    <UnifiedDashboard config={riskAppetiteDashboardConfig} />
  </>)
}
