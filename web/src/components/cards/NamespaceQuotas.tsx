import { useState, useMemo, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { useModalState } from '../../lib/modals'
import {
  useClusters,
  useResourceQuotas,
  useLimitRanges,
  type ResourceQuota,
  createOrUpdateResourceQuota,
  deleteResourceQuota,
} from '../../hooks/useMCP'
import { useCachedNamespaces } from '../../hooks/useCachedData'
import { Skeleton } from '../ui/Skeleton'
import { StatusBadge } from '../ui/StatusBadge'
import { useCardLoadingState } from './CardDataContext'
import { useDemoMode } from '../../hooks/useDemoMode'
import { CardControlsRow } from '../../lib/cards/CardComponents'
import { useCardData, type SortDirection } from '../../lib/cards/cardHooks'
import { useTranslation } from 'react-i18next'
import { NamespaceQuotasDeleteModal } from './NamespaceQuotasDeleteModal'
import { NamespaceQuotasList } from './NamespaceQuotasList'
import { QuotaModal } from './NamespaceQuotasModal'
import type {
  LimitRangeItem,
  NamespaceQuotasProps,
  QuotaUsage,
  SortByOption,
  TabKey,
} from './NamespaceQuotas.types'
import {
  LIMIT_SORT_COMPARATORS,
  parseQuantity,
  formatResourceName,
  QUOTA_SORT_COMPARATORS,
  SORT_OPTIONS,
} from './NamespaceQuotas.utils'

export function NamespaceQuotas({ config }: NamespaceQuotasProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { isDemoMode } = useDemoMode()
  const { deduplicatedClusters: allClusters, isLoading: clustersLoading, isRefreshing: clustersRefreshing, isFailed: clustersFailed, consecutiveFailures: clustersFailures } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || 'all')
  const [selectedNamespace, setSelectedNamespace] = useState<string>(config?.namespace || 'all')
  const [activeTab, setActiveTab] = useState<TabKey>('quotas')

  // Modal state
  const { isOpen: isModalOpen, open: openModal, close: closeModal } = useModalState()
  const [editingQuota, setEditingQuota] = useState<ResourceQuota | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ cluster: string; namespace: string; name: string } | null>(null)

  // Fetch namespaces for the selected cluster (only when specific cluster selected)
  const { namespaces, isDemoFallback, isRefreshing: namespacesRefreshing } = useCachedNamespaces(selectedCluster !== 'all' ? selectedCluster : undefined)

  // Filter clusters based on global filter (useCardData handles global filtering internally)
  const clusters = allClusters

  // Fetch ResourceQuotas and LimitRanges using real hooks
  // Pass undefined for "all" selections to get all data
  const { resourceQuotas, isLoading: quotasLoading, refetch: refetchQuotas } = useResourceQuotas(
    selectedCluster !== 'all' ? selectedCluster : undefined,
    selectedNamespace !== 'all' ? selectedNamespace : undefined
  )
  const { limitRanges, isLoading: limitsLoading } = useLimitRanges(
    selectedCluster !== 'all' ? selectedCluster : undefined,
    selectedNamespace !== 'all' ? selectedNamespace : undefined
  )

  const isInitialLoading = clustersLoading
  const isFetchingData = quotasLoading || limitsLoading

  // Report loading state to CardWrapper for skeleton/refresh behavior
  useCardLoadingState({
    isLoading: isInitialLoading || isFetchingData,
    isRefreshing: clustersRefreshing || namespacesRefreshing,
    hasAnyData: allClusters.length > 0 || resourceQuotas.length > 0 || limitRanges.length > 0,
    isDemoData: isDemoMode || isDemoFallback,
    isFailed: clustersFailed,
    consecutiveFailures: clustersFailures })

  // Handle save quota
  const handleSaveQuota = async (spec: { cluster: string; namespace: string; name: string; hard: Record<string, string> }) => {
    setIsSaving(true)
    try {
      await createOrUpdateResourceQuota(spec)
      refetchQuotas()
      closeModal()
      setEditingQuota(null)
    } finally {
      setIsSaving(false)
    }
  }

  // Handle delete quota
  const handleDeleteQuota = async (cluster: string, namespace: string, name: string) => {
    setIsSaving(true)
    try {
      await deleteResourceQuota(cluster, namespace, name)
      refetchQuotas()
      setDeleteConfirm(null)
    } finally {
      setIsSaving(false)
    }
  }

  // Open edit modal for a quota
  const openEditModal = useCallback((quota: ResourceQuota) => {
    setEditingQuota(quota)
    openModal()
  }, [openModal])

  // Transform ResourceQuotas to QuotaUsage format for display (pre-filter by selectors only)
  const quotaUsages = useMemo(() => {
    const usages: QuotaUsage[] = []

    // Filter quotas based on selection
    const filteredQuotas = resourceQuotas.filter(q => {
      const clusterMatch = selectedCluster === 'all' || q.cluster === selectedCluster
      const namespaceMatch = selectedNamespace === 'all' || q.namespace === selectedNamespace
      return clusterMatch && namespaceMatch
    })

    filteredQuotas.forEach(quota => {
        // Iterate through all hard limits and create usage items
        Object.keys(quota.hard).forEach(resource => {
          const limitVal = quota.hard[resource]
          const usedVal = quota.used[resource] || '0'
          const limitNum = parseQuantity(limitVal)
          const usedNum = parseQuantity(usedVal)
          const percent = limitNum > 0 ? (usedNum / limitNum) * 100 : 0

          usages.push({
            resource: formatResourceName(resource),
            rawResource: resource,
            used: usedVal,
            limit: limitVal,
            percent,
            cluster: quota.cluster,
            namespace: quota.namespace,
            quotaName: quota.name })
        })
      })

    return usages
  }, [resourceQuotas, selectedCluster, selectedNamespace])

  // Get unique quotas for edit/delete actions
  const uniqueQuotas = useMemo(() => {
    const quotaMap = new Map<string, ResourceQuota>()
    resourceQuotas.forEach(q => {
      const key = `${q.cluster}/${q.namespace}/${q.name}`
      quotaMap.set(key, q)
    })
    return Array.from(quotaMap.values())
  }, [resourceQuotas])

  // Transform LimitRanges for display (pre-filter by selectors only)
  const limitRangeItems = useMemo(() => {
    const items: LimitRangeItem[] = []

    // Filter limit ranges based on selection
    const filteredRanges = limitRanges.filter(lr => {
      const clusterMatch = selectedCluster === 'all' || lr.cluster === selectedCluster
      const namespaceMatch = selectedNamespace === 'all' || lr.namespace === selectedNamespace
      return clusterMatch && namespaceMatch
    })

    filteredRanges.forEach(lr => {
        lr.limits.forEach(limit => {
          items.push({
            name: lr.name,
            type: limit.type,
            limits: limit,
            cluster: lr.cluster,
            namespace: lr.namespace })
        })
      })

    return items
  }, [limitRanges, selectedCluster, selectedNamespace])

  // useCardData for Quotas tab
  const {
    items: paginatedQuotas,
    totalItems: totalQuotas,
    currentPage: quotaCurrentPage,
    totalPages: quotaTotalPages,
    itemsPerPage: quotaItemsPerPage,
    goToPage: quotaGoToPage,
    needsPagination: quotaNeedsPagination,
    setItemsPerPage: quotaSetItemsPerPage,
    filters: quotaFilters,
    sorting: quotaSorting,
    containerRef,
    containerStyle } = useCardData<QuotaUsage, SortByOption>(quotaUsages, {
    filter: {
      searchFields: ['resource', 'rawResource', 'cluster', 'namespace', 'quotaName'] as (keyof QuotaUsage)[],
      clusterField: 'cluster' as keyof QuotaUsage,
      storageKey: 'namespace-quotas' },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc' as SortDirection,
      comparators: QUOTA_SORT_COMPARATORS },
    defaultLimit: 5 })

  // useCardData for Limits tab
  const {
    items: paginatedLimits,
    totalItems: totalLimits,
    currentPage: limitCurrentPage,
    totalPages: limitTotalPages,
    itemsPerPage: limitItemsPerPage,
    goToPage: limitGoToPage,
    needsPagination: limitNeedsPagination } = useCardData<LimitRangeItem, SortByOption>(limitRangeItems, {
    filter: {
      searchFields: ['name', 'type', 'cluster', 'namespace'] as (keyof LimitRangeItem)[],
      clusterField: 'cluster' as keyof LimitRangeItem,
      storageKey: 'namespace-quotas-limits' },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc' as SortDirection,
      comparators: LIMIT_SORT_COMPARATORS },
    defaultLimit: 5 })

  // Derive active tab state
  const activePagination = activeTab === 'quotas'
    ? { items: paginatedQuotas, currentPage: quotaCurrentPage, totalPages: quotaTotalPages, totalItems: totalQuotas, itemsPerPage: quotaItemsPerPage, goToPage: quotaGoToPage, needsPagination: quotaNeedsPagination }
    : { items: paginatedLimits, currentPage: limitCurrentPage, totalPages: limitTotalPages, totalItems: totalLimits, itemsPerPage: limitItemsPerPage, goToPage: limitGoToPage, needsPagination: limitNeedsPagination }

  const tabs = [
    { key: 'quotas' as const, label: 'Quotas', count: totalQuotas },
    { key: 'limits' as const, label: 'Limits', count: totalLimits },
  ]

  if (isInitialLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
          <Skeleton variant="text" width={140} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={32} className="mb-4" />
        <div className="space-y-3">
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
        <div className="flex items-center gap-2">
          <StatusBadge color="yellow">
            {activeTab === 'quotas' ? `${totalQuotas} quotas` : `${totalLimits} limits`}
          </StatusBadge>
        </div>
        <div className="flex items-center gap-2">
          <CardControlsRow
            clusterIndicator={{ selectedCount: quotaFilters.localClusterFilter.length, totalCount: quotaFilters.availableClusters.length }}
            clusterFilter={{
              availableClusters: quotaFilters.availableClusters,
              selectedClusters: quotaFilters.localClusterFilter,
              onToggle: quotaFilters.toggleClusterFilter,
              onClear: quotaFilters.clearClusterFilter,
              isOpen: quotaFilters.showClusterFilter,
              setIsOpen: quotaFilters.setShowClusterFilter,
              containerRef: quotaFilters.clusterFilterRef,
              minClusters: 1,
            }}
            cardControls={{
              limit: quotaItemsPerPage,
              onLimitChange: quotaSetItemsPerPage,
              sortBy: quotaSorting.sortBy,
              sortOptions: SORT_OPTIONS,
              onSortChange: v => quotaSorting.setSortBy(v as SortByOption),
              sortDirection: quotaSorting.sortDirection,
              onSortDirectionChange: quotaSorting.setSortDirection,
            }}
            extra={
              <button
                onClick={() => {
                  setEditingQuota(null)
                  openModal()
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
              >
                <Plus className="w-3 h-3" />
                {t('namespaceQuotas.addQuota')}
              </button>
            }
          />
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <select
          value={selectedCluster}
          onChange={e => {
            setSelectedCluster(e.target.value)
            setSelectedNamespace('all')
          }}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground"
        >
          <option value="all">All Clusters ({clusters.length})</option>
          {clusters.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
        <select value={selectedNamespace} onChange={e => setSelectedNamespace(e.target.value)} className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground">
          <option value="all">{t('namespaceQuotas.allNamespaces')}</option>
          {selectedCluster !== 'all' && namespaces.map(ns => <option key={ns} value={ns}>{ns}</option>)}
        </select>
      </div>

      <NamespaceQuotasList
        searchValue={quotaFilters.search}
        onSearchChange={quotaFilters.setSearch}
        selectedCluster={selectedCluster}
        selectedNamespace={selectedNamespace}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={tabs}
        paginatedQuotas={paginatedQuotas as QuotaUsage[]}
        paginatedLimits={paginatedLimits as LimitRangeItem[]}
        uniqueQuotas={uniqueQuotas}
        isFetchingData={isFetchingData}
        onEditQuota={openEditModal}
        onDeleteQuota={setDeleteConfirm}
        onCreateQuota={() => {
          setEditingQuota(null)
          openModal()
        }}
        activePagination={{
          ...activePagination,
          itemsPerPage: typeof activePagination.itemsPerPage === 'number' ? activePagination.itemsPerPage : activePagination.totalItems,
        }}
        containerRef={containerRef}
        containerStyle={containerStyle}
      />

      <QuotaModal
        isOpen={isModalOpen}
        onClose={() => {
          closeModal()
          setEditingQuota(null)
        }}
        onSave={handleSaveQuota}
        clusters={clusters}
        namespaces={namespaces}
        selectedCluster={selectedCluster}
        selectedNamespace={selectedNamespace}
        editingQuota={editingQuota}
        isLoading={isSaving}
      />

      <NamespaceQuotasDeleteModal
        deleteConfirm={deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onDelete={target => handleDeleteQuota(target.cluster, target.namespace, target.name)}
        isLoading={isSaving}
      />
    </div>
  )
}
