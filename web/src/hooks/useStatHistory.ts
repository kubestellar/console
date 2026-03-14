import { useRef, useEffect, useCallback } from 'react'
import type { DashboardStatsType } from '../components/ui/StatsBlockDefinitions'

/**
 * Ring buffer hook that accumulates stat values over time for sparkline rendering.
 *
 * Samples current numeric values from getStatValue at a fixed interval and stores
 * them in a ref-backed Map. History is ephemeral (session only) — sparklines fill
 * up progressively as the user keeps the dashboard open.
 */

/** Maximum number of data points retained per stat block */
const HISTORY_BUFFER_SIZE = 20

/** Minimum interval (ms) between recording data points */
const HISTORY_SAMPLE_INTERVAL_MS = 15_000

/** Minimum data points needed before sparkline rendering kicks in */
export const MIN_SPARKLINE_POINTS = 3

interface StatHistoryEntry {
  values: number[]
  lastRecordedAt: number
}

interface StatBlockValueLike {
  value: string | number
}

export function useStatHistory(
  dashboardType: DashboardStatsType,
  getStatValue: (blockId: string) => StatBlockValueLike,
  visibleBlockIds: string[],
  isLoading: boolean,
): {
  getHistory: (blockId: string) => number[]
} {
  const historyRef = useRef<Map<string, StatHistoryEntry>>(new Map())
  const dashboardRef = useRef(dashboardType)

  // Reset history when dashboard type changes
  if (dashboardRef.current !== dashboardType) {
    dashboardRef.current = dashboardType
    historyRef.current = new Map()
  }

  // Sample current values at the configured interval
  useEffect(() => {
    if (isLoading) return

    const sample = () => {
      const now = Date.now()
      for (const blockId of visibleBlockIds) {
        const data = getStatValue(blockId)
        const numericValue = typeof data.value === 'number'
          ? data.value
          : parseFloat(String(data.value))

        if (isNaN(numericValue)) continue

        const entry = historyRef.current.get(blockId)
        if (entry && now - entry.lastRecordedAt < HISTORY_SAMPLE_INTERVAL_MS) {
          continue
        }

        const values = entry ? [...entry.values] : []
        values.push(numericValue)
        // Keep only the last HISTORY_BUFFER_SIZE points
        if (values.length > HISTORY_BUFFER_SIZE) {
          values.splice(0, values.length - HISTORY_BUFFER_SIZE)
        }

        historyRef.current.set(blockId, { values, lastRecordedAt: now })
      }
    }

    // Sample immediately, then on interval
    sample()
    const timer = setInterval(sample, HISTORY_SAMPLE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [dashboardType, visibleBlockIds, isLoading, getStatValue])

  const getHistory = useCallback((blockId: string): number[] => {
    return historyRef.current.get(blockId)?.values ?? []
  }, [])

  return { getHistory }
}
