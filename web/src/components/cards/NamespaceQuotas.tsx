import { useState, useMemo } from 'react'
import { Gauge, Cpu, HardDrive, Box, Loader2, ChevronRight, Plus, Pencil, Trash2, Zap } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import {
  useClusters,
  useNamespaces,
  useResourceQuotas,
  useLimitRanges,
  LimitRange,
  ResourceQuota,
  createOrUpdateResourceQuota,
  deleteResourceQuota,
  COMMON_RESOURCE_TYPES,
  GPU_RESOURCE_TYPES,
} from '../../hooks/useMCP'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useCardLoadingState } from './CardDataContext'
import {
  useCardData,
  commonComparators,
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter,
  type SortDirection,
} from '../../lib/cards'
import { useTranslation } from 'react-i18next'

interface NamespaceQuotasProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

interface QuotaUsage {
  resource: string
  rawResource: string // Original k8s resource name
  used: string
  limit: string
  percent: number
  cluster?: string
  namespace?: string
  quotaName?: string // The name of the ResourceQuota this came from
}

interface LimitRangeItem {
  name: string
  type: string
  limits: LimitRange['limits'][0]
  cluster?: string
  namespace?: string
}

type TabKey = 'quotas' | 'limits'
type SortByOption = 'name' | 'percent'

const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'percent' as const, label: 'Usage' },
]

const QUOTA_SORT_COMPARATORS: Record<SortByOption, (a: QuotaUsage, b: QuotaUsage) => number> = {
  name: commonComparators.string<QuotaUsage>('resource'),
  percent: commonComparators.number<QuotaUsage>('percent'),
}

const LIMIT_SORT_COMPARATORS: Record<SortByOption, (a: LimitRangeItem, b: LimitRangeItem) => number> = {
  name: commonComparators.string<LimitRangeItem>('name'),
  // For limits, sort by name for both options (no percent on limits)
  percent: commonComparators.string<LimitRangeItem>('name'),
}

// Parse quantity string to numeric value (handles Kubernetes resource quantities)
function parseQuantity(value: string): number {
  if (!value) return 0
  const num = parseFloat(value)
  if (value.endsWith('Gi')) return num * 1024 * 1024 * 1024
  if (value.endsWith('Mi')) return num * 1024 * 1024
  if (value.endsWith('Ki')) return num * 1024
  if (value.endsWith('G')) return num * 1000000000
  if (value.endsWith('M')) return num * 1000000
  if (value.endsWith('K')) return num * 1000
  if (value.endsWith('m')) return num / 1000 // millicores
  return num
}

