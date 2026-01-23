import { useState, useMemo } from 'react'
import { Shield, Users, Key, Lock, ChevronRight, Loader2, Search } from 'lucide-react'
import { useClusters, useNamespaces, useK8sRoles, useK8sRoleBindings, useK8sServiceAccounts } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'

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

type SortByOption = 'name' | 'rules'

const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'rules' as const, label: 'Rules' },
]

export function NamespaceRBAC({ config }: NamespaceRBACProps) {
  const { clusters, isLoading: clustersLoading, isRefreshing: clustersRefreshing, refetch: refetchClusters, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { drillToRBAC } = useDrillDownActions()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const [selectedNamespace, setSelectedNamespace] = useState<string>(config?.namespace || '')
  const [activeTab, setActiveTab] = useState<'roles' | 'bindings' | 'serviceaccounts'>('roles')
  const [sortBy, setSortBy] = useState<SortByOption>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [localSearch, setLocalSearch] = useState('')

  // Fetch namespaces for the selected cluster (requires a cluster to be selected)
  const { namespaces } = useNamespaces(selectedCluster || undefined)

  // Filter clusters based on global filter
  const filteredClusters = useMemo(() => {
    if (isAllClustersSelected) return clusters
    return clusters.filter(c => selectedClusters.includes(c.name))
  }, [clusters, selectedClusters, isAllClustersSelected])

  // Fetch RBAC data using real hooks (requires a cluster to be selected)
  const { roles: k8sRoles, isLoading: rolesLoading, refetch: refetchRoles } = useK8sRoles(
    selectedCluster || undefined,
    selectedNamespace || undefined
  )
  const { bindings: k8sBindings, isLoading: bindingsLoading, refetch: refetchBindings } = useK8sRoleBindings(
    selectedCluster || undefined,
    selectedNamespace || undefined
  )
  const { serviceAccounts: k8sServiceAccounts, isLoading: sasLoading, refetch: refetchSAs } = useK8sServiceAccounts(
    selectedCluster || undefined,
    selectedNamespace || undefined
  )

  // Check if we're loading initial data or fetching RBAC data
  const isInitialLoading = clustersLoading
  const isFetchingRBAC = selectedCluster && selectedNamespace && (rolesLoading || bindingsLoading || sasLoading)
  const isLoading = isInitialLoading
  const showSkeleton = isLoading && clusters.length === 0

  const refetch = () => {
    refetchClusters()
    if (selectedCluster) {
      refetchRoles()
      refetchBindings()
      refetchSAs()
    }
  }

  // Transform RBAC data to the display format
  const rbacData = useMemo(() => {
    if (!selectedCluster || !selectedNamespace) {
      return { roles: [], bindings: [], serviceaccounts: [] }
    }

    // Sort function
    const sortItems = (items: RBACItem[]) => {
      return [...items].sort((a, b) => {
        let compare = 0
        switch (sortBy) {
          case 'name':
            compare = a.name.localeCompare(b.name)
            break
          case 'rules':
            compare = (a.rules || 0) - (b.rules || 0)
            break
        }
        return sortDirection === 'asc' ? compare : -compare
      })
    }

    // Filter function for local search
    const filterItems = (items: RBACItem[]) => {
      if (!localSearch.trim()) return items
      const query = localSearch.toLowerCase()
      return items.filter(item =>
        item.name.toLowerCase().includes(query) ||
        (item.subjects || []).some(s => s.toLowerCase().includes(query))
      )
    }

    // Transform roles to RBACItem format
    const roles: RBACItem[] = sortItems(filterItems(k8sRoles
      .filter(r => !r.namespace || r.namespace === selectedNamespace)
      .map(r => ({
        name: r.name,
        type: 'Role' as const,
        rules: r.ruleCount,
        cluster: r.cluster,
      }))))

    // Transform bindings to RBACItem format
    const bindings: RBACItem[] = sortItems(filterItems(k8sBindings
      .filter(b => !b.namespace || b.namespace === selectedNamespace)
      .map(b => ({
        name: b.name,
        type: 'RoleBinding' as const,
        subjects: b.subjects.map(s => s.name),
        cluster: b.cluster,
      }))))

    // Transform service accounts to RBACItem format
    const serviceaccounts: RBACItem[] = sortItems(filterItems(k8sServiceAccounts
      .filter(sa => sa.namespace === selectedNamespace)
      .map(sa => ({
        name: sa.name,
        type: 'ServiceAccount' as const,
        cluster: sa.cluster,
      }))))

    return { roles, bindings, serviceaccounts }
  }, [selectedCluster, selectedNamespace, k8sRoles, k8sBindings, k8sServiceAccounts, sortBy, sortDirection, localSearch])

  // Pagination for current tab
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: paginatedItems,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(rbacData[activeTab], effectivePerPage)

  const tabs = [
    { key: 'roles' as const, label: 'Roles', icon: Key, count: rbacData.roles.length },
    { key: 'bindings' as const, label: 'Bindings', icon: Lock, count: rbacData.bindings.length },
    { key: 'serviceaccounts' as const, label: 'SAs', icon: Users, count: rbacData.serviceaccounts.length },
  ]

  if (showSkeleton) {
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
          {isFetchingRBAC && (
            <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <CardControls
            limit={limit}
            onLimitChange={setLimit}
            sortBy={sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
          />
          <RefreshButton
            isRefreshing={clustersRefreshing || !!isFetchingRBAC}
            isFailed={isFailed}
            consecutiveFailures={consecutiveFailures}
            lastRefresh={lastRefresh}
            onRefresh={refetch}
            size="sm"
          />
        </div>
      </div>

      {/* Selectors */}
      <div className="flex gap-2 mb-4">
        <select
          value={selectedCluster}
          onChange={(e) => {
            setSelectedCluster(e.target.value)
            setSelectedNamespace('') // Reset namespace when cluster changes
          }}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground"
        >
          <option value="">Select cluster...</option>
          {filteredClusters.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          value={selectedNamespace}
          onChange={(e) => setSelectedNamespace(e.target.value)}
          disabled={!selectedCluster}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground disabled:opacity-50"
        >
          <option value="">Select namespace...</option>
          {namespaces.map(ns => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
        </select>
      </div>

      {!selectedCluster || !selectedNamespace ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          {!selectedCluster ? 'Select a cluster to view RBAC' : 'Select a namespace to view RBAC'}
        </div>
      ) : (
        <>
          {/* Local Search */}
          <div className="relative mb-4">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search RBAC..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            />
          </div>

          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            <ClusterBadge cluster={selectedCluster} />
            <span className="text-muted-foreground">/</span>
            <span className="text-sm text-foreground">{selectedNamespace}</span>
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
                    : 'text-muted-foreground hover:text-foreground'
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
            {isFetchingRBAC && paginatedItems.length === 0 ? (
              // Show skeletons when loading and no data
              <>
                <Skeleton variant="rounded" height={50} />
                <Skeleton variant="rounded" height={50} />
                <Skeleton variant="rounded" height={50} />
                <Skeleton variant="rounded" height={50} />
                <Skeleton variant="rounded" height={50} />
              </>
            ) : paginatedItems.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm py-8">
                No {activeTab} found
              </div>
            ) : (
              paginatedItems.map((item, idx) => (
                <div
                  key={`${item.cluster}-${item.name}-${idx}`}
                  onClick={() => drillToRBAC(selectedCluster, selectedNamespace, item.name, {
                    type: item.type,
                    rules: item.rules,
                    subjects: item.subjects,
                  })}
                  className={`p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors group ${isFetchingRBAC ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {activeTab === 'roles' && <Key className="w-4 h-4 text-yellow-400" />}
                      {activeTab === 'bindings' && <Lock className="w-4 h-4 text-green-400" />}
                      {activeTab === 'serviceaccounts' && <Users className="w-4 h-4 text-blue-400" />}
                      <span className="text-sm text-foreground group-hover:text-purple-400">{item.name}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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
              ))
            )}
          </div>

          {/* Pagination */}
          {needsPagination && limit !== 'unlimited' && (
            <div className="pt-2 border-t border-border/50 mt-2">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                itemsPerPage={perPage}
                onPageChange={goToPage}
                showItemsPerPage={false}
              />
            </div>
          )}

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
