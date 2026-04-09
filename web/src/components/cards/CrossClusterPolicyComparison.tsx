/**
 * Cross-Cluster Policy Comparison Card
 *
 * Cluster selector (max 4, follows ClusterComparison.tsx pattern).
 * Table: policies as rows, selected clusters as columns.
 * Cells: pass (green) / fail (red) / N/A (gray).
 * Sorted by most discrepancies first.
 */

import { useState, useMemo } from 'react'
import { AlertTriangle, CheckCircle2, XCircle, Minus, Info, Loader2 } from 'lucide-react'
import { ProgressRing } from '../ui/ProgressRing'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { RefreshIndicator } from '../ui/RefreshIndicator'
import { useCardLoadingState } from './CardDataContext'
import { useKyverno } from '../../hooks/useKyverno'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useClusters } from '../../hooks/useMCP'
import { KyvernoDetailModal } from './kyverno/KyvernoDetailModal'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'

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

function CrossClusterPolicyComparisonInternal({ config: _config }: CardConfig) {
  const { t } = useTranslation('cards')
  const { statuses: kyvernoStatuses, isLoading, isRefreshing, lastRefresh, isDemoData, refetch, clustersChecked, totalClusters, consecutiveFailures } = useKyverno()
  const { deduplicatedClusters: rawClusters } = useClusters()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected, customFilter } = useGlobalFilters()
  const [localSelected, setLocalSelected] = useState<string[]>([])
  const [modalCluster, setModalCluster] = useState<string | null>(null)

  /** Whether all clusters encountered errors (none succeeded) */
  const hasError = !isLoading && !isRefreshing &&
    Object.keys(kyvernoStatuses || {}).length > 0 &&
    Object.values(kyvernoStatuses || {}).every(s => !!s.error)

  const hasAnyData = Object.values(kyvernoStatuses || {}).some(s => s.installed)
  useCardLoadingState({ isLoading: isLoading && !isDemoData, isRefreshing, hasAnyData, isDemoData, isFailed: hasError, consecutiveFailures })

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
    // Only include clusters where Kyverno is actually installed
    result = result.filter(c => kyvernoStatuses?.[c]?.installed)
    return result.sort()
  }, [rawClusters, globalSelectedClusters, isAllClustersSelected, customFilter, kyvernoStatuses])

  // Determine which clusters to compare
  const clustersToCompare = (() => {
    if (localSelected.length >= 2) {
      return localSelected.filter(c => allClusters.includes(c))
    }
    return allClusters.slice(0, DEFAULT_CLUSTER_COUNT)
  })()

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

      // Note: per-policy violations are not populated by the hook (always 0).
      // Use cluster-level totalViolations as a signal: if the cluster has
      // violations, audit-mode policies are marked 'fail' since they may
      // be contributing; enforcing policies always pass (violations are blocked).
      const clusterHasViolations = cs.totalViolations > 0

      for (const policy of (cs.policies || [])) {
        const key = `${policy.kind}/${policy.name}`
        if (!policyMap.has(key)) {
          policyMap.set(key, {
            name: policy.name,
            kind: policy.kind,
            statuses: {},
            discrepancies: 0 })
        }
        const row = policyMap.get(key)!
        const isAudit = policy.status === 'audit'
        row.statuses[cluster] = (clusterHasViolations && isAudit) ? 'fail' : 'pass'
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

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2 p-4">
        <AlertTriangle className="w-6 h-6 text-destructive opacity-70" />
        <p className="text-destructive">Failed to load Kyverno data</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          Retry
        </Button>
      </div>
    )
  }

  if (allClusters.length === 0) {
    // Still scanning — show loading state instead of definitive empty state
    if (isLoading || isRefreshing) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4 gap-3">
          {totalClusters > 0 ? (
            <ProgressRing progress={clustersChecked / totalClusters} size={28} strokeWidth={2.5} />
          ) : (
            <Loader2 className="w-6 h-6 animate-spin opacity-50" />
          )}
          <p>{t('crossClusterPolicy.scanningKyverno')}</p>
        </div>
      )
    }
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-4">
        {t('crossClusterPolicy.noKyvernoClusters')}
      </div>
    )
  }

  /** Open the detail modal for the first cluster where this policy has a failing status */
  const handleRowClick = (row: PolicyRow) => {
    // Prefer a cluster with failures, otherwise first cluster
    const failCluster = clustersToCompare.find(c => row.statuses[c] === 'fail')
    const cluster = failCluster || clustersToCompare[0]
    if (cluster && kyvernoStatuses?.[cluster]?.installed) {
      setModalCluster(cluster)
    }
  }

  return (
    <div className="space-y-2 p-1">
      {/* Context description */}
      <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground bg-secondary/20 rounded-md px-2 py-1.5">
        <Info className="w-3 h-3 flex-shrink-0 mt-0.5 text-muted-foreground/60" />
        <span>{t('crossClusterPolicy.contextDescription')}</span>
      </div>

      {/* Refresh indicator + inline progress */}
      <div className="flex items-center justify-between">
        {(isLoading || isRefreshing) && totalClusters > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ProgressRing progress={clustersChecked / totalClusters} size={14} strokeWidth={1.5} />
            <span>{t('crossClusterPolicy.scanning')}</span>
          </div>
        )}
        <div className="ml-auto">
          <RefreshIndicator isRefreshing={isRefreshing} lastUpdated={lastRefresh} size="xs" />
        </div>
      </div>

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
                  className={`border-b border-border/20 cursor-pointer hover:bg-secondary/30 transition-colors ${row.discrepancies > 0 ? 'bg-yellow-500/5' : ''}`}
                  onClick={() => handleRowClick(row)}
                  role="button"
                  aria-label={`View policy details: ${row.kind}/${row.name}`}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleRowClick(row) } }}
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

      {/* Detail Modal */}
      {modalCluster && kyvernoStatuses?.[modalCluster] && (
        <KyvernoDetailModal
          isOpen={!!modalCluster}
          onClose={() => setModalCluster(null)}
          clusterName={modalCluster}
          status={kyvernoStatuses[modalCluster]}
          onRefresh={() => refetch()}
          isRefreshing={isRefreshing}
        />
      )}
    </div>
  )
}

export function CrossClusterPolicyComparison(props: CardConfig) {
  return (
    <DynamicCardErrorBoundary cardId="CrossClusterPolicyComparison">
      <CrossClusterPolicyComparisonInternal {...props} />
    </DynamicCardErrorBoundary>
  )
}

export default CrossClusterPolicyComparison
