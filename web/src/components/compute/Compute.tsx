import { useEffect, useCallback, useRef, memo } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { Cpu, Plus, LayoutGrid, ChevronDown, ChevronRight, RefreshCw, Hourglass, GripVertical } from 'lucide-react'
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
import { useClusters, useGPUNodes } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../cards/cardRegistry'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { ConfigureCardModal } from '../dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { DashboardTemplate } from '../dashboard/templates'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { StatsOverview, StatBlockValue } from '../ui/StatsOverview'
import { useDashboard, DashboardCard } from '../../lib/dashboards'

const COMPUTE_CARDS_KEY = 'kubestellar-compute-cards'

// Default cards for the compute dashboard
const DEFAULT_COMPUTE_CARDS = [
  { type: 'compute_overview', title: 'Compute Overview', position: { w: 4, h: 3 } },
  { type: 'resource_usage', title: 'Resource Usage', position: { w: 4, h: 2 } },
  { type: 'resource_capacity', title: 'Resource Capacity', position: { w: 4, h: 2 } },
  { type: 'cluster_metrics', title: 'Cluster Metrics', position: { w: 4, h: 2 } },
  { type: 'top_pods', title: 'Top Resource Consumers', position: { w: 8, h: 3 } },
]

// Sortable card component with drag handle
interface SortableComputeCardProps {
  card: DashboardCard
  onConfigure: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  isDragging: boolean
}

