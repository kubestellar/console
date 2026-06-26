import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CardSearchInput } from '../../lib/cards/CardComponents'
import { cn } from '../../lib/cn'
import { useClusters } from '../../hooks/useMCP'
import {
  useCachedConfigMaps,
  useCachedDeployments,
  useCachedJobs,
  useCachedNamespaces,
  useCachedPods,
  useCachedPVCs,
  useCachedSecrets,
  useCachedServices,
} from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { CardComponentProps } from './cardRegistry'
import { useCardLoadingState } from './CardDataContext'
import { useDemoMode } from '../../hooks/useDemoMode'
import type { ChangeType, ModalResource, NamespaceData, ResourceChange, ResourceSnapshot, ResourceType } from './NamespaceMonitor.types'
import { NamespaceMonitorChangesPanel } from './NamespaceMonitorChangesPanel'
import { NamespaceMonitorModal } from './NamespaceMonitorModal'
import { NamespaceMonitorTable } from './NamespaceMonitorTable'
import {
  EMPTY_NAMESPACE_DATA,
  MAX_RECENT_CHANGES,
  RECENT_CHANGE_WINDOW_MS,
  ResourceColors,
  ResourceIcons,
  buildCurrentSnapshots,
  buildNamespaceData,
  detectResourceChanges,
  getChangeCountsByType,
  getFilteredClusters,
  getResourceChange as getRecentResourceChange,
} from './NamespaceMonitor.utils'

