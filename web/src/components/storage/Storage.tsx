import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { HardDrive, Database, Plus, LayoutGrid, ChevronDown, ChevronRight, ExternalLink, GripVertical, AlertCircle } from 'lucide-react'
import { DashboardHeader } from '../shared/DashboardHeader'
import {
  DndContext,
  closestCenter,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BaseModal } from '../../lib/modals'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { useClusters, usePVCs, PVC } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { UnifiedStatsSection, STORAGE_STATS_CONFIG } from '../../lib/unified/stats'
import type { StatBlockValue } from '../ui/StatsOverview'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS, getDefaultCardWidth } from '../cards/cardRegistry'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { ConfigureCardModal } from '../dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { DashboardTemplate } from '../dashboard/templates'
import { ClusterBadge } from '../ui/ClusterBadge'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { useDashboard, DashboardCard } from '../../lib/dashboards'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { useMobile } from '../../hooks/useMobile'

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
const DEFAULT_STORAGE_CARDS = [
  { type: 'storage_overview', title: 'Storage Overview', position: { w: 4, h: 3 } },
  { type: 'pvc_status', title: 'PVC Status', position: { w: 8, h: 3 } },
]

// Sortable card component with drag handle
interface SortableStorageCardProps {
  card: DashboardCard
  onConfigure: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  isDragging: boolean
  isRefreshing?: boolean
  onRefresh?: () => void
  lastUpdated?: Date | null
}

const SortableStorageCard = memo(function SortableStorageCard({
  card,
  onConfigure,
  onRemove,
  onWidthChange,
  isDragging,
  isRefreshing,
  onRefresh,
  lastUpdated,
}: SortableStorageCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card.id })
  const { isMobile } = useMobile()

  const cardWidth = card.position?.w || 4
  const cardHeight = card.position?.h || 3
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: isMobile ? 'span 1' : `span ${cardWidth}`,
    gridRow: `span ${cardHeight}`,
    opacity: isDragging ? 0.5 : 1,
  }

  const CardComponent = CARD_COMPONENTS[card.card_type]
  if (!CardComponent) {
    return null
  }

  return (
    <div ref={setNodeRef} style={style}>
      <CardWrapper
        cardId={card.id}
        cardType={card.card_type}
        title={formatCardTitle(card.card_type)}
        cardWidth={cardWidth}
        onConfigure={onConfigure}
        onRemove={onRemove}
        onWidthChange={onWidthChange}
        isDemoData={DEMO_DATA_CARDS.has(card.card_type)}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
        lastUpdated={lastUpdated}
        dragHandle={
          <button
            {...attributes}
            {...listeners}
            className="p-1 rounded hover:bg-secondary cursor-grab active:cursor-grabbing"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
        }
      >
        <CardComponent config={card.config} />
      </CardWrapper>
    </div>
  )
})

// Drag preview for overlay
function StorageDragPreviewCard({ card }: { card: DashboardCard }) {
  const cardWidth = card.position?.w || 4
  return (
    <div
      className="glass rounded-lg p-4 shadow-xl"
      style={{ width: `${(cardWidth / 12) * 100}%`, minWidth: 200, maxWidth: 400 }}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium truncate">
          {formatCardTitle(card.card_type)}
        </span>
      </div>
    </div>
  )
}

