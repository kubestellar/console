import { useState, useMemo, useEffect } from 'react'
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, Clock, GitBranch, ChevronRight } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDemoMode } from '../../hooks/useDemoMode'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import {
  useCardData,
  CardSearchInput, CardControlsRow, CardPaginationFooter,
  CardAIActions,
} from '../../lib/cards'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'

interface KustomizationStatusProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

interface Kustomization {
  name: string
  namespace: string
  path: string
  sourceRef: string
  status: 'Ready' | 'NotReady' | 'Progressing' | 'Suspended'
  lastApplied: string
  revision: string
}

// LocalStorage cache keys
const KUSTOMIZATION_CACHE_KEY = 'kc-kustomization-status-cache'

// Load from localStorage
function loadKustomizationsFromStorage(): { data: Kustomization[], timestamp: number } {
  try {
    const stored = localStorage.getItem(KUSTOMIZATION_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed.data)) {
        return { data: parsed.data, timestamp: parsed.timestamp || 0 }
      }
    }
  } catch { /* ignore */ }
  return { data: [], timestamp: 0 }
}

type SortByOption = 'status' | 'name' | 'namespace' | 'lastApplied'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'namespace' as const, label: 'Namespace' },
  { value: 'lastApplied' as const, label: 'Last Applied' },
]

// Demo kustomization data
function getDemoKustomizations(): Kustomization[] {
  return [
    { name: 'infrastructure', namespace: 'flux-system', path: './infrastructure', sourceRef: 'flux-system/flux-repo', status: 'Ready', lastApplied: '2024-01-11T10:30:00Z', revision: 'main@sha1:abc123' },
    { name: 'apps', namespace: 'flux-system', path: './apps', sourceRef: 'flux-system/flux-repo', status: 'Ready', lastApplied: '2024-01-11T10:31:00Z', revision: 'main@sha1:abc123' },
    { name: 'monitoring', namespace: 'flux-system', path: './monitoring', sourceRef: 'flux-system/flux-repo', status: 'Progressing', lastApplied: '2024-01-11T10:32:00Z', revision: 'main@sha1:def456' },
    { name: 'tenants-dev', namespace: 'flux-system', path: './tenants/dev', sourceRef: 'flux-system/tenants-repo', status: 'Ready', lastApplied: '2024-01-10T15:00:00Z', revision: 'main@sha1:789ghi' },
    { name: 'tenants-prod', namespace: 'flux-system', path: './tenants/prod', sourceRef: 'flux-system/tenants-repo', status: 'NotReady', lastApplied: '2024-01-10T15:00:00Z', revision: 'main@sha1:789ghi' },
    { name: 'secrets', namespace: 'flux-system', path: './secrets', sourceRef: 'flux-system/flux-repo', status: 'Suspended', lastApplied: '2024-01-05T09:00:00Z', revision: 'main@sha1:jkl012' },
  ]
}

// Pure helper functions at module level (no dependency on component state)

function getStatusIcon(status: Kustomization['status']) {
  switch (status) {
    case 'Ready': return CheckCircle
    case 'NotReady': return XCircle
    case 'Progressing': return RefreshCw
    case 'Suspended': return Clock
    default: return AlertTriangle
  }
}

function getStatusColor(status: Kustomization['status']) {
  switch (status) {
    case 'Ready': return 'green'
    case 'NotReady': return 'red'
    case 'Progressing': return 'blue'
    case 'Suspended': return 'gray'
    default: return 'orange'
  }
}

