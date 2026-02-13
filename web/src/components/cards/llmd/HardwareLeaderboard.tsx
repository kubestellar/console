/**
 * HardwareLeaderboard — Sortable ranked table comparing configurations
 *
 * Columns: Rank, Hardware, Model, Config, Framework, Throughput/GPU,
 * TTFT p50, TPOT p50, p99 Latency, Score, llm-d Advantage %.
 * Top 3 get medal styling. Rows are sortable by any column.
 */
import { useState, useMemo } from 'react'
import { Trophy, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react'
import { useReportCardDataState } from '../CardDataContext'
import {
  generateBenchmarkReports,
  generateLeaderboardRows,
  CONFIG_COLORS,
  type LeaderboardRow,
} from '../../../lib/llmd/benchmarkMockData'

type SortKey = keyof Pick<LeaderboardRow, 'score' | 'throughputPerGpu' | 'ttftP50Ms' | 'tpotP50Ms' | 'p99LatencyMs' | 'llmdAdvantage'>
type SortDir = 'asc' | 'desc'

const MEDAL = ['', '\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'] // gold, silver, bronze

const COLUMNS: { key: SortKey; label: string; unit: string; higherBetter: boolean; width: string }[] = [
  { key: 'throughputPerGpu', label: 'Throughput/GPU', unit: 'tok/s', higherBetter: true, width: 'w-[100px]' },
  { key: 'ttftP50Ms', label: 'TTFT p50', unit: 'ms', higherBetter: false, width: 'w-[80px]' },
  { key: 'tpotP50Ms', label: 'TPOT p50', unit: 'ms', higherBetter: false, width: 'w-[80px]' },
  { key: 'p99LatencyMs', label: 'p99 Latency', unit: 'ms', higherBetter: false, width: 'w-[80px]' },
  { key: 'score', label: 'Score', unit: '', higherBetter: true, width: 'w-[70px]' },
  { key: 'llmdAdvantage', label: 'Advantage', unit: '%', higherBetter: true, width: 'w-[80px]' },
]

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown size={11} className="text-slate-600" />
  return dir === 'desc'
    ? <ChevronDown size={12} className="text-blue-400" />
    : <ChevronUp size={12} className="text-blue-400" />
}

export function HardwareLeaderboard() {
  useReportCardDataState({ isDemoData: true, isFailed: false, consecutiveFailures: 0, hasData: true })

  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [modelFilter, setModelFilter] = useState<string>('all')

  const allRows = useMemo(() => {
    const reports = generateBenchmarkReports()
    return generateLeaderboardRows(reports)
  }, [])

  const models = useMemo(() => [...new Set(allRows.map(r => r.model))], [allRows])

  const rows = useMemo(() => {
    let filtered = modelFilter === 'all' ? allRows : allRows.filter(r => r.model === modelFilter)
    filtered = [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? -Infinity
      const bv = b[sortKey] ?? -Infinity
      return sortDir === 'desc' ? (bv as number) - (av as number) : (av as number) - (bv as number)
    })
    filtered.forEach((r, i) => { r.rank = i + 1 })
    return filtered
  }, [allRows, sortKey, sortDir, modelFilter])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-amber-400" />
          <span className="text-sm font-medium text-white">Hardware Leaderboard</span>
          <span className="text-xs text-slate-500">{rows.length} configs</span>
        </div>
        <select
          value={modelFilter}
          onChange={e => setModelFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white"
        >
          <option value="all">All Models</option>
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-sm z-10">
            <tr className="border-b border-slate-700/50">
              <th className="text-left py-2 px-2 text-slate-500 font-medium w-[36px]">#</th>
              <th className="text-left py-2 px-2 text-slate-500 font-medium w-[70px]">Hardware</th>
              <th className="text-left py-2 px-2 text-slate-500 font-medium w-[100px]">Model</th>
              <th className="text-left py-2 px-2 text-slate-500 font-medium w-[90px]">Config</th>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={`text-right py-2 px-2 text-slate-500 font-medium cursor-pointer hover:text-white transition-colors ${col.width}`}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{col.label}</span>
                    <SortIcon active={sortKey === col.key} dir={sortDir} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={`${row.hardware}-${row.model}-${row.config}`}
                className={`border-b border-slate-800/50 transition-colors hover:bg-slate-800/30 ${
                  row.config !== 'standalone' ? 'bg-blue-500/[0.03]' : ''
                }`}
              >
                <td className="py-2 px-2 font-mono text-slate-400">
                  {row.rank <= 3 ? (
                    <span className="text-sm">{MEDAL[row.rank]}</span>
                  ) : (
                    row.rank
                  )}
                </td>
                <td className="py-2 px-2 text-white font-medium">{row.hardware}</td>
                <td className="py-2 px-2 text-slate-300 truncate max-w-[100px]">{row.model}</td>
                <td className="py-2 px-2">
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{ background: `${CONFIG_COLORS[row.config]}20`, color: CONFIG_COLORS[row.config] }}
                  >
                    {row.config}
                  </span>
                </td>
                <td className="py-2 px-2 text-right font-mono text-white">{row.throughputPerGpu.toLocaleString()}</td>
                <td className="py-2 px-2 text-right font-mono text-slate-300">{row.ttftP50Ms.toFixed(1)}</td>
                <td className="py-2 px-2 text-right font-mono text-slate-300">{row.tpotP50Ms.toFixed(2)}</td>
                <td className="py-2 px-2 text-right font-mono text-slate-300">{row.p99LatencyMs.toLocaleString()}</td>
                <td className="py-2 px-2 text-right">
                  <span className={`font-mono font-bold ${
                    row.score >= 70 ? 'text-emerald-400' : row.score >= 50 ? 'text-amber-400' : 'text-slate-400'
                  }`}>
                    {row.score.toFixed(1)}
                  </span>
                </td>
                <td className="py-2 px-2 text-right">
                  {row.llmdAdvantage != null ? (
                    <span className={`font-mono font-medium ${row.llmdAdvantage > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {row.llmdAdvantage > 0 ? '+' : ''}{row.llmdAdvantage}%
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default HardwareLeaderboard