export function Storage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const { deduplicatedClusters: clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch, error: clustersError } = useClusters()
  const { showIndicator, triggerRefresh } = useRefreshIndicator(refetch)
  const isRefreshing = dataRefreshing || showIndicator
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
  } = useGlobalFilters()
  const { pvcs, error: pvcsError } = usePVCs()
  const error = clustersError || pvcsError
  const { drillToPVC, drillToResources } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  // Use the shared dashboard hook for cards, DnD, modals, auto-refresh
  const {
    cards,
    setCards,
    addCards,
    removeCard,
    configureCard,
    updateCardWidth,
    reset,
    isCustomized,
    showAddCard,
    setShowAddCard,
    showTemplates,
    setShowTemplates,
    configuringCard,
    setConfiguringCard,
    openConfigureCard,
    showCards,
    setShowCards,
    expandCards,
    dnd: { sensors, activeId, handleDragStart, handleDragEnd },
    autoRefresh,
    setAutoRefresh,
  } = useDashboard({
    storageKey: STORAGE_CARDS_KEY,
    defaultCards: DEFAULT_STORAGE_CARDS,
    onRefresh: refetch,
  })

  // PVC List Modal state
  const [showPVCModal, setShowPVCModal] = useState(false)
  const [pvcModalFilter, setPVCModalFilter] = useState<'Bound' | 'Pending' | 'all'>('all')

  // Combined loading/refreshing states (useClusters has shared cache so data persists)
  const isFetching = isLoading || isRefreshing || showIndicator
  // Only show skeletons when we have no data yet
  const showSkeletons = clusters.length === 0 && isLoading

  // Handle addCard URL param - open modal and clear param
  useEffect(() => {
    if (searchParams.get('addCard') === 'true') {
      setShowAddCard(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, setShowAddCard])

  // Trigger refresh when navigating to this page (location.key changes on each navigation)
  useEffect(() => {
    refetch()
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddCards = useCallback((newCards: Array<{ type: string; title: string; config: Record<string, unknown> }>) => {
    // Custom handling for storage cards with special widths
    const cardsToAdd = newCards.map(card => ({
      type: card.type,
      title: card.title,
      config: card.config,
      position: {
        w: getDefaultCardWidth(card.type),
        h: card.type === 'cluster_resource_tree' ? 5 : 3,
      },
    }))
    addCards(cardsToAdd)
    expandCards()
    setShowAddCard(false)
  }, [addCards, expandCards, setShowAddCard])

  const handleRemoveCard = useCallback((cardId: string) => {
    removeCard(cardId)
  }, [removeCard])

  const handleConfigureCard = useCallback((cardId: string) => {
    openConfigureCard(cardId, cards)
  }, [openConfigureCard, cards])

  const handleSaveCardConfig = useCallback((cardId: string, config: Record<string, unknown>) => {
    configureCard(cardId, config)
    setConfiguringCard(null)
  }, [configureCard, setConfiguringCard])

  const handleWidthChange = useCallback((cardId: string, newWidth: number) => {
    updateCardWidth(cardId, newWidth)
  }, [updateCardWidth])

  const applyTemplate = useCallback((template: DashboardTemplate) => {
    const newCards = template.cards.map((card, i) => ({
      id: `card-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
      card_type: card.card_type,
      config: card.config || {},
      title: card.title,
    }))
    setCards(newCards)
    expandCards()
    setShowTemplates(false)
  }, [setCards, expandCards, setShowTemplates])

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
  }, [stats, hasDataToShow, formatStorage, formatStatValue, drillToResources, setPVCModalFilter, setShowPVCModal])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  // Transform card for ConfigureCardModal
  const configureCardData = configuringCard ? {
    id: configuringCard.id,
    card_type: configuringCard.card_type,
    config: configuringCard.config,
    title: configuringCard.title,
  } : null

  return (
    <div className="">
      {/* Header */}
      <DashboardHeader
        title="Storage"
        subtitle="Monitor storage resources across clusters"
        icon={<HardDrive className="w-6 h-6 text-purple-400" />}
        isFetching={isFetching}
        onRefresh={triggerRefresh}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="storage-auto-refresh"
        lastUpdated={lastUpdated}
      />

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

      {/* Stats Overview - configurable */}
      <UnifiedStatsSection
        config={STORAGE_STATS_CONFIG}
        getStatValue={getStatValue}
        hasData={hasDataToShow}
        isLoading={showSkeletons}
        lastUpdated={lastUpdated}
      />

      {/* Dashboard Cards Section */}
      <div className="mb-6">
        {/* Card section header with toggle and buttons */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setShowCards(!showCards)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Storage Cards ({cards.length})</span>
            {showCards ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Cards grid */}
        {showCards && (
          <>
            {cards.length === 0 ? (
              <div className="glass p-8 rounded-lg border-2 border-dashed border-border/50 text-center">
                <div className="flex justify-center mb-4">
                  <HardDrive className="w-12 h-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Storage Dashboard</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                  Add cards to monitor PersistentVolumes, StorageClasses, and storage utilization across your clusters.
                </p>
                <button
                  onClick={() => setShowAddCard(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Cards
                </button>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={cards.map(c => c.id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    {cards.map(card => (
                      <SortableStorageCard
                        key={card.id}
                        card={card}
                        onConfigure={() => handleConfigureCard(card.id)}
                        onRemove={() => handleRemoveCard(card.id)}
                        onWidthChange={(newWidth) => handleWidthChange(card.id, newWidth)}
                        isDragging={activeId === card.id}
                        isRefreshing={isRefreshing}
                        onRefresh={triggerRefresh}
                        lastUpdated={lastUpdated}
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeId ? (
                    <div className="opacity-80 rotate-3 scale-105">
                      <StorageDragPreviewCard card={cards.find(c => c.id === activeId)!} />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </>
        )}
      </div>

      {/* Floating action buttons */}
      <FloatingDashboardActions
        onAddCard={() => setShowAddCard(true)}
        onOpenTemplates={() => setShowTemplates(true)}
        onResetToDefaults={reset}
        isCustomized={isCustomized}
      />

      {/* Add Card Modal */}
      <AddCardModal
        isOpen={showAddCard}
        onClose={() => setShowAddCard(false)}
        onAddCards={handleAddCards}
        existingCardTypes={cards.map(c => c.card_type)}
      />

      {/* Templates Modal */}
      <TemplatesModal
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        onApplyTemplate={applyTemplate}
      />

      {/* Configure Card Modal */}
      <ConfigureCardModal
        isOpen={!!configuringCard}
        card={configureCardData}
        onClose={() => setConfiguringCard(null)}
        onSave={handleSaveCardConfig}
      />

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
    </div>
  )
}
