import { useState, useMemo } from 'react'
import { Newspaper, Clock, AlertTriangle, RefreshCw, Settings } from 'lucide-react'
import { useClusters, useOperatorSubscriptions } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'

interface OperatorSubscriptionsProps {
  config?: {
    cluster?: string
  }
}

export function OperatorSubscriptions({ config }: OperatorSubscriptionsProps) {
  const { clusters: allClusters, isLoading: clustersLoading } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()

  // Apply global filters
  const clusters = useMemo(() => {
    let result = allClusters

    if (!isAllClustersSelected) {
      result = result.filter(c => globalSelectedClusters.includes(c.name))
    }

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query)
      )
    }

    return result
  }, [allClusters, globalSelectedClusters, isAllClustersSelected, customFilter])

  // Fetch subscriptions for selected cluster
  const { subscriptions, isLoading: subscriptionsLoading, refetch } = useOperatorSubscriptions(selectedCluster || undefined)

  const isLoading = clustersLoading || subscriptionsLoading

  const autoCount = subscriptions.filter(s => s.installPlanApproval === 'Automatic').length
  const manualCount = subscriptions.filter(s => s.installPlanApproval === 'Manual').length
  const pendingCount = subscriptions.filter(s => s.pendingUpgrade).length

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={150} height={20} />
          <Skeleton variant="rounded" width={120} height={32} />
        </div>
        <div className="space-y-2">
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-muted-foreground">Operator Subscriptions</span>
          {pendingCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
              {pendingCount} pending
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-secondary rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Cluster selector */}
      <select
        value={selectedCluster}
        onChange={(e) => setSelectedCluster(e.target.value)}
        className="w-full px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground mb-4"
      >
        <option value="">Select cluster...</option>
        {clusters.map(c => (
          <option key={c.name} value={c.name}>{c.name}</option>
        ))}
      </select>

      {!selectedCluster ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a cluster to view subscriptions
        </div>
      ) : (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            <ClusterBadge cluster={selectedCluster} />
          </div>

          {/* Summary badges */}
          <div className="flex gap-2 mb-4 text-xs">
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 text-green-400">
              <Settings className="w-3 h-3" />
              <span>{autoCount} Auto</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/10 text-blue-400">
              <Clock className="w-3 h-3" />
              <span>{manualCount} Manual</span>
            </div>
            {pendingCount > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500/10 text-orange-400">
                <AlertTriangle className="w-3 h-3" />
                <span>{pendingCount} Pending</span>
              </div>
            )}
          </div>

          {/* Subscriptions list */}
          <div className="flex-1 space-y-2 overflow-y-auto">
            {subscriptions.map((sub, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg ${sub.pendingUpgrade ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-secondary/30'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-foreground font-medium">{sub.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    sub.installPlanApproval === 'Automatic'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {sub.installPlanApproval}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span>Channel: {sub.channel}</span>
                    <span>{sub.namespace}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="truncate">{sub.currentCSV}</span>
                  </div>
                  {sub.pendingUpgrade && (
                    <div className="flex items-center gap-1 text-orange-400 mt-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Upgrade pending: {sub.pendingUpgrade}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            Source: operatorhubio-catalog
          </div>
        </>
      )}
    </div>
  )
}
