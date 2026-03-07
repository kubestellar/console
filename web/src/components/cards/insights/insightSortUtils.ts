import { useState, useMemo } from 'react'
import type { MultiClusterInsight, InsightSeverity } from '../../../types/insights'
import type { SortDirection } from '../../ui/CardControls'

/** Numeric ordering for insight severity levels */
const INSIGHT_SEVERITY_ORDER: Record<InsightSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

/** Default number of insight items to display */
const DEFAULT_INSIGHT_LIMIT = 5

export type InsightSortField = 'severity' | 'clusters' | 'time' | 'title'

export const INSIGHT_SORT_OPTIONS: { value: InsightSortField; label: string }[] = [
  { value: 'severity', label: 'Severity' },
  { value: 'clusters', label: 'Clusters' },
  { value: 'time', label: 'Time' },
  { value: 'title', label: 'Title' },
]

const insightComparators: Record<InsightSortField, (a: MultiClusterInsight, b: MultiClusterInsight) => number> = {
  severity: (a, b) =>
    (INSIGHT_SEVERITY_ORDER[a.severity] ?? 3) - (INSIGHT_SEVERITY_ORDER[b.severity] ?? 3),
  clusters: (a, b) =>
    (a.affectedClusters?.length ?? 0) - (b.affectedClusters?.length ?? 0),
  time: (a, b) =>
    new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime(),
  title: (a, b) => a.title.localeCompare(b.title),
}

/**
 * Hook that provides sort/limit state and sorted+limited insights array.
 * Used by all Insights dashboard cards for unified controls.
 */
export function useInsightSort(
  insights: MultiClusterInsight[],
  defaultSort: InsightSortField = 'severity',
  defaultDirection: SortDirection = 'asc',
) {
  const [sortBy, setSortBy] = useState<InsightSortField>(defaultSort)
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultDirection)
  const [limit, setLimit] = useState<number | 'unlimited'>(DEFAULT_INSIGHT_LIMIT)

  const sorted = useMemo(() => {
    const cmp = insightComparators[sortBy]
    const dirMul = sortDirection === 'asc' ? 1 : -1
    const result = [...insights].sort((a, b) => dirMul * cmp(a, b))
    if (limit === 'unlimited') return result
    return result.slice(0, limit)
  }, [insights, sortBy, sortDirection, limit])

  return {
    sorted,
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,
    limit,
    setLimit,
  }
}
