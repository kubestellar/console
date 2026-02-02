import { useEffect, useCallback, memo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Server, GripVertical, ChevronDown, ChevronRight, Plus, LayoutGrid, AlertCircle } from 'lucide-react'
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
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { UnifiedStatsSection, COMPUTE_STATS_CONFIG } from '../../lib/unified/stats'
import type { StatBlockValue } from '../ui/StatsOverview'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../cards/cardRegistry'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { ConfigureCardModal } from '../dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { DashboardTemplate } from '../dashboard/templates'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { useDashboard, DashboardCard } from '../../lib/dashboards'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { DashboardHeader } from '../shared/DashboardHeader'
import { useMobile } from '../../hooks/useMobile'

const NODES_CARDS_KEY = 'kubestellar-nodes-cards'

// Default cards for the nodes dashboard
const DEFAULT_NODES_CARDS = [
  { type: 'cluster_health', title: 'Cluster Health', position: { w: 4, h: 3 } },
  { type: 'compute_overview', title: 'Compute Overview', position: { w: 4, h: 3 } },
  { type: 'resource_capacity', title: 'Resource Capacity', position: { w: 4, h: 3 } },
  { type: 'resource_usage', title: 'Resource Usage', position: { w: 6, h: 3 } },
  { type: 'cluster_metrics', title: 'Cluster Metrics', position: { w: 6, h: 3 } },
]

// Sortable card component with drag handle
interface SortableNodesCardProps {
  card: DashboardCard
  onConfigure: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  isDragging: boolean
  isRefreshing?: boolean
  onRefresh?: () => void
  lastUpdated?: Date | null
}