const SortableComputeCard = memo(function SortableComputeCard({
  card,
  onConfigure,
  onRemove,
  onWidthChange,
  isDragging,
}: SortableComputeCardProps) {
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
function ComputeDragPreviewCard({ card }: { card: DashboardCard }) {
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

export function Compute() {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const { clusters, isLoading, isRefreshing, lastUpdated, refetch } = useClusters()
  const { nodes: gpuNodes } = useGPUNodes()
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
  } = useGlobalFilters()
  const { drillToResources } = useDrillDownActions()

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
    storageKey: COMPUTE_CARDS_KEY,
    defaultCards: DEFAULT_COMPUTE_CARDS,
    onRefresh: refetch,
  })

  // Combined loading/refreshing states (useClusters has shared cache so data persists)
  const isFetching = isLoading || isRefreshing
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

  const handleRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  const handleAddCards = useCallback((newCards: Array<{ type: string; title: string; config: Record<string, unknown> }>) => {
    addCards(newCards)
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

  // Calculate compute stats from clusters (only from reachable clusters)
  // Clusters with reachable !== false are considered (includes undefined during refresh)
  const reachableClusters = filteredClusters.filter(c => c.reachable !== false)
  const currentStats = {
    totalCPUs: reachableClusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0),
    totalMemoryGB: reachableClusters.reduce((sum, c) => sum + (c.memoryGB || 0), 0),
    totalNodes: reachableClusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0),
    totalPods: reachableClusters.reduce((sum, c) => sum + (c.podCount || 0), 0),
    totalGPUs: gpuNodes
      .filter(node => isAllClustersSelected || globalSelectedClusters.includes(node.cluster.split('/')[0]))
      .reduce((sum, node) => sum + node.gpuCount, 0),
  }

  // Check if we have any reachable clusters with actual data (not refreshing)
  const hasActualData = filteredClusters.some(c =>
    c.reachable !== false && c.nodeCount !== undefined && c.nodeCount > 0
  )

  // Cache the last known good stats to show during refresh
  const cachedStats = useRef(currentStats)

  // Update cache when we have real data (not all zeros during refresh)
  useEffect(() => {
    if (hasActualData && (currentStats.totalNodes > 0 || currentStats.totalCPUs > 0)) {
      cachedStats.current = currentStats
    }
  }, [hasActualData, currentStats.totalNodes, currentStats.totalCPUs, currentStats.totalMemoryGB, currentStats.totalPods, currentStats.totalGPUs])

  // Use cached stats during refresh, current stats when data is available
  // Show dash only when we've never had data (initial state with no clusters)
  const stats = (hasActualData || cachedStats.current.totalNodes > 0)
    ? (hasActualData ? currentStats : cachedStats.current)
    : null

  // Determine if we should show data or dashes
  const hasDataToShow = stats !== null

  // Format memory size - returns '-' if no data
  const formatMemory = (gb: number, hasData = true) => {
    if (!hasData) return '-'
    const safeValue = Math.max(0, gb) // Never show negative
    if (safeValue >= 1024) {
      return `${(safeValue / 1024).toFixed(1)} TB`
    }
    return `${Math.round(safeValue)} GB`
  }

  // Format stat - returns '-' if no data available
  const formatStatValue = (value: number, hasData = true) => {
    if (!hasData) return '-'
    return Math.max(0, value) // Never show negative
  }

  // Calculate utilization from available data
  const cpuUtilization = (() => {
    const totalCPU = reachableClusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0)
    const requestedCPU = reachableClusters.reduce((sum, c) => sum + (c.cpuRequestsCores || 0), 0)
    return totalCPU > 0 ? Math.round((requestedCPU / totalCPU) * 100) : 0
  })()

  const memoryUtilization = (() => {
    const totalMemory = reachableClusters.reduce((sum, c) => sum + (c.memoryGB || 0), 0)
    const requestedMemory = reachableClusters.reduce((sum, c) => sum + (c.memoryRequestsGB || 0), 0)
    return totalMemory > 0 ? Math.round((requestedMemory / totalMemory) * 100) : 0
  })()

  // Stats value getter for the configurable StatsOverview component
  const getStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'nodes':
        return { value: formatStatValue(stats?.totalNodes || 0, hasDataToShow), sublabel: 'total nodes', onClick: drillToResources, isClickable: hasDataToShow }
      case 'cpus':
        return { value: formatStatValue(stats?.totalCPUs || 0, hasDataToShow), sublabel: 'cores allocatable', onClick: drillToResources, isClickable: hasDataToShow }
      case 'memory':
        return { value: formatMemory(stats?.totalMemoryGB || 0, hasDataToShow), sublabel: 'allocatable', onClick: drillToResources, isClickable: hasDataToShow }
      case 'gpus':
        return { value: formatStatValue(stats?.totalGPUs || 0, hasDataToShow), sublabel: 'total GPUs', onClick: drillToResources, isClickable: hasDataToShow }
      case 'tpus':
        return { value: 0, sublabel: 'total TPUs', onClick: drillToResources, isClickable: hasDataToShow }
      case 'pods':
        return { value: formatStatValue(stats?.totalPods || 0, hasDataToShow), sublabel: 'running pods', onClick: drillToResources, isClickable: hasDataToShow }
      case 'cpu_util':
        return { value: hasDataToShow ? `${cpuUtilization}%` : '-', sublabel: 'average', onClick: drillToResources, isClickable: hasDataToShow }
      case 'memory_util':
        return { value: hasDataToShow ? `${memoryUtilization}%` : '-', sublabel: 'average', onClick: drillToResources, isClickable: hasDataToShow }
      default:
        return { value: '-', sublabel: '' }
    }
  }, [stats, hasDataToShow, cpuUtilization, memoryUtilization, drillToResources])

  // Transform card for ConfigureCardModal
  const configureCardData = configuringCard ? {
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
                <Cpu className="w-6 h-6 text-purple-400" />
                Compute
              </h1>
              <p className="text-muted-foreground">Monitor compute resources across clusters</p>
            </div>
            {isRefreshing && (
              <span className="flex items-center gap-1 text-xs text-amber-400 animate-pulse" title="Updating...">
                <Hourglass className="w-3 h-3" />
                <span>Updating</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="compute-auto-refresh" className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground" title="Auto-refresh every 30s">
              <input
                type="checkbox"
                id="compute-auto-refresh"
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
        dashboardType="compute"
        getStatValue={getStatValue}
        hasData={hasDataToShow}
        isLoading={showSkeletons}
        lastUpdated={lastUpdated}
        collapsedStorageKey="kubestellar-compute-stats-collapsed"
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
            <span>Compute Cards ({cards.length})</span>
            {showCards ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Cards grid */}
        {showCards && (
          <>
            {cards.length === 0 ? (
              <div className="glass p-8 rounded-lg border-2 border-dashed border-border/50 text-center">
                <div className="flex justify-center mb-4">
                  <Cpu className="w-12 h-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Compute Dashboard</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                  Add cards to monitor CPU and memory utilization, node health, and resource quotas across your clusters.
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
                      <SortableComputeCard
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
                      <ComputeDragPreviewCard card={cards.find(c => c.id === activeId)!} />
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
    </div>
  )
}