// Modal for creating/editing ResourceQuotas
function QuotaModal({
  isOpen,
  onClose,
  onSave,
  clusters,
  namespaces,
  selectedCluster,
  selectedNamespace,
  editingQuota,
  isLoading,
}: {
  isOpen: boolean
  onClose: () => void
  onSave: (spec: { cluster: string; namespace: string; name: string; hard: Record<string, string> }) => Promise<void>
  clusters: Array<{ name: string }>
  namespaces: string[]
  selectedCluster: string
  selectedNamespace: string
  editingQuota?: ResourceQuota | null
  isLoading: boolean
}) {
  const { t } = useTranslation(['cards', 'common'])
  const [cluster, setCluster] = useState(editingQuota?.cluster || (selectedCluster !== 'all' ? selectedCluster : ''))
  const [namespace, setNamespace] = useState(editingQuota?.namespace || (selectedNamespace !== 'all' ? selectedNamespace : ''))
  const [name, setName] = useState(editingQuota?.name || '')
  const [resources, setResources] = useState<Array<{ key: string; value: string }>>(
    editingQuota
      ? Object.entries(editingQuota.hard).map(([key, value]) => ({ key, value }))
      : [{ key: 'limits.nvidia.com/gpu', value: '4' }]
  )
  const [showGpuPresets, setShowGpuPresets] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { namespaces: clusterNamespaces } = useNamespaces(cluster || undefined)
  const availableNamespaces = cluster ? clusterNamespaces : namespaces

  const addResource = () => {
    setResources([...resources, { key: '', value: '' }])
  }

  const removeResource = (index: number) => {
    setResources(resources.filter((_, i) => i !== index))
  }

  const updateResource = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...resources]
    updated[index][field] = value
    setResources(updated)
  }

  const addGpuPreset = (resourceKey: string) => {
    if (!resources.some(r => r.key === resourceKey)) {
      setResources([...resources, { key: resourceKey, value: '4' }])
    }
    setShowGpuPresets(false)
  }

  const handleSave = async () => {
    setError(null)
    if (!cluster || !namespace || !name) {
      setError('Cluster, namespace, and name are required')
      return
    }
    const validResources = resources.filter(r => r.key && r.value)
    if (validResources.length === 0) {
      setError('At least one resource limit is required')
      return
    }
    const hard: Record<string, string> = {}
    validResources.forEach(r => {
      hard[r.key] = r.value
    })
    try {
      await onSave({ cluster, namespace, name, hard })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save quota')
    }
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md">
      <BaseModal.Header
        title={editingQuota ? t('namespaceQuotas.editQuota') : t('namespaceQuotas.createQuota')}
        icon={Gauge}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[60vh]">
        <div className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Cluster selector */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('common:common.cluster')}</label>
            <select
              value={cluster}
              onChange={(e) => {
                setCluster(e.target.value)
                setNamespace('')
              }}
              disabled={!!editingQuota}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground disabled:opacity-50"
            >
              <option value="">{t('common:selectors.selectCluster')}</option>
              {clusters.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Namespace selector */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('common:common.namespace')}</label>
            <select
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              disabled={!!editingQuota || !cluster}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground disabled:opacity-50"
            >
              <option value="">{t('common:selectors.selectNamespace')}</option>
              {availableNamespaces.map(ns => (
                <option key={ns} value={ns}>{ns}</option>
              ))}
            </select>
          </div>

          {/* Quota name */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('namespaceQuotas.quotaName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!!editingQuota}
              placeholder={t('namespaceQuotas.quotaNamePlaceholder')}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground disabled:opacity-50"
            />
          </div>

          {/* Resources */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-muted-foreground">{t('namespaceQuotas.resourceLimits')}</label>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    onClick={() => setShowGpuPresets(!showGpuPresets)}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
                  >
                    <Zap className="w-3 h-3" />
                    GPU
                  </button>
                  {showGpuPresets && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-popover border border-border rounded-lg shadow-lg z-10">
                      {GPU_RESOURCE_TYPES.map(rt => (
                        <button
                          key={rt.key}
                          onClick={() => addGpuPreset(rt.key)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-secondary first:rounded-t-lg last:rounded-b-lg"
                        >
                          <div className="text-foreground">{rt.label}</div>
                          <div className="text-xs text-muted-foreground">{rt.key}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={addResource}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                >
                  <Plus className="w-3 h-3" />
                  {t('common:common.add')}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {resources.map((resource, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={resource.key}
                    onChange={(e) => updateResource(index, 'key', e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded bg-secondary border border-border text-sm text-foreground"
                  >
                    <option value="">{t('namespaceQuotas.selectResource')}</option>
                    {COMMON_RESOURCE_TYPES.map(rt => (
                      <option key={rt.key} value={rt.key}>{rt.label} ({rt.key})</option>
                    ))}
                    <option value="custom">{t('namespaceQuotas.customResource')}</option>
                  </select>
                  {resource.key === 'custom' && (
                    <input
                      type="text"
                      placeholder="resource.name"
                      onChange={(e) => updateResource(index, 'key', e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded bg-secondary border border-border text-sm text-foreground"
                    />
                  )}
                  <input
                    type="text"
                    value={resource.value}
                    onChange={(e) => updateResource(index, 'value', e.target.value)}
                    placeholder="e.g., 4, 8Gi"
                    className="w-24 px-2 py-1.5 rounded bg-secondary border border-border text-sm text-foreground"
                  />
                  <button
                    onClick={() => removeResource(index)}
                    className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-secondary text-foreground hover:bg-secondary/80"
          >
            {t('common:common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {editingQuota ? t('common:common.update') : t('common:common.create')}
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}

export function NamespaceQuotas({ config }: NamespaceQuotasProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { deduplicatedClusters: allClusters, isLoading: clustersLoading } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || 'all')
  const [selectedNamespace, setSelectedNamespace] = useState<string>(config?.namespace || 'all')
  const [activeTab, setActiveTab] = useState<TabKey>('quotas')

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingQuota, setEditingQuota] = useState<ResourceQuota | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ cluster: string; namespace: string; name: string } | null>(null)

  // Fetch namespaces for the selected cluster (only when specific cluster selected)
  const { namespaces } = useNamespaces(selectedCluster !== 'all' ? selectedCluster : undefined)

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
    hasAnyData: allClusters.length > 0,
  })

  // Handle save quota
  const handleSaveQuota = async (spec: { cluster: string; namespace: string; name: string; hard: Record<string, string> }) => {
    setIsSaving(true)
    try {
      await createOrUpdateResourceQuota(spec)
      refetchQuotas()
      setIsModalOpen(false)
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
  const openEditModal = (quota: ResourceQuota) => {
    setEditingQuota(quota)
    setIsModalOpen(true)
  }

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
            quotaName: quota.name,
          })
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
            namespace: lr.namespace,
          })
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
  } = useCardData<QuotaUsage, SortByOption>(quotaUsages, {
    filter: {
      searchFields: ['resource', 'rawResource', 'cluster', 'namespace', 'quotaName'] as (keyof QuotaUsage)[],
      clusterField: 'cluster' as keyof QuotaUsage,
      storageKey: 'namespace-quotas',
    },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc' as SortDirection,
      comparators: QUOTA_SORT_COMPARATORS,
    },
    defaultLimit: 5,
  })

  // useCardData for Limits tab
  const {
    items: paginatedLimits,
    totalItems: totalLimits,
    currentPage: limitCurrentPage,
    totalPages: limitTotalPages,
    itemsPerPage: limitItemsPerPage,
    goToPage: limitGoToPage,
    needsPagination: limitNeedsPagination,
  } = useCardData<LimitRangeItem, SortByOption>(limitRangeItems, {
    filter: {
      searchFields: ['name', 'type', 'cluster', 'namespace'] as (keyof LimitRangeItem)[],
      clusterField: 'cluster' as keyof LimitRangeItem,
      storageKey: 'namespace-quotas-limits',
    },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc' as SortDirection,
      comparators: LIMIT_SORT_COMPARATORS,
    },
    defaultLimit: 5,
  })

  // Derive active tab state
  const activePagination = activeTab === 'quotas'
    ? { items: paginatedQuotas, currentPage: quotaCurrentPage, totalPages: quotaTotalPages, totalItems: totalQuotas, itemsPerPage: quotaItemsPerPage, goToPage: quotaGoToPage, needsPagination: quotaNeedsPagination }
    : { items: paginatedLimits, currentPage: limitCurrentPage, totalPages: limitTotalPages, totalItems: totalLimits, itemsPerPage: limitItemsPerPage, goToPage: limitGoToPage, needsPagination: limitNeedsPagination }

  const tabs = [
    { key: 'quotas' as const, label: 'Quotas', count: totalQuotas },
    { key: 'limits' as const, label: 'Limits', count: totalLimits },
  ]

  const getColor = (percent: number) => {
    if (percent >= 90) return 'red'
    if (percent >= 70) return 'orange'
    return 'green'
  }

  const getIcon = (resource: string) => {
    if (resource.toLowerCase().includes('cpu')) return Cpu
    if (resource.toLowerCase().includes('memory')) return HardDrive
    if (resource.toLowerCase().includes('pod')) return Box
    if (resource.toLowerCase().includes('gpu')) return Zap
    return Gauge
  }

  if (isInitialLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
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
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
            {activeTab === 'quotas' ? `${totalQuotas} quotas` : `${totalLimits} limits`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CardControlsRow
            clusterIndicator={{
              selectedCount: quotaFilters.localClusterFilter.length,
              totalCount: quotaFilters.availableClusters.length,
            }}
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
              onSortChange: (v) => quotaSorting.setSortBy(v as SortByOption),
              sortDirection: quotaSorting.sortDirection,
              onSortDirectionChange: quotaSorting.setSortDirection,
            }}
            extra={
              <button
                onClick={() => {
                  setEditingQuota(null)
                  setIsModalOpen(true)
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

      {/* Selectors */}
      <div className="flex gap-2 mb-4">
        <select
          value={selectedCluster}
          onChange={(e) => {
            setSelectedCluster(e.target.value)
            // Reset namespace to 'all' when cluster changes (unless going to 'all' clusters)
            if (e.target.value === 'all') {
              setSelectedNamespace('all')
            } else {
              setSelectedNamespace('all')
            }
          }}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground"
        >
          <option value="all">All Clusters ({clusters.length})</option>
          {clusters.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          value={selectedNamespace}
          onChange={(e) => setSelectedNamespace(e.target.value)}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground"
        >
          <option value="all">All Namespaces</option>
          {selectedCluster !== 'all' && namespaces.map(ns => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
        </select>
      </div>

      <>
        {/* Local Search */}
        <CardSearchInput
          value={quotaFilters.search}
          onChange={quotaFilters.setSearch}
          placeholder="Search quotas..."
          className="mb-4"
        />

        {/* Scope badge */}
        <div className="flex items-center gap-2 mb-4 min-w-0 overflow-hidden">
          {selectedCluster === 'all' ? (
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 shrink-0">All Clusters</span>
          ) : (
            <div className="shrink-0"><ClusterBadge cluster={selectedCluster} /></div>
          )}
          <span className="text-muted-foreground shrink-0">/</span>
          {selectedNamespace === 'all' ? (
            <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 shrink-0">All Namespaces</span>
          ) : (
            <span className="text-sm text-foreground truncate min-w-0">{selectedNamespace}</span>
          )}
        </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 p-1 rounded-lg bg-secondary/30">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs transition-colors ${
                  activeTab === tab.key
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>{tab.label}</span>
                <span className="text-xs opacity-60">({tab.count})</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 space-y-3 overflow-y-auto">
            {isFetchingData && activePagination.items.length === 0 ? (
              <>
                <Skeleton variant="rounded" height={70} />
                <Skeleton variant="rounded" height={70} />
                <Skeleton variant="rounded" height={70} />
              </>
            ) : activePagination.items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm py-8">
                <p>No {activeTab === 'quotas' ? 'resource quotas' : 'limit ranges'} found</p>
                {activeTab === 'quotas' && (
                  <button
                    onClick={() => {
                      setEditingQuota(null)
                      setIsModalOpen(true)
                    }}
                    className="mt-3 flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                  >
                    <Plus className="w-4 h-4" />
                    Create GPU Quota
                  </button>
                )}
              </div>
            ) : activeTab === 'quotas' ? (
              (paginatedQuotas as QuotaUsage[]).map((quota, idx) => {
                const color = getColor(quota.percent)
                const Icon = getIcon(quota.resource)
                const showScope = selectedCluster === 'all' || selectedNamespace === 'all'
                const fullQuota = uniqueQuotas.find(
                  q => q.cluster === quota.cluster && q.namespace === quota.namespace && q.name === quota.quotaName
                )

                return (
                  <div key={`${quota.cluster}-${quota.namespace}-${quota.resource}-${idx}`} className={`p-3 rounded-lg bg-secondary/30 ${isFetchingData ? 'opacity-50' : ''}`}>
                    {showScope && (
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0 overflow-hidden">
                          {quota.cluster && <span className="flex-shrink-0"><ClusterBadge cluster={quota.cluster} size="sm" /></span>}
                          {quota.namespace && (
                            <span className="flex items-center gap-1 truncate">
                              <span>/</span>
                              <span className="truncate">{quota.namespace}</span>
                            </span>
                          )}
                          {quota.quotaName && (
                            <span className="flex items-center gap-1 truncate">
                              <span>/</span>
                              <span className="text-yellow-400 truncate">{quota.quotaName}</span>
                            </span>
                          )}
                        </div>
                        {fullQuota && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEditModal(fullQuota)}
                              className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-blue-400"
                              title="Edit quota"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm({ cluster: fullQuota.cluster!, namespace: fullQuota.namespace, name: fullQuota.name })}
                              className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-red-400"
                              title="Delete quota"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 text-${color}-400`} />
                        <span className="text-sm text-foreground">{quota.resource}</span>
                        {quota.rawResource.includes('gpu') && (
                          <Zap className="w-3 h-3 text-purple-400" />
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {quota.used} / {quota.limit}
                      </span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-${color}-500 rounded-full transition-all duration-300`}
                        style={{ width: `${Math.min(quota.percent, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-end mt-1">
                      <span className={`text-xs text-${color}-400`}>{quota.percent.toFixed(0)}%</span>
                    </div>
                  </div>
                )
              })
            ) : (
              (paginatedLimits as LimitRangeItem[]).map((item, idx) => {
                const showScope = selectedCluster === 'all' || selectedNamespace === 'all'
                return (
                  <div
                    key={`${item.cluster}-${item.namespace}-${item.name}-${item.type}-${idx}`}
                    className={`p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors ${isFetchingData ? 'opacity-50' : ''}`}
                  >
                    {showScope && (
                      <div className="flex items-center gap-1 mb-2 text-xs text-muted-foreground min-w-0 overflow-hidden">
                        {item.cluster && <span className="flex-shrink-0"><ClusterBadge cluster={item.cluster} size="sm" /></span>}
                        {item.namespace && (
                          <span className="flex items-center gap-1 truncate">
                            <span>/</span>
                            <span className="truncate">{item.namespace}</span>
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Gauge className="w-4 h-4 text-blue-400" />
                        <span className="text-sm text-foreground">{item.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                          {item.type}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="mt-2 ml-6 text-xs text-muted-foreground space-y-1">
                      {item.limits.default && (
                        <div>Default: {formatLimits(item.limits.default)}</div>
                      )}
                      {item.limits.defaultRequest && (
                        <div>Default Request: {formatLimits(item.limits.defaultRequest)}</div>
                      )}
                      {item.limits.max && (
                        <div>Max: {formatLimits(item.limits.max)}</div>
                      )}
                      {item.limits.min && (
                        <div>Min: {formatLimits(item.limits.min)}</div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Pagination */}
          <CardPaginationFooter
            currentPage={activePagination.currentPage}
            totalPages={activePagination.totalPages}
            totalItems={activePagination.totalItems}
            itemsPerPage={typeof activePagination.itemsPerPage === 'number' ? activePagination.itemsPerPage : activePagination.totalItems}
            onPageChange={activePagination.goToPage}
            needsPagination={activePagination.needsPagination}
          />

          {/* Footer legend */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span>&lt;70%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-orange-500" />
                <span>70-90%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span>&gt;90%</span>
              </div>
            </div>
          </div>
        </>

      {/* Create/Edit Modal */}
      <QuotaModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
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

      {/* Delete Confirmation */}
      <BaseModal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} size="md">
        <BaseModal.Header
          title="Delete ResourceQuota?"
          icon={Trash2}
          onClose={() => setDeleteConfirm(null)}
          showBack={false}
        />
        <BaseModal.Content>
          <p className="text-sm text-muted-foreground mb-4">
            Are you sure you want to delete the quota <span className="text-yellow-400">{deleteConfirm?.name}</span> from{' '}
            <span className="text-blue-400">{deleteConfirm?.namespace}</span> in{' '}
            <span className="text-foreground">{deleteConfirm?.cluster}</span>?
          </p>
          <p className="text-sm text-red-400">
            This action cannot be undone. Pods and deployments will no longer be constrained by this quota.
          </p>
        </BaseModal.Content>
        <BaseModal.Footer>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDeleteConfirm(null)}
              className="px-4 py-2 text-sm rounded-lg bg-secondary text-foreground hover:bg-secondary/80"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteConfirm && handleDeleteQuota(deleteConfirm.cluster, deleteConfirm.namespace, deleteConfirm.name)}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Delete
            </button>
          </div>
        </BaseModal.Footer>
      </BaseModal>
    </div>
  )
}

// Format resource name for display (e.g., "requests.cpu" -> "CPU Requests")
function formatResourceName(name: string): string {
  const parts = name.split('.')
  const formatted = parts.map(p => {
    if (p === 'cpu') return 'CPU'
    if (p === 'memory') return 'Memory'
    if (p === 'requests') return 'Requests'
    if (p === 'limits') return 'Limits'
    if (p === 'pods') return 'Pods'
    if (p === 'services') return 'Services'
    if (p === 'persistentvolumeclaims') return 'PVCs'
    if (p === 'storage') return 'Storage'
    if (p.includes('nvidia')) return 'NVIDIA GPU'
    if (p.includes('amd')) return 'AMD GPU'
    return p.charAt(0).toUpperCase() + p.slice(1)
  })
  // Reorder: if it's "requests.cpu", make it "CPU Requests"
  if (formatted.length === 2 && (formatted[0] === 'Requests' || formatted[0] === 'Limits')) {
    return `${formatted[1]} ${formatted[0]}`
  }
  return formatted.join(' ')
}

// Format limit values for display
function formatLimits(limits: Record<string, string>): string {
  return Object.entries(limits)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')
}