export function NamespaceMonitor({ config: _config }: CardComponentProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { isDemoMode } = useDemoMode()
  const { deduplicatedClusters: clusters, isLoading, isFailed, consecutiveFailures } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { drillToNamespace, drillToPod, drillToDeployment, drillToService, drillToPVC } = useDrillDownActions()

  const [searchFilter, setSearchFilter] = useState('')
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set())
  const [expandedNamespaces, setExpandedNamespaces] = useState<Set<string>>(new Set())
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  const [activeResourceTypes, setActiveResourceTypes] = useState<Set<ResourceType>>(
    new Set(['pods', 'deployments', 'services']),
  )
  const [recentChanges, setRecentChanges] = useState<ResourceChange[]>([])
  const [showChangesPanel, setShowChangesPanel] = useState(false)
  const [modalResource, setModalResource] = useState<ModalResource | null>(null)

  const previousSnapshotsRef = useRef<Map<string, ResourceSnapshot>>(new Map())
  const changeTimeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const filteredClusters = useMemo(
    () => getFilteredClusters({
      clusters,
      selectedClusters,
      isAllClustersSelected,
      searchFilter,
    }),
    [clusters, isAllClustersSelected, searchFilter, selectedClusters],
  )

  const { namespaces, isDemoFallback: namespacesDemoFallback, isRefreshing: namespacesRefreshing } = useCachedNamespaces(selectedCluster || undefined)
  const { deployments, isDemoFallback: deploymentsDemoFallback, isRefreshing: deploymentsRefreshing } = useCachedDeployments(selectedCluster || undefined)
  const { services, isDemoFallback: servicesDemoFallback, isRefreshing: servicesRefreshing } = useCachedServices(selectedCluster || undefined)
  const { pvcs, isDemoFallback: pvcsDemoFallback, isRefreshing: pvcsRefreshing } = useCachedPVCs(selectedCluster || undefined)
  const { pods, isDemoFallback: podsDemoFallback, isRefreshing: podsRefreshing } = useCachedPods(selectedCluster || undefined, undefined, { limit: 500 })
  const { configmaps, isDemoFallback: configmapsDemoFallback, isRefreshing: configmapsRefreshing } = useCachedConfigMaps(selectedCluster || undefined)
  const { secrets, isDemoFallback: secretsDemoFallback, isRefreshing: secretsRefreshing } = useCachedSecrets(selectedCluster || undefined)
  const { jobs, isDemoFallback: jobsDemoFallback, isRefreshing: jobsRefreshing } = useCachedJobs(selectedCluster || undefined)

  const isDemoData = namespacesDemoFallback || deploymentsDemoFallback || servicesDemoFallback ||
    pvcsDemoFallback || podsDemoFallback || configmapsDemoFallback || secretsDemoFallback || jobsDemoFallback
  const hasData = clusters.length > 0

  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing: namespacesRefreshing || deploymentsRefreshing || servicesRefreshing || pvcsRefreshing || podsRefreshing || configmapsRefreshing || secretsRefreshing || jobsRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoMode || isDemoData,
    isFailed,
    consecutiveFailures,
  })

  useEffect(() => {
    if (!selectedCluster) {
      return
    }

    const currentSnapshots = buildCurrentSnapshots({
      selectedCluster,
      pods,
      deployments,
      services,
      pvcs,
      configmaps,
      secrets,
      jobs,
    })
    const newChanges = previousSnapshotsRef.current.size > 0
      ? detectResourceChanges(currentSnapshots, previousSnapshotsRef.current)
      : []

    previousSnapshotsRef.current = currentSnapshots

    if (newChanges.length > 0) {
      setRecentChanges(previous => [...newChanges, ...previous].slice(0, MAX_RECENT_CHANGES))
    }
  }, [selectedCluster, pods, deployments, services, pvcs, configmaps, secrets, jobs])

  useEffect(() => () => {
    changeTimeoutRef.current.forEach(timeout => clearTimeout(timeout))
    changeTimeoutRef.current.clear()
  }, [])

  const selectedClusterNamespaceData = useMemo<Map<string, NamespaceData>>(
    () => buildNamespaceData({
      selectedCluster,
      namespaces,
      pods,
      deployments,
      services,
      configmaps,
      secrets,
      pvcs,
      jobs,
      searchFilter,
    }),
    [selectedCluster, namespaces, pods, deployments, services, configmaps, secrets, pvcs, jobs, searchFilter],
  )

  const getNamespaceData = useCallback((clusterName: string) => {
    if (clusterName !== selectedCluster) {
      return EMPTY_NAMESPACE_DATA
    }
    return selectedClusterNamespaceData
  }, [selectedCluster, selectedClusterNamespaceData])

  const getResourceChange = useCallback((cluster: string, namespace: string, type: ResourceType, name: string): ChangeType => (
    getRecentResourceChange(recentChanges, cluster, namespace, type, name)
  ), [recentChanges])

  const clearChangeAfterTimeout = useCallback((key: string) => {
    const existingTimeout = changeTimeoutRef.current.get(key)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    const timeout = setTimeout(() => {
      changeTimeoutRef.current.delete(key)
    }, RECENT_CHANGE_WINDOW_MS)

    changeTimeoutRef.current.set(key, timeout)
  }, [])

  const toggleCluster = useCallback((clusterName: string) => {
    const isCurrentlyExpanded = expandedClusters.has(clusterName)

    setExpandedClusters(previous => {
      const next = new Set(previous)
      if (next.has(clusterName)) {
        next.delete(clusterName)
      } else {
        next.add(clusterName)
      }
      return next
    })

    if (!isCurrentlyExpanded) {
      setSelectedCluster(clusterName)
    }
  }, [expandedClusters])

  const toggleNamespace = useCallback((namespaceKey: string) => {
    setExpandedNamespaces(previous => {
      const next = new Set(previous)
      if (next.has(namespaceKey)) {
        next.delete(namespaceKey)
      } else {
        next.add(namespaceKey)
      }
      return next
    })
  }, [])

  const toggleResourceType = useCallback((type: ResourceType) => {
    setActiveResourceTypes(previous => {
      const next = new Set(previous)
      if (next.has(type)) {
        if (next.size > 1) {
          next.delete(type)
        }
      } else {
        next.add(type)
      }
      return next
    })
  }, [])

  const handleViewResourceDetails = useCallback((resource: ModalResource) => {
    if (resource.type === 'pods') {
      drillToPod(resource.cluster, resource.namespace, resource.name)
    } else if (resource.type === 'deployments') {
      drillToDeployment(resource.cluster, resource.namespace, resource.name)
    } else if (resource.type === 'services') {
      drillToService(resource.cluster, resource.namespace, resource.name)
    } else if (resource.type === 'pvcs') {
      drillToPVC(resource.cluster, resource.namespace, resource.name)
    }

    setModalResource(null)
  }, [drillToDeployment, drillToPVC, drillToPod, drillToService])

  const handleSelectChange = useCallback((change: ResourceChange) => {
    setModalResource({
      type: change.resourceType,
      name: change.name,
      namespace: change.namespace,
      cluster: change.cluster,
    })
  }, [])

  const handleDrillToResource = useCallback((resource: ModalResource) => {
    if (resource.type === 'pods') {
      drillToPod(resource.cluster, resource.namespace, resource.name)
      return
    }
    if (resource.type === 'deployments') {
      drillToDeployment(resource.cluster, resource.namespace, resource.name)
      return
    }
    if (resource.type === 'services') {
      drillToService(resource.cluster, resource.namespace, resource.name)
      return
    }
    if (resource.type === 'pvcs') {
      drillToPVC(resource.cluster, resource.namespace, resource.name)
    }
  }, [drillToDeployment, drillToPVC, drillToPod, drillToService])

  const changeCountsByType = useMemo(() => getChangeCountsByType(recentChanges), [recentChanges])
  const totalChangeCount = changeCountsByType.added + changeCountsByType.modified + changeCountsByType.deleted + changeCountsByType.error

  return (
    <div className="h-full flex flex-col min-h-0 relative">
      <div className="flex items-center justify-end mb-3 shrink-0">
        <button
          onClick={() => setShowChangesPanel(open => !open)}
          className={cn(
            'relative flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
            changeCountsByType.error > 0
              ? 'bg-red-500/20 text-red-400'
              : totalChangeCount > 0
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-secondary text-muted-foreground',
          )}
          title={t('cards:namespaceMonitor.recentChanges', { defaultValue: 'Recent changes' })}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>{totalChangeCount}</span>
        </button>
      </div>

      <NamespaceMonitorChangesPanel
        showChangesPanel={showChangesPanel}
        recentChanges={recentChanges}
        onClose={() => setShowChangesPanel(false)}
        onSelectChange={handleSelectChange}
      />

      <CardSearchInput
        value={searchFilter}
        onChange={setSearchFilter}
        placeholder={t('cards:namespaceMonitor.searchPlaceholder', { defaultValue: 'Search clusters, namespaces...' })}
        className="mb-3 shrink-0"
      />

      <div className="flex flex-wrap gap-1.5 mb-3 shrink-0">
        {(Object.keys(ResourceIcons) as ResourceType[]).map(type => {
          const Icon = ResourceIcons[type]
          const isActive = activeResourceTypes.has(type)

          return (
            <button
              key={type}
              onClick={() => toggleResourceType(type)}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg border transition-colors',
                isActive
                  ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                  : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground hover:bg-secondary',
              )}
            >
              <Icon className={cn('w-3 h-3', isActive && ResourceColors[type])} />
              <span className="capitalize">{t(`cards:namespaceMonitor.resourceTypes.${type}`, { defaultValue: type })}</span>
            </button>
          )
        })}
      </div>

      <NamespaceMonitorTable
        filteredClusters={filteredClusters}
        selectedCluster={selectedCluster}
        expandedClusters={expandedClusters}
        expandedNamespaces={expandedNamespaces}
        activeResourceTypes={activeResourceTypes}
        getNamespaceData={getNamespaceData}
        getResourceChange={getResourceChange}
        clearChangeAfterTimeout={clearChangeAfterTimeout}
        onToggleCluster={toggleCluster}
        onToggleNamespace={toggleNamespace}
        onDrillToNamespace={drillToNamespace}
        onDrillToResource={handleDrillToResource}
        onOpenResource={setModalResource}
      />

      <NamespaceMonitorModal
        modalResource={modalResource}
        onClose={() => setModalResource(null)}
        onViewDetails={handleViewResourceDetails}
      />
    </div>
  )
}
