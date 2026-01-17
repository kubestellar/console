import { useState, useMemo } from 'react'
import { FileCode, CheckCircle, AlertTriangle, XCircle, RefreshCw, Database } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'

interface CRDHealthProps {
  config?: {
    cluster?: string
  }
}

interface CRD {
  name: string
  group: string
  version: string
  scope: 'Namespaced' | 'Cluster'
  status: 'Established' | 'NotEstablished' | 'Terminating'
  instances: number
}

export function CRDHealth({ config }: CRDHealthProps) {
  const { clusters, isLoading, refetch } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const [filterGroup, setFilterGroup] = useState<string>('')

  // Mock CRD data
  const allCRDs: CRD[] = selectedCluster ? [
    { name: 'certificates', group: 'cert-manager.io', version: 'v1', scope: 'Namespaced', status: 'Established', instances: 45 },
    { name: 'clusterissuers', group: 'cert-manager.io', version: 'v1', scope: 'Cluster', status: 'Established', instances: 2 },
    { name: 'issuers', group: 'cert-manager.io', version: 'v1', scope: 'Namespaced', status: 'Established', instances: 8 },
    { name: 'prometheuses', group: 'monitoring.coreos.com', version: 'v1', scope: 'Namespaced', status: 'Established', instances: 3 },
    { name: 'servicemonitors', group: 'monitoring.coreos.com', version: 'v1', scope: 'Namespaced', status: 'Established', instances: 127 },
    { name: 'alertmanagers', group: 'monitoring.coreos.com', version: 'v1', scope: 'Namespaced', status: 'Established', instances: 2 },
    { name: 'kafkas', group: 'kafka.strimzi.io', version: 'v1beta2', scope: 'Namespaced', status: 'Established', instances: 4 },
    { name: 'kafkatopics', group: 'kafka.strimzi.io', version: 'v1beta2', scope: 'Namespaced', status: 'NotEstablished', instances: 0 },
    { name: 'applications', group: 'argoproj.io', version: 'v1alpha1', scope: 'Namespaced', status: 'Established', instances: 56 },
    { name: 'appprojects', group: 'argoproj.io', version: 'v1alpha1', scope: 'Namespaced', status: 'Established', instances: 5 },
  ] : []

  // Get unique groups
  const groups = useMemo(() => {
    const groupSet = new Set(allCRDs.map(c => c.group))
    return Array.from(groupSet).sort()
  }, [allCRDs])

  // Filter CRDs
  const crds = useMemo(() => {
    if (!filterGroup) return allCRDs
    return allCRDs.filter(c => c.group === filterGroup)
  }, [allCRDs, filterGroup])

  const getStatusIcon = (status: CRD['status']) => {
    switch (status) {
      case 'Established': return CheckCircle
      case 'NotEstablished': return XCircle
      case 'Terminating': return AlertTriangle
    }
  }

  const getStatusColor = (status: CRD['status']) => {
    switch (status) {
      case 'Established': return 'green'
      case 'NotEstablished': return 'red'
      case 'Terminating': return 'orange'
    }
  }

  const healthyCRDs = crds.filter(c => c.status === 'Established').length
  const unhealthyCRDs = crds.filter(c => c.status !== 'Established').length
  const totalInstances = crds.reduce((sum, c) => sum + c.instances, 0)

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={110} height={20} />
          <Skeleton variant="rounded" width={120} height={32} />
        </div>
        <div className="space-y-2">
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" height={40} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-teal-400" />
          <span className="text-sm font-medium text-muted-foreground">CRD Health</span>
          {unhealthyCRDs > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
              {unhealthyCRDs} issues
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
        className="w-full px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-white mb-4"
      >
        <option value="">Select cluster...</option>
        {clusters.map(c => (
          <option key={c.name} value={c.name}>{c.name}</option>
        ))}
      </select>

      {!selectedCluster ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a cluster to view CRDs
        </div>
      ) : (
        <>
          {/* Scope badge and filter */}
          <div className="flex items-center gap-2 mb-4">
            <ClusterBadge cluster={selectedCluster} />
            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="ml-auto px-2 py-1 rounded bg-secondary border border-border text-xs text-white"
            >
              <option value="">All groups</option>
              {groups.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="p-2 rounded-lg bg-teal-500/10 text-center">
              <span className="text-lg font-bold text-teal-400">{crds.length}</span>
              <p className="text-xs text-muted-foreground">CRDs</p>
            </div>
            <div className="p-2 rounded-lg bg-green-500/10 text-center">
              <span className="text-lg font-bold text-green-400">{healthyCRDs}</span>
              <p className="text-xs text-muted-foreground">Healthy</p>
            </div>
            <div className="p-2 rounded-lg bg-blue-500/10 text-center">
              <span className="text-lg font-bold text-blue-400">{totalInstances}</span>
              <p className="text-xs text-muted-foreground">Instances</p>
            </div>
          </div>

          {/* CRDs list */}
          <div className="flex-1 space-y-2 overflow-y-auto">
            {crds.map((crd, idx) => {
              const StatusIcon = getStatusIcon(crd.status)
              const color = getStatusColor(crd.status)

              return (
                <div
                  key={idx}
                  className="p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`w-4 h-4 text-${color}-400`} />
                      <span className="text-sm text-white">{crd.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Database className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{crd.instances}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1 ml-6 text-xs text-muted-foreground">
                    <span className="truncate">{crd.group}</span>
                    <span className="text-border">|</span>
                    <span>{crd.version}</span>
                    <span className="text-border">|</span>
                    <span>{crd.scope}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            {groups.length} API groups registered
          </div>
        </>
      )}
    </div>
  )
}
