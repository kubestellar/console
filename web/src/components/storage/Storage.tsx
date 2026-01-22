import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { HardDrive, Database, Plus, LayoutGrid, ChevronDown, ChevronRight, RefreshCw, Hourglass, X, ExternalLink, GripVertical } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useClusters, usePVCs, PVC } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useShowCards } from '../../hooks/useShowCards'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { StatsOverview, StatBlockValue } from '../ui/StatsOverview'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../cards/cardRegistry'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { ConfigureCardModal } from '../dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { DashboardTemplate } from '../dashboard/templates'
import { ClusterBadge } from '../ui/ClusterBadge'
import { formatCardTitle } from '../../lib/formatCardTitle'

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass rounded-lg w-[800px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Database className={`w-5 h-5 ${statusFilter === 'Bound' ? 'text-green-400' : statusFilter === 'Pending' ? 'text-yellow-400' : 'text-blue-400'}`} />
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <span className="px-2 py-0.5 text-xs rounded-full bg-secondary text-muted-foreground">
              {filteredPVCs.length} PVC{filteredPVCs.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-border">
          <input
            type="text"
            placeholder="Search by name, namespace, cluster, or storage class..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* PVC List */}
        <div className="flex-1 overflow-y-auto p-4">
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
        </div>
      </div>
    </div>
  )
}

interface StorageCard {
  id: string
  card_type: string
  config: Record<string, unknown>
  title?: string
  position?: { w: number; h: number }
}

const STORAGE_CARDS_KEY = 'kubestellar-storage-cards'

// Default cards for the storage dashboard
const DEFAULT_STORAGE_CARDS: StorageCard[] = [
  { id: 'default-storage-overview', card_type: 'storage_overview', title: 'Storage Overview', config: {}, position: { w: 4, h: 3 } },
  { id: 'default-pvc-status', card_type: 'pvc_status', title: 'PVC Status', config: {}, position: { w: 8, h: 3 } },
]

