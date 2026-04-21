/**
 * Results table and KPI box for the Drasi Reactive Graph card.
 *
 * Exports: ResultsTable, KPIBox, formatCell, findTrendColumn, compareCells
 */
import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUp, ArrowDown, ArrowUpDown, TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMemo } from 'react'
import { MAX_RESULT_ROWS } from './DrasiConstants'
import type { LiveResultRow } from './DrasiTypes'

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

/** Format a single cell value for the dynamic results table. */
export function formatCell(value: LiveResultRow[string]): React.ReactNode {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') {
    // Render numbers with up to 2 decimals; ints render plain.
    return Number.isInteger(value) ? String(value) : value.toFixed(2)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

/** Pick a percentage-like column for the leading ▲/▼ trend indicator, if any. */
export function findTrendColumn(columns: string[]): string | null {
  return (
    columns.find(c => c === 'changePercent' || c === 'change_percent' || c === 'change') ||
    null
  )
}

/** Compare two result cells for sort ordering. Handles numbers, strings, and
 *  mixed-type columns gracefully. Nullish values sort last. */
export function compareCells(a: LiveResultRow[string], b: LiveResultRow[string]): number {
  const aNull = a === null || a === undefined
  const bNull = b === null || b === undefined
  if (aNull && bNull) return 0
  if (aNull) return 1
  if (bNull) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

// ---------------------------------------------------------------------------
// KPIBox
// ---------------------------------------------------------------------------

/** Compact at-a-glance KPI box for the strip above the graph. */
export function KPIBox({ label, value, accent }: { label: string; value: number; accent: 'emerald' | 'cyan' }) {
  const accentClass = accent === 'cyan' ? 'text-cyan-400' : 'text-emerald-400'
  return (
    <div className="bg-slate-900/80 border border-slate-700/40 rounded px-3 py-1.5 flex flex-wrap items-center justify-between gap-y-2">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={`text-sm font-mono font-semibold ${accentClass}`}>{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ResultsTable
// ---------------------------------------------------------------------------

interface ResultsTableProps {
  results: LiveResultRow[]
  isDemo: boolean
  /** Row click opens the detail drawer in the parent. */
  onRowClick?: (row: LiveResultRow) => void
  /** Optional CTA rendered in the header bar (right-aligned). Used by the
   *  drasi-platform "Enable live results" button. */
  headerAction?: React.ReactNode
}

export function ResultsTable({ results, isDemo, onRowClick, headerAction }: ResultsTableProps) {
  const { t } = useTranslation()
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Derive columns from the first row's keys so the table works for any
  // continuous-query schema, not just the stock-ticker shape we use in demo.
  const columns: string[] = results[0] ? Object.keys(results[0]) : []
  const trendCol = findTrendColumn(columns)

  // Sort the full result set (not the truncated slice) so sorting remains
  // consistent when MAX_RESULT_ROWS cuts off. Only slice AFTER sorting.
  const sortedResults = useMemo(() => {
    if (!sortCol) return results
    const sorted = [...results].sort((a, b) => compareCells(a[sortCol], b[sortCol]))
    return sortDir === 'desc' ? sorted.reverse() : sorted
  }, [results, sortCol, sortDir])
  const displayResults = sortedResults.slice(0, MAX_RESULT_ROWS)
  const totalRows = results.length
  const label = isDemo ? t('drasi.demoResultsLabel') : t('drasi.liveResultsLabel')

  const handleHeaderClick = (col: string) => {
    if (sortCol !== col) {
      setSortCol(col)
      setSortDir('asc')
      return
    }
    // Toggle direction on repeat click; third click clears the sort.
    if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortCol(null)
    }
  }

  return (
    <div className="mt-2 bg-slate-950/80 border border-slate-700/40 rounded overflow-hidden">
      <div className="px-2 py-1 border-b border-slate-700/50 flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-cyan-400 uppercase tracking-wider">{label}</span>
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-emerald-400"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          />
        </div>
        <div className="flex items-center gap-2">
          {headerAction}
          <span className="text-[10px] text-muted-foreground">{totalRows} rows</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-slate-800/50">
              {columns.map(col => {
                const isNumCol = typeof displayResults[0]?.[col] === 'number'
                const isSorted = sortCol === col
                return (
                  <th
                    key={col}
                    onClick={e => { e.stopPropagation(); handleHeaderClick(col) }}
                    className={`px-2 py-1 text-muted-foreground font-medium cursor-pointer select-none hover:text-cyan-300 ${
                      isNumCol ? 'text-right' : 'text-left'
                    }`}
                  >
                    <span className={`inline-flex items-center gap-0.5 ${isNumCol ? 'justify-end w-full' : ''}`}>
                      {col}
                      {isSorted ? (
                        sortDir === 'asc' ? <ArrowUp className="w-2 h-2" /> : <ArrowDown className="w-2 h-2" />
                      ) : (
                        <ArrowUpDown className="w-2 h-2 opacity-30" />
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {displayResults.map((row, idx) => (
              <tr
                key={idx}
                onClick={e => { e.stopPropagation(); onRowClick?.(row) }}
                className={`border-b border-slate-800/30 hover:bg-slate-800/30 ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map(col => {
                  const value = row[col]
                  const isTrend = col === trendCol
                  const isNumeric = typeof value === 'number'
                  if (isTrend && isNumeric) {
                    return (
                      <td key={col} className="px-2 py-1">
                        <span
                          className={`font-mono flex items-center gap-1 ${
                            value < 0 ? 'text-red-400' : 'text-green-400'
                          }`}
                        >
                          {value < 0 ? (
                            <TrendingDown className="w-2.5 h-2.5" />
                          ) : (
                            <TrendingUp className="w-2.5 h-2.5" />
                          )}
                          {value.toFixed(2)}
                        </span>
                      </td>
                    )
                  }
                  return (
                    <td
                      key={col}
                      className={`px-2 py-1 ${
                        isNumeric
                          ? 'text-white font-mono text-right'
                          : 'text-white truncate max-w-[160px]'
                      }`}
                    >
                      {formatCell(value)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
