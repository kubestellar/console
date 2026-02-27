import { useState, useMemo, useEffect } from 'react'
import { Users, Key, Lock, ChevronRight, AlertCircle } from 'lucide-react'
import { useClusters, useNamespaces, useK8sRoles, useK8sRoleBindings, useK8sServiceAccounts } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { useCardLoadingState } from './CardDataContext'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useTranslation } from 'react-i18next'

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
type SortTranslationKey = 'common:common.name' | 'cards:namespaceRBAC.rules'

const SORT_OPTIONS_KEYS: ReadonlyArray<{ value: SortByOption; labelKey: SortTranslationKey }> = [
  { value: 'name' as const, labelKey: 'common:common.name' },
  { value: 'rules' as const, labelKey: 'cards:namespaceRBAC.rules' },
]

function NamespaceRBACInternal({ config }: NamespaceRBACProps) {
  const { t } = useTranslation(['cards', 'common'])
  const SORT_OPTIONS = useMemo(() =>
    SORT_OPTIONS_KEYS.map(opt => ({ value: opt.value, label: String(t(opt.labelKey)) })),
    [t]
  )
  const { deduplicatedClusters: clusters, isLoading: clustersLoading, error } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { drillToRBAC } = useDrillDownActions()
  const { isDemoMode: demoMode } = useDemoMode()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const [selectedNamespace, setSelectedNamespace] = useState<string>(config?.namespace || '')
  const [activeTab, setActiveTab] = useState<'roles' | 'bindings' | 'serviceaccounts'>('roles')

  // Fetch namespaces for the selected cluster (requires a cluster to be selected)
  const { namespaces } = useNamespaces(selectedCluster || undefined)

  // Auto-select first cluster and namespace in demo mode
  useEffect(() => {
    if (demoMode && clusters.length > 0 && !selectedCluster) {
      setSelectedCluster(clusters[0].name)
    }
  }, [demoMode, clusters, selectedCluster])

  useEffect(() => {
    if (demoMode && selectedCluster && namespaces.length > 0 && !selectedNamespace) {
      setSelectedNamespace(namespaces[0])
    }
  }, [demoMode, selectedCluster, namespaces, selectedNamespace])

  // Filter clusters based on global filter
  const filteredClusters = useMemo(() => {
    if (isAllClustersSelected) return clusters
    return clusters.filter(c => selectedClusters.includes(c.name))
  }, [clusters, selectedClusters, isAllClustersSelected])

  // Fetch RBAC data using real hooks (requires a cluster to be selected)
  const { roles: k8sRoles, isLoading: rolesLoading } = useK8sRoles(
    selectedCluster || undefined,
    selectedNamespace || undefined
  )
  const { bindings: k8sBindings, isLoading: bindingsLoading } = useK8sRoleBindings(
    selectedCluster || undefined,
    selectedNamespace || undefined
  )
  const { serviceAccounts: k8sServiceAccounts, isLoading: sasLoading } = useK8sServiceAccounts(
    selectedCluster || undefined,
    selectedNamespace || undefined
  )

  // Check if we're loading initial data or fetching RBAC data
  const isInitialLoading = clustersLoading
  const isFetchingRBAC = selectedCluster && selectedNamespace && (rolesLoading || bindingsLoading || sasLoading)

  // Report loading state to CardWrapper for skeleton/refresh behavior
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isInitialLoading || !!isFetchingRBAC,
    hasAnyData: clusters.length > 0 || k8sRoles.length > 0 || k8sBindings.length > 0 || k8sServiceAccounts.length > 0,
  })

  // Transform raw RBAC data into RBACItem arrays (no filtering/sorting — that's handled by useCardData)
  const rbacRoles: RBACItem[] = useMemo(() => {
    if (!selectedCluster || !selectedNamespace) return []
    return k8sRoles
      .filter(r => !r.namespace || r.namespace === selectedNamespace)
      .map(r => ({
        name: r.name,
        type: 'Role' as const,
        rules: r.ruleCount,
        cluster: r.cluster,
      }))
  }, [selectedCluster, selectedNamespace, k8sRoles])

  const rbacBindings: RBACItem[] = useMemo(() => {
    if (!selectedCluster || !selectedNamespace) return []
    return k8sBindings
      .filter(b => !b.namespace || b.namespace === selectedNamespace)
      .map(b => ({
        name: b.name,
        type: 'RoleBinding' as const,
        subjects: b.subjects.map(s => s.name),
        cluster: b.cluster,
      }))
  }, [selectedCluster, selectedNamespace, k8sBindings])

  const rbacServiceAccounts: RBACItem[] = useMemo(() => {
    if (!selectedCluster || !selectedNamespace) return []
    return k8sServiceAccounts
      .filter(sa => sa.namespace === selectedNamespace)
      .map(sa => ({
        name: sa.name,
        type: 'ServiceAccount' as const,
        cluster: sa.cluster,
      }))
  }, [selectedCluster, selectedNamespace, k8sServiceAccounts])

  // Select the active tab's data
  const activeTabItems = activeTab === 'roles'
    ? rbacRoles
    : activeTab === 'bindings'
      ? rbacBindings
      : rbacServiceAccounts

  // Apply useCardData for filtering, sorting, and pagination on the active tab
  const {
    items: paginatedItems,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters,
    sorting,
  } = useCardData<RBACItem, SortByOption>(activeTabItems, {
    filter: {
      searchFields: ['name'] as (keyof RBACItem)[],
      storageKey: 'namespace-rbac',
      customPredicate: (item, query) =>
        (item.subjects || []).some(s => s.toLowerCase().includes(query)),
    },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: {
        name: commonComparators.string<RBACItem>('name'),
        rules: commonComparators.number<RBACItem>('rules'),
      },
    },
    defaultLimit: 5,
  })

  const tabs = [
    { key: 'roles' as const, label: t('namespaceRBAC.roles'), icon: Key, count: rbacRoles.length },
    { key: 'bindings' as const, label: t('namespaceRBAC.bindings'), icon: Lock, count: rbacBindings.length },
    { key: 'serviceaccounts' as const, label: t('namespaceRBAC.serviceAccounts'), icon: Users, count: rbacServiceAccounts.length },
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

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">{t('namespaceRBAC.noData')}</p>
        <p className="text-xs mt-1">{t('namespaceRBAC.noDataHint')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
            {activeTab === 'roles' ? t('namespaceRBAC.nRoles', { count: rbacRoles.length }) : activeTab === 'bindings' ? t('namespaceRBAC.nBindings', { count: rbacBindings.length }) : t('namespaceRBAC.nServiceAccounts', { count: rbacServiceAccounts.length })}
          </span>
        </div>
        <CardControlsRow
          clusterIndicator={{
            selectedCount: filters.localClusterFilter.length,
            totalCount: filters.availableClusters.length,
          }}
          clusterFilter={{
            availableClusters: filters.availableClusters,
            selectedClusters: filters.localClusterFilter,
            onToggle: filters.toggleClusterFilter,
            onClear: filters.clearClusterFilter,
            isOpen: filters.showClusterFilter,
            setIsOpen: filters.setShowClusterFilter,
            containerRef: filters.clusterFilterRef,
          }}
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy: sorting.sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => sorting.setSortBy(v as SortByOption),
            sortDirection: sorting.sortDirection,
            onSortDirectionChange: sorting.setSortDirection,
          }}
          className="mb-0"
        />
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
          <option value="">{t('namespaceRBAC.selectCluster')}</option>
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
          <option value="">{t('namespaceRBAC.selectNamespace')}</option>
          {namespaces.map(ns => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
        </select>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2 mb-3">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-medium text-red-400">{t('namespaceRBAC.errorLoading')}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {!selectedCluster || !selectedNamespace ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          {!selectedCluster ? t('namespaceRBAC.selectClusterPrompt') : t('namespaceRBAC.selectNamespacePrompt')}
        </div>
      ) : (
        <>
          {/* Local Search */}
          <CardSearchInput
            value={filters.search}
            onChange={filters.setSearch}
            placeholder={t('namespaceRBAC.searchRBAC')}
            className="mb-4"
          />

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
                {t('namespaceRBAC.noneFound', { type: activeTab })}
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
                      {t('namespaceRBAC.nRulesCount', { count: item.rules })}
                    </p>
                  )}
                  {item.subjects && (
                    <p className="text-xs text-muted-foreground mt-1 ml-6">
                      {t('namespaceRBAC.subjects')}: {item.subjects.join(', ')}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          <CardPaginationFooter
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
            onPageChange={goToPage}
            needsPagination={needsPagination}
          />

          {/* Summary */}
          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('namespaceRBAC.nRoles', { count: rbacRoles.length })}</span>
            <span>{t('namespaceRBAC.nBindings', { count: rbacBindings.length })}</span>
            <span>{t('namespaceRBAC.nServiceAccounts', { count: rbacServiceAccounts.length })}</span>
          </div>
        </>
      )}
    </div>
  )
}

export function NamespaceRBAC(props: NamespaceRBACProps) {
  return (
    <DynamicCardErrorBoundary cardId="NamespaceRBAC">
      <NamespaceRBACInternal {...props} />
    </DynamicCardErrorBoundary>
  )
}
