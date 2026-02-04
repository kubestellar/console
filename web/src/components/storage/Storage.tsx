import { useState, useEffect, useCallback, useRef } from 'react'
import { Database, ExternalLink, AlertCircle } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { useClusters, usePVCs, PVC } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { StatBlockValue } from '../ui/StatsOverview'
import { ClusterBadge } from '../ui/ClusterBadge'
import { DashboardPage } from '../../lib/dashboards'
import { getDefaultCards } from '../../config/dashboards'

// PVC List Modal
interface PVCListModalProps {
  isOpen: boolean
  onClose: () => void
  pvcs: PVC[]
  title: string
  statusFilter?: 'Bound' | 'Pending' | 'all'
  onSelectPVC: (cluster: string, namespace: string, name: string) => void
}

function PVCListModal({ isOpen, onClose, pvcs, title, statusFilter = 'all', onSelectPVC }: PVCListModalProps) {
  const [searchQuery, setSearchQuery] = useState('')

  // Filter by status and search query
  const filteredPVCs = pvcs.filter(pvc => {
    if (statusFilter !== 'all' && pvc.status !== statusFilter) return false
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        pvc.name.toLowerCase().includes(query) ||
        pvc.namespace.toLowerCase().includes(query) ||
        (pvc.cluster && pvc.cluster.toLowerCase().includes(query)) ||
        (pvc.storageClass && pvc.storageClass.toLowerCase().includes(query))
      )
    }
    return true
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Bound': return 'text-green-400 bg-green-400/20'
      case 'Pending': return 'text-yellow-400 bg-yellow-400/20'
      case 'Lost': return 'text-red-400 bg-red-400/20'
      default: return 'text-muted-foreground bg-secondary'
    }
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg">
      <BaseModal.Header
        title={title}
        description={`${filteredPVCs.length} PVC${filteredPVCs.length !== 1 ? 's' : ''}`}
        icon={Database}
        onClose={onClose}
        showBack={false}
      />

      {/* Search */}
      <div className="px-6 py-4 border-b border-border">
        <input
          type="text"
          placeholder="Search by name, namespace, cluster, or storage class..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <BaseModal.Content className="max-h-[60vh]">
        {filteredPVCs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No PVCs found matching the criteria
          </div>
        ) : (
          <div className="space-y-2">
            {filteredPVCs.map((pvc, idx) => (
              <div
                key={`${pvc.cluster}-${pvc.namespace}-${pvc.name}-${idx}`}
                onClick={() => onSelectPVC(pvc.cluster || 'default', pvc.namespace, pvc.name)}
                className="glass p-3 rounded-lg cursor-pointer hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Database className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{pvc.name}</span>
                        <span className={`px-1.5 py-0.5 text-xs rounded ${getStatusColor(pvc.status)}`}>
                          {pvc.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>Namespace: {pvc.namespace}</span>
                        {pvc.storageClass && <span>• Storage Class: {pvc.storageClass}</span>}
                        {pvc.capacity && <span>• {pvc.capacity}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {pvc.cluster && <ClusterBadge cluster={pvc.cluster} size="sm" />}
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </BaseModal.Content>
    </BaseModal>
  )
}

const STORAGE_CARDS_KEY = 'kubestellar-storage-cards'

// Default cards for the storage dashboard
const DEFAULT_STORAGE_CARDS = getDefaultCards('storage')

export function Storage() {
  const { deduplicatedClusters: clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch, error: clustersError } = useClusters()
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
  } = useGlobalFilters()
  const { pvcs, error: pvcsError } = usePVCs()
  const error = clustersError || pvcsError
  const { drillToPVC, drillToResources } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  // PVC List Modal state
  const [showPVCModal, setShowPVCModal] = useState(false)
  const [pvcModalFilter, setPVCModalFilter] = useState<'Bound' | 'Pending' | 'all'>('all')

  // Filter clusters based on global selection
  const filteredClusters = clusters.filter(c =>
    isAllClustersSelected || globalSelectedClusters.includes(c.name)
  )

  // Reachable clusters are those not explicitly marked as unreachable
  const reachableClusters = filteredClusters.filter(c => c.reachable !== false)

  // Filter PVCs by global selection (only from reachable clusters)
  const filteredPVCs = pvcs.filter(p =>
    isAllClustersSelected || (p.cluster && globalSelectedClusters.includes(p.cluster))
  ).filter(p => {
    const cluster = clusters.find(c => c.name === p.cluster)
    return cluster?.reachable !== false
  })

  // Calculate storage stats from reachable clusters only
  const currentStats = {
    totalStorageGB: reachableClusters.reduce((sum, c) => sum + (c.storageGB || 0), 0),
    totalPVCs: filteredPVCs.length,
    boundPVCs: filteredPVCs.filter(p => p.status === 'Bound').length,
    pendingPVCs: filteredPVCs.filter(p => p.status === 'Pending').length,
  }

  // Check if we have actual data (not just loading state)
  const hasActualData = filteredClusters.some(c =>
    c.reachable !== false && c.storageGB !== undefined && c.nodeCount !== undefined && c.nodeCount > 0
  )

  // Cache the last known good stats to show during refresh
  const cachedStats = useRef(currentStats)

  // Update cache when we have real data
  useEffect(() => {
    if (hasActualData && (currentStats.totalStorageGB > 0 || currentStats.totalPVCs > 0)) {
      cachedStats.current = currentStats
    }
  }, [hasActualData, currentStats.totalStorageGB, currentStats.totalPVCs, currentStats.boundPVCs, currentStats.pendingPVCs])

  // Use cached stats during refresh, current stats when data is available
  const stats = (hasActualData || cachedStats.current.totalStorageGB > 0 || cachedStats.current.totalPVCs > 0)
    ? (hasActualData ? currentStats : cachedStats.current)
    : null

  // Determine if we should show data or dashes
  const hasDataToShow = stats !== null

  // Format storage size - returns '-' if no data, never negative
  const formatStorage = (gb: number, hasData = true) => {
    if (!hasData) return '-'
    const safeValue = Math.max(0, gb) // Never show negative
    if (safeValue >= 1024) {
      return `${(safeValue / 1024).toFixed(1)} TB`
    }
    return `${Math.round(safeValue)} GB`
  }

  // Format stat value - returns '-' if no data
  const formatStatValue = (value: number, hasData = true) => {
    if (!hasData) return '-'
    return Math.max(0, value)
  }

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'ephemeral':
        return {
          value: formatStorage(stats?.totalStorageGB || 0, hasDataToShow),
          sublabel: 'total allocatable',
          onClick: hasDataToShow ? drillToResources : undefined,
          isClickable: hasDataToShow
        }
      case 'pvcs':
        return {
          value: formatStatValue(stats?.totalPVCs || 0, hasDataToShow),
          sublabel: 'persistent volume claims',
          onClick: () => { setPVCModalFilter('all'); setShowPVCModal(true) },
          isClickable: hasDataToShow && (stats?.totalPVCs || 0) > 0
        }
      case 'bound':
        return {
          value: formatStatValue(stats?.boundPVCs || 0, hasDataToShow),
          sublabel: 'PVCs bound',
          onClick: () => { setPVCModalFilter('Bound'); setShowPVCModal(true) },
          isClickable: hasDataToShow && (stats?.boundPVCs || 0) > 0
        }
      case 'pending':
        return {
          value: formatStatValue(stats?.pendingPVCs || 0, hasDataToShow),
          sublabel: 'PVCs pending',
          onClick: () => { setPVCModalFilter('Pending'); setShowPVCModal(true) },
          isClickable: hasDataToShow && (stats?.pendingPVCs || 0) > 0
        }
      case 'storage_classes':
        // Count unique storage classes from PVCs (shows storage classes in use)
        const uniqueStorageClasses = new Set(filteredPVCs.map(p => p.storageClass).filter(Boolean))
        return { value: uniqueStorageClasses.size, sublabel: 'classes in use', isClickable: false }
      default:
        return { value: '-', sublabel: '' }
    }
  }, [stats, hasDataToShow, drillToResources, filteredPVCs])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  return (
    <>
      <DashboardPage
        title="Storage"
        subtitle="Monitor storage resources across clusters"
        icon="HardDrive"
        storageKey={STORAGE_CARDS_KEY}
        defaultCards={DEFAULT_STORAGE_CARDS}
        statsType="storage"
        getStatValue={getStatValue}
        onRefresh={refetch}
        isLoading={isLoading}
        isRefreshing={dataRefreshing}
        lastUpdated={lastUpdated}
        hasData={hasDataToShow}
        emptyState={{
          title: 'Storage Dashboard',
          description: 'Add cards to monitor PersistentVolumes, StorageClasses, and storage utilization across your clusters.',
        }}
      >
        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-400">Error loading storage data</p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
            </div>
          </div>
        )}
      </DashboardPage>

      {/* PVC List Modal */}
      <PVCListModal
        isOpen={showPVCModal}
        onClose={() => setShowPVCModal(false)}
        pvcs={filteredPVCs}
        title={pvcModalFilter === 'all' ? 'All PVCs' : pvcModalFilter === 'Bound' ? 'Bound PVCs' : 'Pending PVCs'}
        statusFilter={pvcModalFilter}
        onSelectPVC={(cluster, namespace, name) => {
          setShowPVCModal(false)
          drillToPVC(cluster, namespace, name)
        }}
      />
    </>
  )
}
