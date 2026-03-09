/**
 * Cross-Cluster Policy Comparison Card
 *
 * Cluster selector (max 4, follows ClusterComparison.tsx pattern).
 * Table: policies as rows, selected clusters as columns.
 * Cells: pass (green) / fail (red) / N/A (gray).
 * Sorted by most discrepancies first.
 */

import { useState, useMemo } from 'react'
import { CheckCircle2, XCircle, Minus } from 'lucide-react'
import { useCardLoadingState } from './CardDataContext'
import { useKyverno } from '../../hooks/useKyverno'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useClusters } from '../../hooks/useMCP'

interface CardConfig {
  config?: Record<string, unknown>
}

/** Maximum clusters that can be selected for comparison */
const MAX_SELECTED_CLUSTERS = 4

/** Default number of clusters to show when none are selected */
const DEFAULT_CLUSTER_COUNT = 3

type PolicyStatus = 'pass' | 'fail' | 'na'

interface PolicyRow {
  name: string
  kind: string
  statuses: Record<string, PolicyStatus>
  discrepancies: number
}

export function CrossClusterPolicyComparison({ config: _config }: CardConfig) {
  const { statuses: kyvernoStatuses, isLoading, isDemoData } = useKyverno()
  const { deduplicatedClusters: rawClusters } = useClusters()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected, customFilter } = useGlobalFilters()
  const [localSelected, setLocalSelected] = useState<string[]>([])

  useCardLoadingState({ isLoading, hasAnyData: true, isDemoData })

  // Filter clusters by global filters + custom filter
  const allClusters = useMemo(() => {
    let result = (rawClusters || []).map(c => c.name)
    if (!isAllClustersSelected && globalSelectedClusters.length > 0) {
      result = result.filter(c => globalSelectedClusters.includes(c))
    }
    if (customFilter.trim()) {
      const lower = customFilter.toLowerCase()
      result = result.filter(c => c.toLowerCase().includes(lower))
    }
    // Only include clusters that have Kyverno data
    const kyvernoKeys = new Set(Object.keys(kyvernoStatuses || {}))
    result = result.filter(c => kyvernoKeys.has(c))
    return result.sort()
  }, [rawClusters, globalSelectedClusters, isAllClustersSelected, customFilter, kyvernoStatuses])

  // Determine which clusters to compare
  const clustersToCompare = useMemo(() => {
    if (localSelected.length >= 2) {
      return localSelected.filter(c => allClusters.includes(c))
    }
    return allClusters.slice(0, DEFAULT_CLUSTER_COUNT)
  }, [allClusters, localSelected])

  const toggleCluster = (name: string) => {
    setLocalSelected(prev => {
      if (prev.includes(name)) {
        return prev.filter(c => c !== name)
      }
      if (prev.length >= MAX_SELECTED_CLUSTERS) return prev
      return [...prev, name]
    })
  }

  // Build policy comparison table
  const policyRows = useMemo((): PolicyRow[] => {
    if (clustersToCompare.length === 0) return []

    // Collect all unique policies across selected clusters
    const policyMap = new Map<string, PolicyRow>()

    for (const cluster of clustersToCompare) {
      const cs = kyvernoStatuses?.[cluster]
      if (!cs) continue

      for (const policy of (cs.policies || [])) {
        const key = `${policy.kind}/${policy.name}`
        if (!policyMap.has(key)) {
          policyMap.set(key, {
            name: policy.name,
            kind: policy.kind,
            statuses: {},
            discrepancies: 0,
          })
        }
        const row = policyMap.get(key)!
        row.statuses[cluster] = policy.violations > 0 ? 'fail' : 'pass'
      }
    }

    // Fill in N/A for clusters missing a policy
    const rows = Array.from(policyMap.values())
    for (const row of rows) {
      for (const cluster of clustersToCompare) {
        if (!row.statuses[cluster]) {
          row.statuses[cluster] = 'na'
        }
      }
      // Count discrepancies (number of distinct statuses minus 1)
      const uniqueStatuses = new Set(Object.values(row.statuses).filter(s => s !== 'na'))
      const hasNA = Object.values(row.statuses).some(s => s === 'na')
      row.discrepancies = (uniqueStatuses.size > 1 ? uniqueStatuses.size - 1 : 0) + (hasNA && uniqueStatuses.size > 0 ? 1 : 0)
    }

    // Sort by most discrepancies first, then alphabetically
    rows.sort((a, b) => b.discrepancies - a.discrepancies || a.name.localeCompare(b.name))
    return rows
  }, [kyvernoStatuses, clustersToCompare])

  const statusIcon = (status: PolicyStatus) => {
    switch (status) {
      case 'pass': return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
      case 'fail': return <XCircle className="w-3.5 h-3.5 text-red-400" />
      case 'na': return <Minus className="w-3.5 h-3.5 text-zinc-500" />
    }
  }

  if (allClusters.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-4">
        No clusters with Kyverno detected
      </div>
    )
  }

  return (
    <div className="space-y-2 p-1">
      {/* Cluster selector */}
      <div className="flex flex-wrap gap-1">
        {allClusters.map(cluster => {
          const isSelected = localSelected.includes(cluster) ||
            (localSelected.length < 2 && allClusters.indexOf(cluster) < DEFAULT_CLUSTER_COUNT)
          return (
            <button
              key={cluster}
              onClick={() => toggleCluster(cluster)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                isSelected
                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                  : 'bg-card/50 border-border/50 text-muted-foreground hover:border-border'
              }`}
              title={localSelected.length >= MAX_SELECTED_CLUSTERS && !isSelected ? `Max ${MAX_SELECTED_CLUSTERS} clusters` : undefined}
            >
              {cluster}
            </button>
          )
        })}
      </div>

      {/* Policy table */}
      {policyRows.length === 0 ? (
        <div className="text-center text-xs text-muted-foreground py-4">
          No policies found in selected clusters
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-1 px-1 font-medium text-muted-foreground">Policy</th>
                {clustersToCompare.map(c => (
                  <th key={c} className="text-center py-1 px-1 font-mono font-medium text-muted-foreground truncate max-w-[80px]" title={c}>
                    {c.length > 12 ? `${c.slice(0, 12)}...` : c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {policyRows.map(row => (
                <tr
                  key={`${row.kind}/${row.name}`}
                  className={`border-b border-border/20 ${row.discrepancies > 0 ? 'bg-yellow-500/5' : ''}`}
                >
                  <td className="py-1 px-1">
                    <span className="font-mono truncate block max-w-[120px]" title={`${row.kind}/${row.name}`}>
                      {row.name}
                    </span>
                  </td>
                  {clustersToCompare.map(c => (
                    <td key={c} className="text-center py-1 px-1">
                      <span className="inline-flex justify-center">
                        {statusIcon(row.statuses[c])}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      <div className="text-[10px] text-muted-foreground border-t border-border/50 pt-1">
        {policyRows.length} policies across {clustersToCompare.length} clusters
        {policyRows.filter(r => r.discrepancies > 0).length > 0 && (
          <span className="text-yellow-400 ml-1">
            ({policyRows.filter(r => r.discrepancies > 0).length} with discrepancies)
          </span>
        )}
      </div>
    </div>
  )
}

export default CrossClusterPolicyComparison
