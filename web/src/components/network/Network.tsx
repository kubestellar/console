import { useEffect, useCallback, memo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Globe, Plus, LayoutGrid, ChevronDown, ChevronRight, GripVertical, AlertCircle } from 'lucide-react'
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
import { useServices } from '../../hooks/useMCP'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { UnifiedStatsSection, NETWORK_STATS_CONFIG } from '../../lib/unified/stats'
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
import { useMobile } from '../../hooks/useMobile'

const NETWORK_CARDS_KEY = 'kubestellar-network-cards'

// Default cards for the network dashboard
const DEFAULT_NETWORK_CARDS = [
  { type: 'network_overview', title: 'Network Overview', position: { w: 4, h: 3 } },
  { type: 'service_status', title: 'Service Status', position: { w: 8, h: 3 } },
  { type: 'cluster_network', title: 'Cluster Network', position: { w: 6, h: 2 } },
]

// Sortable card component with drag handle
interface SortableNetworkCardProps {
  card: DashboardCard
  onConfigure: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  isDragging: boolean
  isRefreshing?: boolean
  onRefresh?: () => void
  lastUpdated?: Date | null
}

const SortableNetworkCard = memo(function SortableNetworkCard({
  card,
  onConfigure,
  onRemove,
  onWidthChange,
  isDragging,
  isRefreshing,
  onRefresh,
  lastUpdated,
}: SortableNetworkCardProps) {
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
function NetworkDragPreviewCard({ card }: { card: DashboardCard }) {
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

export function Network() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { services, isLoading: servicesLoading, isRefreshing: servicesRefreshing, lastUpdated, refetch, error } = useServices()
  const { showIndicator, triggerRefresh } = useRefreshIndicator(refetch)
  const isRefreshing = servicesRefreshing || showIndicator

  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
  } = useGlobalFilters()
  const { drillToService } = useDrillDownActions()
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
    storageKey: NETWORK_CARDS_KEY,
    defaultCards: DEFAULT_NETWORK_CARDS,
    onRefresh: refetch,
  })

  // Show loading spinner when fetching (initial or refresh)
  const isFetching = servicesLoading || isRefreshing || showIndicator
  // Only show skeletons when we have no data yet
  const showSkeletons = services.length === 0 && servicesLoading

  // Handle addCard URL param - open modal and clear param
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

  // Filter services based on global cluster selection
  const filteredServices = services.filter(s =>
    isAllClustersSelected || (s.cluster && globalSelectedClusters.includes(s.cluster))
  )

  // Calculate service stats
  const loadBalancers = filteredServices.filter(s => s.type === 'LoadBalancer').length
  const nodePortServices = filteredServices.filter(s => s.type === 'NodePort').length
  const clusterIPServices = filteredServices.filter(s => s.type === 'ClusterIP').length

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    const drillToFirstService = () => {
      if (filteredServices.length > 0 && filteredServices[0]) {
        drillToService(filteredServices[0].cluster || 'default', filteredServices[0].namespace || 'default', filteredServices[0].name)
      }
    }
    const drillToLoadBalancer = () => {
      const svc = filteredServices.find(s => s.type === 'LoadBalancer')
      if (svc) drillToService(svc.cluster || 'default', svc.namespace || 'default', svc.name)
    }
    const drillToNodePort = () => {
      const svc = filteredServices.find(s => s.type === 'NodePort')
      if (svc) drillToService(svc.cluster || 'default', svc.namespace || 'default', svc.name)
    }
    const drillToClusterIP = () => {
      const svc = filteredServices.find(s => s.type === 'ClusterIP')
      if (svc) drillToService(svc.cluster || 'default', svc.namespace || 'default', svc.name)
    }

    switch (blockId) {
      case 'services':
        return { value: filteredServices.length, sublabel: 'total services', onClick: drillToFirstService, isClickable: filteredServices.length > 0 }
      case 'loadbalancers':
        return { value: loadBalancers, sublabel: 'external access', onClick: drillToLoadBalancer, isClickable: loadBalancers > 0 }
      case 'nodeport':
        return { value: nodePortServices, sublabel: 'node-level access', onClick: drillToNodePort, isClickable: nodePortServices > 0 }
      case 'clusterip':
        return { value: clusterIPServices, sublabel: 'internal only', onClick: drillToClusterIP, isClickable: clusterIPServices > 0 }
      case 'ingresses':
        return { value: '-', sublabel: 'ingresses', isClickable: false }
      case 'endpoints':
        return { value: filteredServices.length, sublabel: 'endpoints', isClickable: false }
      default:
        return { value: '-', sublabel: '' }
    }
  }, [filteredServices, loadBalancers, nodePortServices, clusterIPServices, drillToService])

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
        title="Network"
        subtitle="Monitor network resources across clusters"
        icon={<Globe className="w-6 h-6 text-purple-400" />}
        isFetching={isFetching}
        onRefresh={triggerRefresh}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="network-auto-refresh"
        lastUpdated={lastUpdated}
      />

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">Error loading network data</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Stats Overview - configurable */}
      <UnifiedStatsSection
        config={NETWORK_STATS_CONFIG}
        getStatValue={getStatValue}
        hasData={services.length > 0 || !showSkeletons}
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
            <span>Network Cards ({cards.length})</span>
            {showCards ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Cards grid */}
        {showCards && (
          <>
            {cards.length === 0 ? (
              <div className="glass p-8 rounded-lg border-2 border-dashed border-border/50 text-center">
                <div className="flex justify-center mb-4">
                  <Globe className="w-12 h-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Network Dashboard</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                  Add cards to monitor Ingresses, NetworkPolicies, and service mesh configurations across your clusters.
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
                      <SortableNetworkCard
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
                      <NetworkDragPreviewCard card={cards.find(c => c.id === activeId)!} />
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