function formatTime(timestamp: string) {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

export function KustomizationStatus({ config }: KustomizationStatusProps) {
  const { t } = useTranslation()
  const { isDemoMode: demoMode } = useDemoMode()
  const { deduplicatedClusters: allClusters, isLoading } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const [selectedNamespace, setSelectedNamespace] = useState<string>(config?.namespace || '')
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()
  const { drillToKustomization } = useDrillDownActions()

  // In demo mode, use demo data; in live mode, use localStorage cache (real data)
  const storedData = loadKustomizationsFromStorage()
  const [kustomizationData, setKustomizationData] = useState<Kustomization[]>(
    demoMode ? getDemoKustomizations() : storedData.data
  )

  // Update data when mode changes
  useEffect(() => {
    if (demoMode) {
      setKustomizationData(getDemoKustomizations())
    } else {
      const stored = loadKustomizationsFromStorage()
      setKustomizationData(stored.data)
    }
  }, [demoMode])

  // Report loading state to CardWrapper for skeleton/refresh behavior
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    hasAnyData: kustomizationData.length > 0,
    isDemoData: demoMode,
  })

  // Auto-select first cluster in demo mode so card shows data immediately
  useEffect(() => {
    if (demoMode && !selectedCluster && allClusters.length > 0) {
      setSelectedCluster(allClusters[0].name)
    }
  }, [demoMode, selectedCluster, allClusters])

  // Apply global filters to cluster list for the dropdown
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

  // Filter kustomizations based on selected cluster
  const allKustomizations: Kustomization[] = selectedCluster ? kustomizationData : []

  // Get unique namespaces
  const namespaces = useMemo(() => {
    const nsSet = new Set(allKustomizations.map(k => k.namespace))
    return Array.from(nsSet).sort()
  }, [allKustomizations])

  // Pre-filter by namespace before passing to useCardData
  const namespacedKustomizations = useMemo(() => {
    if (!selectedNamespace) return allKustomizations
    return allKustomizations.filter(k => k.namespace === selectedNamespace)
  }, [allKustomizations, selectedNamespace])

  const statusOrder: Record<string, number> = { NotReady: 0, Progressing: 1, Suspended: 2, Ready: 3 }

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: kustomizations,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: localSearch,
      setSearch: setLocalSearch,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters,
      showClusterFilter,
      setShowClusterFilter,
      clusterFilterRef,
    },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection,
    },
  } = useCardData<Kustomization, SortByOption>(namespacedKustomizations, {
    filter: {
      searchFields: ['name', 'namespace', 'path', 'sourceRef'] as (keyof Kustomization)[],
      storageKey: 'kustomization-status',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        status: (a, b) => (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5),
        name: (a, b) => a.name.localeCompare(b.name),
        namespace: (a, b) => a.namespace.localeCompare(b.namespace),
        lastApplied: (a, b) => new Date(b.lastApplied).getTime() - new Date(a.lastApplied).getTime(),
      },
    },
    defaultLimit: 5,
  })

  const readyCount = namespacedKustomizations.filter(k => k.status === 'Ready').length
  const notReadyCount = namespacedKustomizations.filter(k => k.status === 'NotReady').length

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={160} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={32} className="mb-4" />
        <div className="space-y-2">
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
        </div>
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">No Kustomizations</p>
        <p className="text-xs mt-1">Kustomizations will appear here</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {totalItems} kustomizations
          </span>
        </div>
        <CardControlsRow
          clusterFilter={{
            availableClusters,
            selectedClusters: localClusterFilter,
            onToggle: toggleClusterFilter,
            onClear: clearClusterFilter,
            isOpen: showClusterFilter,
            setIsOpen: setShowClusterFilter,
            containerRef: clusterFilterRef,
            minClusters: 1,
          }}
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => setSortBy(v as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection,
          }}
        />
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
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground disabled:opacity-50"
        >
          <option value="">All namespaces</option>
          {namespaces.map(ns => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
        </select>
      </div>

      {!selectedCluster ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a cluster to view Kustomizations
        </div>
      ) : (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            <ClusterBadge cluster={selectedCluster} />
            {selectedNamespace && (
              <>
                <span className="text-muted-foreground">/</span>
                <span className="text-sm text-foreground">{selectedNamespace}</span>
              </>
            )}
          </div>

          {/* Local Search */}
          <CardSearchInput
            value={localSearch}
            onChange={setLocalSearch}
            placeholder="Search kustomizations..."
            className="mb-4"
          />

          {/* Summary */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1 p-2 rounded-lg bg-pink-500/10 text-center">
              <span className="text-lg font-bold text-pink-400">{totalItems}</span>
              <p className="text-xs text-muted-foreground">{t('common.total')}</p>
            </div>
            <div className="flex-1 p-2 rounded-lg bg-green-500/10 text-center">
              <span className="text-lg font-bold text-green-400">{readyCount}</span>
              <p className="text-xs text-muted-foreground">{t('common.ready')}</p>
            </div>
            <div className="flex-1 p-2 rounded-lg bg-red-500/10 text-center">
              <span className="text-lg font-bold text-red-400">{notReadyCount}</span>
              <p className="text-xs text-muted-foreground">Failing</p>
            </div>
          </div>

          {/* Kustomizations list */}
          <div className="flex-1 space-y-2 overflow-y-auto">
            {kustomizations.map((ks, idx) => {
              const StatusIcon = getStatusIcon(ks.status)
              const color = getStatusColor(ks.status)

              return (
                <div
                  key={idx}
                  onClick={() => drillToKustomization(selectedCluster, ks.namespace, ks.name, {
                    path: ks.path,
                    sourceRef: ks.sourceRef,
                    status: ks.status,
                    lastApplied: ks.lastApplied,
                    revision: ks.revision,
                  })}
                  className={`p-3 rounded-lg cursor-pointer group ${ks.status === 'NotReady' ? 'bg-red-500/10 border border-red-500/20' : 'bg-secondary/30'} hover:bg-secondary/50 transition-colors`}
                  title={`Click to view ${ks.name} details`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`w-4 h-4 text-${color}-400 ${ks.status === 'Progressing' ? 'animate-spin' : ''}`} />
                      <span className="text-sm text-foreground font-medium">{ks.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded bg-${color}-500/20 text-${color}-400`}>
                        {ks.status}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <div className="ml-6 text-xs text-muted-foreground space-y-0.5">
                    <div className="flex items-center gap-1">
                      <GitBranch className="w-3 h-3" />
                      <span className="truncate">{ks.path}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="truncate">{ks.revision.split('@')[1]?.slice(0, 12)}</span>
                      <span>{formatTime(ks.lastApplied)}</span>
                    </div>
                  </div>
                  {(ks.status === 'NotReady' || ks.status === 'Suspended') && (
                    <CardAIActions
                      resource={{ kind: 'Kustomization', name: ks.name, namespace: ks.namespace, cluster: selectedCluster, status: ks.status }}
                      issues={[{ name: `Kustomization ${ks.status}`, message: `Kustomization "${ks.name}" in ${ks.namespace} is ${ks.status} (source: ${ks.sourceRef}, path: ${ks.path})` }]}
                      className="mt-1 ml-6"
                    />
                  )}
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          <CardPaginationFooter
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 10}
            onPageChange={goToPage}
            needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
          />

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            Flux Kustomize Controller
          </div>
        </>
      )}
    </div>
  )
}
