import { useState, useEffect, useMemo, memo, useCallback } from 'react'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { riskMatrixDashboardConfig } from '../../config/dashboards/risk-matrix'
import {
  Loader2, TrendingUp, TrendingDown,
  ArrowRight, ChevronDown,
} from 'lucide-react'
import { authFetch } from '../../lib/api'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'

// ── Types ─────────────────────────────────────────────────────────────

interface Risk {
  id: string
  name: string
  category: string
  likelihood: number
  impact: number
  score: number
  owner: string
  status: string
  last_review: string
}

interface HeatmapCell {
  likelihood: number
  impact: number
  count: number
  risks: string[]
}

interface RiskSummary {
  total_risks: number
  critical: number
  high: number
  medium: number
  low: number
  trend_direction: 'up' | 'down' | 'stable'
  trend_percentage: number
  evaluated_at: string
}

// ── Constants ─────────────────────────────────────────────────────────

const MATRIX_SIZE = 5
const AXIS_LABELS = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain']
const IMPACT_LABELS = ['Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic']

/** Color for a cell based on risk score = likelihood × impact */
function cellColor(likelihood: number, impact: number): string {
  const score = likelihood * impact
  if (score >= 20) return 'bg-red-900 hover:bg-red-800'
  if (score >= 15) return 'bg-red-700 hover:bg-red-600'
  if (score >= 10) return 'bg-orange-700 hover:bg-orange-600'
  if (score >= 5)  return 'bg-yellow-700 hover:bg-yellow-600'
  return 'bg-green-800 hover:bg-green-700'
}

function severityBadge(score: number) {
  if (score >= 20) return <span className="px-2 py-0.5 rounded bg-red-900 text-red-200 text-xs font-medium">Critical</span>
  if (score >= 15) return <span className="px-2 py-0.5 rounded bg-red-700 text-red-100 text-xs font-medium">High</span>
  if (score >= 10) return <span className="px-2 py-0.5 rounded bg-orange-700 text-orange-100 text-xs font-medium">Medium</span>
  return <span className="px-2 py-0.5 rounded bg-green-800 text-green-200 text-xs font-medium">Low</span>
}

// ── Component ─────────────────────────────────────────────────────────

