import { useState, useMemo } from 'react'
import { Shield, Users, Key, Lock, RefreshCw, ChevronRight } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'

interface NamespaceRBACProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

interface RBACItem {
  name: string
  type: 'Role' | 'RoleBinding' | 'ServiceAccount'
  subjects?: string[]
  rules?: number
  cluster?: string
}

// Mock RBAC data per cluster
function getMockRBACData(cluster: string, _namespace: string): Record<string, RBACItem[]> {
  // Generate slightly different data per cluster to show aggregation works
  const suffix = cluster.includes('prod') ? '-prod' : cluster.includes('dev') ? '-dev' : ''
  return {
    roles: [
      { name: `admin${suffix}`, type: 'Role', rules: 12, cluster },
      { name: `edit${suffix}`, type: 'Role', rules: 8, cluster },
      { name: `view${suffix}`, type: 'Role', rules: 4, cluster },
      { name: `pod-reader${suffix}`, type: 'Role', rules: 2, cluster },
    ],
    bindings: [
      { name: `admin-binding${suffix}`, type: 'RoleBinding', subjects: ['admin-user', 'ops-team'], cluster },
      { name: `developer-binding${suffix}`, type: 'RoleBinding', subjects: ['dev-team'], cluster },
      { name: `readonly-binding${suffix}`, type: 'RoleBinding', subjects: ['viewer'], cluster },
    ],
    serviceaccounts: [
      { name: 'default', type: 'ServiceAccount', cluster },
      { name: `deployer${suffix}`, type: 'ServiceAccount', cluster },
      { name: 'monitoring', type: 'ServiceAccount', cluster },
    ],
  }
}

export function NamespaceRBAC({ config }: NamespaceRBACProps) {
  const { clusters, isLoading, refetch } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || 'all')
  const [selectedNamespace, setSelectedNamespace] = useState<string>(config?.namespace || 'default')
  const [activeTab, setActiveTab] = useState<'roles' | 'bindings' | 'serviceaccounts'>('roles')

  const namespaces = ['default', 'kube-system', 'monitoring', 'production', 'staging']

  // Filter clusters based on global filter
  const filteredClusters = useMemo(() => {
    if (isAllClustersSelected) return clusters
    return clusters.filter(c => selectedClusters.includes(c.name))
  }, [clusters, selectedClusters, isAllClustersSelected])

  // Aggregate RBAC data across clusters
  const rbacData = useMemo(() => {
    if (!selectedNamespace) {
      return { roles: [], bindings: [], serviceaccounts: [] }
    }

    const targetClusters = selectedCluster === 'all'
      ? filteredClusters
      : filteredClusters.filter(c => c.name === selectedCluster)

    if (targetClusters.length === 0) {
      return { roles: [], bindings: [], serviceaccounts: [] }
    }

    // Aggregate data from all target clusters
    const aggregated: Record<string, RBACItem[]> = {
      roles: [],
      bindings: [],
      serviceaccounts: [],
    }

    targetClusters.forEach(cluster => {
      const clusterData = getMockRBACData(cluster.name, selectedNamespace)
      aggregated.roles.push(...clusterData.roles)
      aggregated.bindings.push(...clusterData.bindings)
      aggregated.serviceaccounts.push(...clusterData.serviceaccounts)
    })

    return aggregated
  }, [selectedCluster, selectedNamespace, filteredClusters])

  const tabs = [
    { key: 'roles' as const, label: 'Roles', icon: Key, count: rbacData.roles.length },
    { key: 'bindings' as const, label: 'Bindings', icon: Lock, count: rbacData.bindings.length },
    { key: 'serviceaccounts' as const, label: 'SAs', icon: Users, count: rbacData.serviceaccounts.length },
  ]

  const showClusterBadge = selectedCluster === 'all' && filteredClusters.length > 1

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={130} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={32} className="mb-4" />
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
          <Shield className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-muted-foreground">Namespace RBAC</span>
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
          onChange={(e) => setSelectedCluster(e.target.value)}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-white"
        >
          <option value="all">All Clusters ({filteredClusters.length})</option>
          {filteredClusters.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          value={selectedNamespace}
          onChange={(e) => setSelectedNamespace(e.target.value)}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-white"
        >
          <option value="">Select namespace...</option>
          {namespaces.map(ns => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
        </select>
      </div>

      {!selectedNamespace ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a namespace to view RBAC
        </div>
      ) : (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            {selectedCluster === 'all' ? (
              <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">
                All Clusters
              </span>
            ) : (
              <ClusterBadge cluster={selectedCluster} />
            )}
            <span className="text-muted-foreground">/</span>
            <span className="text-sm text-white">{selectedNamespace}</span>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 p-1 rounded-lg bg-secondary/30">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs transition-colors ${
                  activeTab === tab.key
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'text-muted-foreground hover:text-white'
                }`}
              >
                <tab.icon className="w-3 h-3" />
                <span>{tab.label}</span>
                <span className="text-xs opacity-60">({tab.count})</span>
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 space-y-2 overflow-y-auto">
            {rbacData[activeTab].map((item, idx) => (
              <div
                key={`${item.cluster}-${item.name}-${idx}`}
                className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {activeTab === 'roles' && <Key className="w-4 h-4 text-yellow-400" />}
                    {activeTab === 'bindings' && <Lock className="w-4 h-4 text-green-400" />}
                    {activeTab === 'serviceaccounts' && <Users className="w-4 h-4 text-blue-400" />}
                    <span className="text-sm text-white">{item.name}</span>
                    {showClusterBadge && item.cluster && (
                      <ClusterBadge cluster={item.cluster} size="sm" />
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
                {item.rules && (
                  <p className="text-xs text-muted-foreground mt-1 ml-6">
                    {item.rules} rules
                  </p>
                )}
                {item.subjects && (
                  <p className="text-xs text-muted-foreground mt-1 ml-6">
                    Subjects: {item.subjects.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
            <span>{rbacData.roles.length} Roles</span>
            <span>{rbacData.bindings.length} Bindings</span>
            <span>{rbacData.serviceaccounts.length} ServiceAccounts</span>
          </div>
        </>
      )}
    </div>
  )
}