function loadStorageCards(): StorageCard[] {
  try {
    const stored = localStorage.getItem(STORAGE_CARDS_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Fall through to return defaults
  }
  return DEFAULT_STORAGE_CARDS
}

function saveStorageCards(cards: StorageCard[]) {
  localStorage.setItem(STORAGE_CARDS_KEY, JSON.stringify(cards))
}

// Sortable card component with drag handle
interface SortableStorageCardProps {
  card: StorageCard
  onConfigure: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  isDragging: boolean
}

const SortableStorageCard = memo(function SortableStorageCard({
  card,
  onConfigure,
  onRemove,
  onWidthChange,
  isDragging,
}: SortableStorageCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card.id })

  const cardWidth = card.position?.w || 4
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: `span ${cardWidth}`,
    opacity: isDragging ? 0.5 : 1,
  }

  const CardComponent = CARD_COMPONENTS[card.card_type]
  if (!CardComponent) {
    console.warn(`Unknown card type: ${card.card_type}`)
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
function StorageDragPreviewCard({ card }: { card: StorageCard }) {
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
  const { clusters, isLoading, isRefreshing, lastUpdated, refetch } = useClusters()
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
  } = useGlobalFilters()
  const { pvcs } = usePVCs()
  const { drillToPVC, drillToResources } = useDrillDownActions()

  // Card state
  const [cards, setCards] = useState<StorageCard[]>(() => loadStorageCards())
  // Stats collapsed state is now managed by StatsOverview component
  const { showCards, setShowCards, expandCards } = useShowCards('kubestellar-storage')
  const [showAddCard, setShowAddCard] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [configuringCard, setConfiguringCard] = useState<StorageCard | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  // PVC List Modal state
  const [showPVCModal, setShowPVCModal] = useState(false)
  const [pvcModalFilter, setPVCModalFilter] = useState<'Bound' | 'Pending' | 'all'>('all')
  const [activeId, setActiveId] = useState<string | null>(null)

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (over && active.id !== over.id) {
      setCards((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  // Combined loading/refreshing states (useClusters has shared cache so data persists)
  const isFetching = isLoading || isRefreshing
  // Only show skeletons when we have no data yet
  const showSkeletons = clusters.length === 0 && isLoading

  // Save cards to localStorage when they change
  useEffect(() => {
    saveStorageCards(cards)
  }, [cards])

  // Handle addCard URL param - open modal and clear param
  useEffect(() => {
    if (searchParams.get('addCard') === 'true') {
      setShowAddCard(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Trigger refresh when navigating to this page (location.key changes on each navigation)
  useEffect(() => {
    refetch()
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      refetch()
    }, 30000)

    return () => clearInterval(interval)
  }, [autoRefresh, refetch])

  const handleRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  const handleAddCards = useCallback((newCards: Array<{ type: string; title: string; config: Record<string, unknown> }>) => {
    const cardsToAdd: StorageCard[] = newCards.map(card => ({
      id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      card_type: card.type,
      config: card.config,
      title: card.title,
    }))
    setCards(prev => [...prev, ...cardsToAdd])
    expandCards()
    setShowAddCard(false)
  }, [expandCards])

  const handleRemoveCard = useCallback((cardId: string) => {
    setCards(prev => prev.filter(c => c.id !== cardId))
  }, [])

  const handleConfigureCard = useCallback((cardId: string) => {
    const card = cards.find(c => c.id === cardId)
    if (card) setConfiguringCard(card)
  }, [cards])

  const handleSaveCardConfig = useCallback((cardId: string, config: Record<string, unknown>) => {
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, config } : c
    ))
    setConfiguringCard(null)
  }, [])

  const handleWidthChange = useCallback((cardId: string, newWidth: number) => {
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, position: { ...(c.position || { w: 4, h: 2 }), w: newWidth } } : c
    ))
  }, [])

  const applyTemplate = useCallback((template: DashboardTemplate) => {
    const newCards: StorageCard[] = template.cards.map(card => ({
      id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      card_type: card.card_type,
      config: card.config || {},
      title: card.title,
    }))
    setCards(newCards)
    expandCards()
    setShowTemplates(false)
  }, [])

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
  const getStatValue = useCallback((blockId: string): StatBlockValue => {
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
        return { value: '-', sublabel: 'storage classes', isClickable: false }
      default:
        return { value: '-', sublabel: '' }
    }
  }, [stats, hasDataToShow, formatStorage, formatStatValue, drillToResources, setPVCModalFilter, setShowPVCModal])

  // Transform card for ConfigureCardModal
  const configureCard = configuringCard ? {
    id: configuringCard.id,
    card_type: configuringCard.card_type,
    config: configuringCard.config,
    title: configuringCard.title,
  } : null

  return (
    <div className="pt-16">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <HardDrive className="w-6 h-6 text-purple-400" />
                Storage
              </h1>
              <p className="text-muted-foreground">Monitor storage resources across clusters</p>
            </div>
            {isRefreshing && (
              <span className="flex items-center gap-1 text-xs text-amber-400 animate-pulse" title="Updating...">
                <Hourglass className="w-3 h-3" />
                <span>Updating</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="storage-auto-refresh" className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground" title="Auto-refresh every 30s">
              <input
                type="checkbox"
                id="storage-auto-refresh"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-border w-3.5 h-3.5"
              />
              Auto
            </label>
            <button
              onClick={handleRefresh}
              disabled={isFetching}
              className="p-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Overview - configurable */}
      <StatsOverview
        dashboardType="storage"
        getStatValue={getStatValue}
        hasData={hasDataToShow}
        isLoading={showSkeletons}
        lastUpdated={lastUpdated}
        collapsedStorageKey="kubestellar-storage-stats-collapsed"
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
                  <div className="grid grid-cols-12 gap-4">
                    {cards.map(card => (
                      <SortableStorageCard
                        key={card.id}
                        card={card}
                        onConfigure={() => handleConfigureCard(card.id)}
                        onRemove={() => handleRemoveCard(card.id)}
                        onWidthChange={(newWidth) => handleWidthChange(card.id, newWidth)}
                        isDragging={activeId === card.id}
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
        card={configureCard}
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
