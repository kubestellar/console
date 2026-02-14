import { useState, useMemo, useEffect } from 'react'
import { Layers, Box, Activity, AlertTriangle, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useClusters, useNamespaces } from '../../hooks/useMCP'
import { useCachedPodIssues, useCachedDeploymentIssues } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useCardLoadingState } from './CardDataContext'
import { useDemoMode } from '../../hooks/useDemoMode'

interface NamespaceOverviewProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

export function NamespaceOverview({ config }: NamespaceOverviewProps) {
  const { t } = useTranslation('common')
  const { deduplicatedClusters: allClusters, isLoading: clustersLoading } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const [selectedNamespace, setSelectedNamespace] = useState<string>(config?.namespace || '')
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()
  const { drillToPod, drillToDeployment } = useDrillDownActions()

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

  const { isDemoMode: demoMode } = useDemoMode()

  // Auto-select first cluster and namespace in demo mode
  useEffect(() => {
    if (demoMode && !selectedCluster && clusters.length > 0) {
      setSelectedCluster(clusters[0].name)
    }
  }, [demoMode, clusters, selectedCluster])

  const { issues: allPodIssues } = useCachedPodIssues(selectedCluster)
  const { issues: allDeploymentIssues } = useCachedDeploymentIssues(selectedCluster)

  // Fetch namespaces for the selected cluster
  const { namespaces } = useNamespaces(selectedCluster || undefined)

  // Auto-select first namespace in demo mode once namespaces load
  useEffect(() => {
    if (demoMode && selectedCluster && !selectedNamespace && namespaces.length > 0) {
      setSelectedNamespace(namespaces[0])
    }
  }, [demoMode, selectedCluster, selectedNamespace, namespaces])

  // Filter by namespace
  const podIssues = useMemo(() => {
    if (!selectedNamespace) return allPodIssues
    return allPodIssues.filter(p => p.namespace === selectedNamespace)
  }, [allPodIssues, selectedNamespace])

  const deploymentIssues = useMemo(() => {
    if (!selectedNamespace) return allDeploymentIssues
    return allDeploymentIssues.filter(d => d.namespace === selectedNamespace)
  }, [allDeploymentIssues, selectedNamespace])

  const cluster = clusters.find(c => c.name === selectedCluster)

  // Report state to CardWrapper for refresh animation
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: clustersLoading,
    hasAnyData: allClusters.length > 0,
  })

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={150} height={20} />
          <Skeleton variant="rounded" width={200} height={32} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton variant="rounded" height={80} />
          <Skeleton variant="rounded" height={80} />
        </div>
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">No namespaces</p>
        <p className="text-xs mt-1">Connect to clusters to see namespaces</p>
      </div>
    )
  }

  const needsSelection = !selectedCluster || !selectedNamespace

  return (
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-end mb-4">
      </div>

      {/* Selectors */}
      <div className="flex gap-2 mb-4">
        <select
          value={selectedCluster}
          onChange={(e) => {
            setSelectedCluster(e.target.value)
            setSelectedNamespace('')
          }}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground"
          title="Select a cluster to view namespace details"
        >
          <option value="">{t('selectors.selectCluster')}</option>
          {clusters.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          value={selectedNamespace}
          onChange={(e) => setSelectedNamespace(e.target.value)}
          disabled={!selectedCluster}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground disabled:opacity-50"
          title={selectedCluster ? "Select a namespace to view details" : "Select a cluster first"}
        >
          <option value="">{t('selectors.selectNamespace')}</option>
          {namespaces.map(ns => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
        </select>
      </div>

      {needsSelection ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a cluster and namespace to view details
        </div>
      ) : (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 cursor-default min-w-0 overflow-hidden" title={`Viewing namespace ${selectedNamespace} in cluster ${selectedCluster}`}>
            <div className="shrink-0"><ClusterBadge cluster={selectedCluster} /></div>
            <span className="text-blue-400 shrink-0">/</span>
            <span className="text-sm font-medium text-blue-300 truncate min-w-0">{selectedNamespace}</span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div
              className={`p-3 rounded-lg ${podIssues.length > 0 ? 'bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20' : 'bg-secondary/30 cursor-default'} transition-colors`}
              onClick={() => podIssues.length > 0 && podIssues[0] && drillToPod(selectedCluster, podIssues[0].namespace, podIssues[0].name)}
              title={podIssues.length > 0 ? `${podIssues.length} pod issue${podIssues.length !== 1 ? 's' : ''} - Click to view first issue` : 'No pod issues detected'}
            >
              <div className="flex items-center gap-2 mb-1">
                <Box className={`w-4 h-4 ${podIssues.length > 0 ? 'text-red-400' : 'text-green-400'}`} />
                <span className="text-xs text-muted-foreground">Pods with Issues</span>
              </div>
              <span className="text-2xl font-bold text-foreground">{podIssues.length}</span>
            </div>
            <div
              className={`p-3 rounded-lg ${deploymentIssues.length > 0 ? 'bg-orange-500/10 border border-orange-500/20 cursor-pointer hover:bg-orange-500/20' : 'bg-secondary/30 cursor-default'} transition-colors`}
              onClick={() => deploymentIssues.length > 0 && deploymentIssues[0] && drillToDeployment(selectedCluster, deploymentIssues[0].namespace, deploymentIssues[0].name)}
              title={deploymentIssues.length > 0 ? `${deploymentIssues.length} deployment issue${deploymentIssues.length !== 1 ? 's' : ''} - Click to view first issue` : 'No deployment issues detected'}
            >
              <div className="flex items-center gap-2 mb-1">
                <Activity className={`w-4 h-4 ${deploymentIssues.length > 0 ? 'text-orange-400' : 'text-green-400'}`} />
                <span className="text-xs text-muted-foreground">Deployment Issues</span>
              </div>
              <span className="text-2xl font-bold text-foreground">{deploymentIssues.length}</span>
            </div>
          </div>

          {/* Issues list */}
          <div className="flex-1 space-y-2 overflow-y-auto">
            {podIssues.length === 0 && deploymentIssues.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center" title="All pods and deployments in this namespace are healthy">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center mb-2">
                  <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm text-foreground">Namespace Healthy</p>
                <p className="text-xs text-muted-foreground">No issues detected</p>
              </div>
            ) : (
              <>
                {deploymentIssues.slice(0, 3).map((issue, idx) => (
                  <div
                    key={`dep-${idx}`}
                    className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 cursor-pointer hover:bg-orange-500/20 transition-colors"
                    onClick={() => drillToDeployment(selectedCluster, issue.namespace, issue.name)}
                    title={`${issue.name}: ${issue.readyReplicas}/${issue.replicas} replicas ready - Click to view details`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
                      <span className="text-sm text-foreground truncate">{issue.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">
                        {issue.readyReplicas}/{issue.replicas}
                      </span>
                    </div>
                  </div>
                ))}
                {podIssues.slice(0, 3).map((issue, idx) => (
                  <div
                    key={`pod-${idx}`}
                    className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
                    onClick={() => drillToPod(selectedCluster, issue.namespace, issue.name)}
                    title={`Pod ${issue.name} in ${issue.status} state - Click to view details`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      <span className="text-sm text-foreground truncate min-w-0 flex-1">{issue.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 shrink-0">
                        {issue.status}
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
            <Server className="w-3 h-3" />
            <span>{cluster?.name}</span>
            <span className="text-border">|</span>
            <Layers className="w-3 h-3" />
            <span>{selectedNamespace}</span>
          </div>
        </>
      )}
    </div>
  )
}