export const RiskMatrixDashboardContent = memo(function RiskMatrixDashboardContent() {
  const [risks, setRisks] = useState<Risk[]>([])
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([])
  const [summary, setSummary] = useState<RiskSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCell, setSelectedCell] = useState<{ l: number; i: number } | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rRes, hRes, sRes] = await Promise.all([
        authFetch('/api/v1/compliance/erm/risk-matrix/risks'),
        authFetch('/api/v1/compliance/erm/risk-matrix/heatmap'),
        authFetch('/api/v1/compliance/erm/risk-matrix/summary'),
      ])
      if (!rRes.ok || !hRes.ok || !sRes.ok) throw new Error('Failed to fetch risk matrix data')
      setRisks(await rRes.json())
      setHeatmap(await hRes.json())
      setSummary(await sRes.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Build a lookup from heatmap data
  const heatmapLookup = useMemo(() => {
    const map = new Map<string, HeatmapCell>()
    for (const cell of heatmap) {
      map.set(`${cell.likelihood}-${cell.impact}`, cell)
    }
    return map
  }, [heatmap])

  // Risks in selected cell
  const selectedRisks = useMemo(() => {
    if (!selectedCell) return []
    return risks.filter(r => r.likelihood === selectedCell.l && r.impact === selectedCell.i)
  }, [risks, selectedCell])

  // Top risks by score
  const topRisks = useMemo(() =>
    [...risks].sort((a, b) => b.score - a.score).slice(0, 10)
  , [risks])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      <span className="ml-3 text-gray-300">Loading risk matrix…</span>
    </div>
  )

  if (error) return (
    <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-lg">
      <p className="text-red-400">{error}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <DashboardHeader
        title="Risk Matrix"
        subtitle="Interactive 5x5 risk heat map with likelihood vs impact assessment"
        isFetching={loading}
        onRefresh={fetchData}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="risk-matrix-auto-refresh"
        rightExtra={<RotatingTip page="compliance" />}
      />

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-gray-400">Total Risks</p>
            <p className="text-2xl font-bold text-white">{summary.total_risks}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-red-900/30">
            <p className="text-sm text-gray-400">Critical</p>
            <p className="text-2xl font-bold text-red-400">{summary.critical}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-red-700/30">
            <p className="text-sm text-gray-400">High</p>
            <p className="text-2xl font-bold text-red-300">{summary.high}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-orange-700/30">
            <p className="text-sm text-gray-400">Medium</p>
            <p className="text-2xl font-bold text-orange-400">{summary.medium}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-green-700/30">
            <p className="text-sm text-gray-400">Low</p>
            <p className="text-2xl font-bold text-green-400">{summary.low}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-gray-400">Trend</p>
            <div className="flex items-center gap-1">
              {summary.trend_direction === 'down' ? (
                <TrendingDown className="w-5 h-5 text-green-400" />
              ) : summary.trend_direction === 'up' ? (
                <TrendingUp className="w-5 h-5 text-red-400" />
              ) : (
                <ArrowRight className="w-5 h-5 text-gray-400" />
              )}
              <span className={`text-lg font-bold ${
                summary.trend_direction === 'down' ? 'text-green-400' :
                summary.trend_direction === 'up' ? 'text-red-400' : 'text-gray-400'
              }`}>{summary.trend_percentage}%</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Heat Map */}
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Risk Heat Map</h2>
          <p className="text-xs text-gray-400 mb-3">Click a cell to view risks in that zone</p>
          <div className="flex">
            {/* Y-axis label */}
            <div className="flex flex-col justify-center mr-2">
              <span className="text-xs text-gray-400 -rotate-90 whitespace-nowrap">← Likelihood →</span>
            </div>
            <div className="flex-1">
              {/* Grid rows — highest likelihood at top */}
              {Array.from({ length: MATRIX_SIZE }, (_, rowIdx) => {
                const likelihood = MATRIX_SIZE - rowIdx
                return (
                  <div key={likelihood} className="flex items-center gap-1 mb-1">
                    <span className="text-xs text-gray-400 w-20 text-right pr-2 truncate">{AXIS_LABELS[likelihood - 1]}</span>
                    {Array.from({ length: MATRIX_SIZE }, (_, colIdx) => {
                      const impact = colIdx + 1
                      const cell = heatmapLookup.get(`${likelihood}-${impact}`)
                      const count = cell?.count ?? 0
                      const isSelected = selectedCell?.l === likelihood && selectedCell?.i === impact
                      return (
                        <button
                          key={impact}
                          onClick={() => setSelectedCell(isSelected ? null : { l: likelihood, i: impact })}
                          className={`flex-1 aspect-square rounded flex items-center justify-center text-sm font-bold transition-all ${cellColor(likelihood, impact)} ${
                            isSelected ? 'ring-2 ring-white scale-105' : ''
                          }`}
                          title={`L${likelihood} × I${impact} = ${likelihood * impact} (${count} risks)`}
                        >
                          {count > 0 ? count : ''}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
              {/* X-axis labels */}
              <div className="flex gap-1 mt-1 ml-20">
                {IMPACT_LABELS.map(label => (
                  <span key={label} className="flex-1 text-center text-xs text-gray-400 truncate">{label}</span>
                ))}
              </div>
              <p className="text-xs text-gray-400 text-center mt-1">← Impact →</p>
            </div>
          </div>
        </div>

        {/* Selected cell detail OR top risks */}
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
          {selectedCell ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">
                  Risks: L{selectedCell.l} × I{selectedCell.i}
                </h2>
                <button
                  onClick={() => setSelectedCell(null)}
                  className="text-xs text-gray-400 hover:text-white"
                >Clear selection</button>
              </div>
              {selectedRisks.length === 0 ? (
                <p className="text-gray-500 text-sm">No risks in this zone</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {selectedRisks.map(risk => (
                    <div key={risk.id} className="bg-gray-900/50 rounded p-3 border border-gray-700/50">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-white">{risk.name}</span>
                        {severityBadge(risk.score)}
                      </div>
                      <div className="flex gap-4 text-xs text-gray-400">
                        <span>{risk.category}</span>
                        <span>Owner: {risk.owner}</span>
                        <span className={risk.status === 'Open' ? 'text-yellow-400' : 'text-green-400'}>{risk.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-white mb-4">Top Risks by Score</h2>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {topRisks.map((risk, idx) => (
                  <div key={risk.id} className="flex items-center gap-3 bg-gray-900/50 rounded p-3 border border-gray-700/50">
                    <span className="text-xs text-gray-500 w-6">{idx + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{risk.name}</p>
                      <p className="text-xs text-gray-400">{risk.category} · {risk.owner}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-white">{risk.score}</span>
                      <p className="text-xs text-gray-500">L{risk.likelihood}×I{risk.impact}</p>
                    </div>
                    {severityBadge(risk.score)}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Risk trend sparkline */}
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Risk Score Trend (Last 6 Months)</h2>
        <div className="flex items-end gap-2 h-24">
          {[42, 38, 45, 41, 36, 34].map((val, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-gradient-to-t from-orange-600 to-orange-400 transition-all"
                style={{ height: `${(val / 50) * 100}%` }}
              />
              <span className="text-xs text-gray-400">M{idx + 1}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3 text-sm">
          <TrendingDown className="w-4 h-4 text-green-400" />
          <span className="text-green-400">19% improvement over 6 months</span>
        </div>
      </div>

      {/* All risks table */}
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex items-center gap-2">
          <ChevronDown className="w-4 h-4 text-gray-400" />
          <h2 className="text-lg font-semibold text-white">All Risks</h2>
          <span className="text-xs text-gray-500 ml-2">({risks.length} total)</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700">
              <th className="text-left p-3">ID</th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Category</th>
              <th className="text-center p-3">L</th>
              <th className="text-center p-3">I</th>
              <th className="text-center p-3">Score</th>
              <th className="text-left p-3">Severity</th>
              <th className="text-left p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {risks.map(r => (
              <tr key={r.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                <td className="p-3 font-mono text-blue-300">{r.id}</td>
                <td className="p-3 text-white">{r.name}</td>
                <td className="p-3"><span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 text-xs">{r.category}</span></td>
                <td className="p-3 text-center text-gray-300">{r.likelihood}</td>
                <td className="p-3 text-center text-gray-300">{r.impact}</td>
                <td className="p-3 text-center font-bold text-white">{r.score}</td>
                <td className="p-3">{severityBadge(r.score)}</td>
                <td className="p-3">
                  <span className={`text-xs font-medium ${
                    r.status === 'Open' ? 'text-yellow-400' :
                    r.status === 'Mitigating' ? 'text-blue-400' :
                    r.status === 'Accepted' ? 'text-gray-400' : 'text-green-400'
                  }`}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
})

export default function RiskMatrixDashboard() {
  return (<>
    <RiskMatrixDashboardContent />
    <UnifiedDashboard config={riskMatrixDashboardConfig} />
  </>)
}