const SortableNodesCard = memo(function SortableNodesCard({
  card,
  onConfigure,
  onRemove,
  onWidthChange,
  isDragging,
  isRefreshing,
  onRefresh,
  lastUpdated,
}: SortableNodesCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card.id })
  const { isMobile } = useMobile()

  const cardWidth = card.position?.w || 4
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: isMobile ? 'span 1' : `span ${cardWidth}`,
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
function NodesDragPreviewCard({ card }: { card: DashboardCard }) {
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

export function Nodes() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch, error: clustersError } = useClusters()
  const { showIndicator, triggerRefresh } = useRefreshIndicator(refetch)
  const isRefreshing = dataRefreshing || showIndicator
  const isFetching = isLoading || isRefreshing || showIndicator
  const { nodes: gpuNodes, error: nodesError } = useGPUNodes()
  const error = clustersError || nodesError
  const { drillToNode: _drillToNode, drillToAllNodes, drillToAllGPU, drillToAllPods, drillToAllClusters } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()

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
    storageKey: NODES_CARDS_KEY,
    defaultCards: DEFAULT_NODES_CARDS,
    onRefresh: refetch,
  })

  // Handle addCard URL param
  useEffect(() => {
    if (searchParams.get('addCard') === 'true') {
      setShowAddCard(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, setShowAddCard])

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
  const reachableClusters = filteredClusters.filter(c => c.reachable !== false)

  // Calculate stats
  const totalNodes = reachableClusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0)
  const totalCPU = reachableClusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0)
  const totalMemoryGB = reachableClusters.reduce((sum, c) => sum + (c.memoryGB || 0), 0)
  const totalPods = reachableClusters.reduce((sum, c) => sum + (c.podCount || 0), 0)
  // GPU count from GPU nodes
  const totalGPUs = gpuNodes
    .filter(node => isAllClustersSelected || globalSelectedClusters.includes(node.cluster.split('/')[0]))
    .reduce((sum, node) => sum + node.gpuCount, 0)

  // Calculate utilization from cluster data
  const currentCpuUtil = (() => {
    const requestedCPU = reachableClusters.reduce((sum, c) => sum + (c.cpuRequestsCores || 0), 0)
    return totalCPU > 0 ? Math.round((requestedCPU / totalCPU) * 100) : 0
  })()
  const currentMemoryUtil = (() => {
    const requestedMemory = reachableClusters.reduce((sum, c) => sum + (c.memoryRequestsGB || 0), 0)
    return totalMemoryGB > 0 ? Math.round((requestedMemory / totalMemoryGB) * 100) : 0
  })()

  // Cache utilization values to prevent showing 0 during refresh
  const cachedCpuUtil = useRef(currentCpuUtil)
  const cachedMemoryUtil = useRef(currentMemoryUtil)
  useEffect(() => {
    if (currentCpuUtil > 0) cachedCpuUtil.current = currentCpuUtil
    if (currentMemoryUtil > 0) cachedMemoryUtil.current = currentMemoryUtil
  }, [currentCpuUtil, currentMemoryUtil])
  const cpuUtilization = currentCpuUtil > 0 ? currentCpuUtil : cachedCpuUtil.current
  const memoryUtilization = currentMemoryUtil > 0 ? currentMemoryUtil : cachedMemoryUtil.current

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'nodes':
        return { value: totalNodes, sublabel: 'total nodes', onClick: () => drillToAllNodes(), isClickable: totalNodes > 0 }
      case 'cpus':
        return { value: totalCPU, sublabel: 'CPU cores', onClick: () => drillToAllNodes(), isClickable: totalCPU > 0 }
      case 'memory':
        return { value: `${totalMemoryGB.toFixed(0)} GB`, sublabel: 'memory', onClick: () => drillToAllNodes(), isClickable: totalMemoryGB > 0 }
      case 'gpus':
        return { value: totalGPUs, sublabel: 'GPUs', onClick: () => drillToAllGPU(), isClickable: totalGPUs > 0 }
      case 'tpus':
        return { value: 0, sublabel: 'TPUs', isClickable: false }
      case 'pods':
        return { value: totalPods, sublabel: 'pods', onClick: () => drillToAllPods(), isClickable: totalPods > 0 }
      case 'cpu_util':
        return { value: `${cpuUtilization}%`, sublabel: 'utilization', onClick: () => drillToAllNodes(), isClickable: cpuUtilization > 0 }
      case 'memory_util':
        return { value: `${memoryUtilization}%`, sublabel: 'utilization', onClick: () => drillToAllNodes(), isClickable: memoryUtilization > 0 }
      // Legacy IDs for backwards compatibility
      case 'clusters':
        return { value: reachableClusters.length, sublabel: 'clusters', onClick: () => drillToAllClusters(), isClickable: reachableClusters.length > 0 }
      case 'healthy':
        return { value: totalNodes, sublabel: 'total nodes', onClick: () => drillToAllNodes(), isClickable: totalNodes > 0 }
      default:
        return { value: 0 }
    }
  }, [reachableClusters, totalNodes, totalCPU, totalMemoryGB, totalPods, totalGPUs, cpuUtilization, memoryUtilization, drillToAllNodes, drillToAllGPU, drillToAllPods, drillToAllClusters])

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
        title="Nodes"
        subtitle="Monitor node health and resources across clusters"
        icon={<Server className="w-6 h-6 text-purple-400" />}
        isFetching={isFetching}
        onRefresh={triggerRefresh}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="nodes-auto-refresh"
        lastUpdated={lastUpdated}
      />

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">Error loading node data</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Stats Overview */}
      <UnifiedStatsSection
        config={COMPUTE_STATS_CONFIG}
        getStatValue={getStatValue}
        hasData={totalNodes > 0}
        isLoading={isLoading && clusters.length === 0}
        lastUpdated={lastUpdated}
      />

      {/* Dashboard Cards Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setShowCards(!showCards)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Node Cards ({cards.length})</span>
            {showCards ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {showCards && (
          <>
            {cards.length === 0 ? (
              <div className="glass p-8 rounded-lg border-2 border-dashed border-border/50 text-center">
                <div className="flex justify-center mb-4">
                  <Server className="w-12 h-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Nodes Dashboard</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                  Add cards to monitor node health, resource utilization, and capacity across your clusters.
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
                      <SortableNodesCard
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
                      <NodesDragPreviewCard card={cards.find(c => c.id === activeId)!} />
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
