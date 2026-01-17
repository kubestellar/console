import { useState, useMemo } from 'react'
import { Layers, Box, Activity, AlertTriangle, RefreshCw, Server } from 'lucide-react'
import { useClusters, usePodIssues, useDeploymentIssues } from '../../hooks/useMCP'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'

interface NamespaceOverviewProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

export function NamespaceOverview({ config }: NamespaceOverviewProps) {
  const { clusters, isLoading: clustersLoading, refetch } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const [selectedNamespace, setSelectedNamespace] = useState<string>(config?.namespace || '')

  const { issues: allPodIssues } = usePodIssues(selectedCluster)
  const { issues: allDeploymentIssues } = useDeploymentIssues(selectedCluster)

  // Filter by namespace
  const podIssues = useMemo(() => {
    if (!selectedNamespace) return allPodIssues
    return allPodIssues.filter(p => p.namespace === selectedNamespace)
  }, [allPodIssues, selectedNamespace])

  const deploymentIssues = useMemo(() => {
    if (!selectedNamespace) return allDeploymentIssues
    return allDeploymentIssues.filter(d => d.namespace === selectedNamespace)
  }, [allDeploymentIssues, selectedNamespace])

  // Get unique namespaces from issues
  const namespaces = useMemo(() => {
    const nsSet = new Set<string>()
    allPodIssues.forEach(p => p.namespace && nsSet.add(p.namespace))
    allDeploymentIssues.forEach(d => d.namespace && nsSet.add(d.namespace))
    return Array.from(nsSet).sort()
  }, [allPodIssues, allDeploymentIssues])

  const cluster = clusters.find(c => c.name === selectedCluster)

  if (clustersLoading) {
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

  const needsSelection = !selectedCluster || !selectedNamespace

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-muted-foreground">Namespace Overview</span>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-secondary rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Selectors */}
      <div className="flex gap-2 mb-4">
        <select
          value={selectedCluster}
          onChange={(e) => {
            setSelectedCluster(e.target.value)
            setSelectedNamespace('')
          }}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-white"
        >
          <option value="">Select cluster...</option>
          {clusters.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          value={selectedNamespace}
          onChange={(e) => setSelectedNamespace(e.target.value)}
          disabled={!selectedCluster}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-white disabled:opacity-50"
        >
          <option value="">Select namespace...</option>
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
          <div className="flex items-center gap-2 mb-4 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <ClusterBadge cluster={selectedCluster} />
            <span className="text-blue-400">/</span>
            <span className="text-sm font-medium text-blue-300">{selectedNamespace}</span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-2 mb-1">
                <Box className="w-4 h-4 text-green-400" />
                <span className="text-xs text-muted-foreground">Pods with Issues</span>
              </div>
              <span className="text-2xl font-bold text-white">{podIssues.length}</span>
            </div>
            <div className="p-3 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-orange-400" />
                <span className="text-xs text-muted-foreground">Deployment Issues</span>
              </div>
              <span className="text-2xl font-bold text-white">{deploymentIssues.length}</span>
            </div>
          </div>

          {/* Issues list */}
          <div className="flex-1 space-y-2 overflow-y-auto">
            {podIssues.length === 0 && deploymentIssues.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center mb-2">
                  <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm text-white">Namespace Healthy</p>
                <p className="text-xs text-muted-foreground">No issues detected</p>
              </div>
            ) : (
              <>
                {deploymentIssues.slice(0, 3).map((issue, idx) => (
                  <div key={`dep-${idx}`} className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-orange-400" />
                      <span className="text-sm text-white">{issue.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {issue.readyReplicas}/{issue.replicas}
                      </span>
                    </div>
                  </div>
                ))}
                {podIssues.slice(0, 3).map((issue, idx) => (
                  <div key={`pod-${idx}`} className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      <span className="text-sm text-white truncate">{issue.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 ml-auto">
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
