import { useState, useEffect, useCallback, memo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Rocket, RefreshCw, Hourglass, GripVertical, ChevronDown, ChevronRight, Plus, LayoutGrid } from 'lucide-react'
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
import { useDeployments, useDeploymentIssues, usePodIssues, useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useShowCards } from '../../hooks/useShowCards'
import { useDashboardReset } from '../../hooks/useDashboardReset'
import { StatsOverview, StatBlockValue } from '../ui/StatsOverview'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../cards/cardRegistry'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { ConfigureCardModal } from '../dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { DashboardTemplate } from '../dashboard/templates'
import { formatCardTitle } from '../../lib/formatCardTitle'

interface DeploymentsCard {
  id: string
  card_type: string
  config: Record<string, unknown>
  title?: string
  position?: { w: number; h: number }
}

const DEPLOYMENTS_CARDS_KEY = 'kubestellar-deployments-cards'

// Default cards for the deployments dashboard
const DEFAULT_DEPLOYMENTS_CARDS: DeploymentsCard[] = [
  { id: 'default-deployment-status', card_type: 'deployment_status', title: 'Deployment Status', config: {}, position: { w: 6, h: 3 } },
  { id: 'default-deployment-progress', card_type: 'deployment_progress', title: 'Deployment Progress', config: {}, position: { w: 6, h: 3 } },
  { id: 'default-deployment-issues', card_type: 'deployment_issues', title: 'Deployment Issues', config: {}, position: { w: 6, h: 3 } },
  { id: 'default-app-status', card_type: 'app_status', title: 'Workload Status', config: {}, position: { w: 6, h: 3 } },
]

function loadDeploymentsCards(): DeploymentsCard[] {
  try {
    const stored = localStorage.getItem(DEPLOYMENTS_CARDS_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Fall through to return defaults
  }
  return DEFAULT_DEPLOYMENTS_CARDS
}

function saveDeploymentsCards(cards: DeploymentsCard[]) {
  localStorage.setItem(DEPLOYMENTS_CARDS_KEY, JSON.stringify(cards))
}

// Sortable card component with drag handle
interface SortableDeploymentsCardProps {
  card: DeploymentsCard
  onConfigure: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  isDragging: boolean
}

const SortableDeploymentsCard = memo(function SortableDeploymentsCard({
  card,
  onConfigure,
  onRemove,
  onWidthChange,
  isDragging,
}: SortableDeploymentsCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card.id })

  const cardWidth = card.position?.w || 6
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
function DeploymentsDragPreviewCard({ card }: { card: DeploymentsCard }) {
  const cardWidth = card.position?.w || 6
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

export function Deployments() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { deployments, isLoading, isRefreshing, lastUpdated, refetch } = useDeployments()
  const { issues: deploymentIssues, refetch: refetchIssues } = useDeploymentIssues()
  const { issues: podIssues } = usePodIssues()
  const { clusters: _clusters } = useClusters()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Card state
  const [cards, setCards] = useState<DeploymentsCard[]>(() => loadDeploymentsCards())
  const { showCards, setShowCards, expandCards } = useShowCards('kubestellar-deployments')
  const [showAddCard, setShowAddCard] = useState(false)

  // Reset functionality using shared hook
  const { isCustomized, setCustomized, reset } = useDashboardReset({
    storageKey: DEPLOYMENTS_CARDS_KEY,
    defaultCards: DEFAULT_DEPLOYMENTS_CARDS,
    setCards,
    cards,
  })
  const [showTemplates, setShowTemplates] = useState(false)
  const [configuringCard, setConfiguringCard] = useState<DeploymentsCard | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
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

  // Save cards to localStorage when they change
  useEffect(() => {
    saveDeploymentsCards(cards)
    setCustomized(true)
  }, [cards, setCustomized])

  // Handle addCard URL param
  useEffect(() => {
    if (searchParams.get('addCard') === 'true') {
      setShowAddCard(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      refetch()
      refetchIssues()
    }, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh, refetch, refetchIssues])

  const handleRefresh = useCallback(() => {
    refetch()
    refetchIssues()
  }, [refetch, refetchIssues])

  const handleAddCards = useCallback((newCards: Array<{ type: string; title: string; config: Record<string, unknown> }>) => {
    const cardsToAdd: DeploymentsCard[] = newCards.map(card => ({
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
      c.id === cardId ? { ...c, position: { ...(c.position || { w: 6, h: 2 }), w: newWidth } } : c
    ))
  }, [])

  const applyTemplate = useCallback((template: DashboardTemplate) => {
    const newCards: DeploymentsCard[] = template.cards.map(card => ({
      id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      card_type: card.card_type,
      config: card.config || {},
      title: card.title,
    }))
    setCards(newCards)
    expandCards()
    setShowTemplates(false)
  }, [expandCards])

  // Filter deployments based on global selection
  const filteredDeployments = deployments.filter(d =>
    isAllClustersSelected || (d.cluster && globalSelectedClusters.includes(d.cluster))
  )

  // Calculate current stats
  const currentTotalDeployments = filteredDeployments.length
  const currentHealthyDeployments = filteredDeployments.filter(d => d.readyReplicas === d.replicas && d.replicas > 0).length
  const currentIssueCount = deploymentIssues.length

  // Cache stats to prevent showing 0 during refresh
  const cachedStats = useRef({ total: 0, healthy: 0, issues: 0 })
  useEffect(() => {
    if (currentTotalDeployments > 0) {
      cachedStats.current = {
        total: currentTotalDeployments,
        healthy: currentHealthyDeployments,
        issues: currentIssueCount,
      }
    }
  }, [currentTotalDeployments, currentHealthyDeployments, currentIssueCount])

  // Use cached values if current values are 0 (during refresh)
  const totalDeployments = currentTotalDeployments > 0 ? currentTotalDeployments : cachedStats.current.total
  const healthyDeployments = currentTotalDeployments > 0 ? currentHealthyDeployments : cachedStats.current.healthy
  const issueCount = currentTotalDeployments > 0 ? currentIssueCount : cachedStats.current.issues

  // Stats value getter for the configurable StatsOverview component
  const getStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'namespaces':
        return { value: totalDeployments, sublabel: 'total deployments' }
      case 'healthy':
        return { value: healthyDeployments, sublabel: 'healthy' }
      case 'warning':
        return { value: Math.max(0, totalDeployments - healthyDeployments - issueCount), sublabel: 'degraded' }
      case 'critical':
        return { value: issueCount, sublabel: 'with issues' }
      case 'deployments':
        return { value: totalDeployments, sublabel: 'deployments' }
      case 'pod_issues':
        return { value: podIssues.length, sublabel: 'pod issues' }
      case 'deployment_issues':
        return { value: issueCount, sublabel: 'deploy issues' }
      default:
        return { value: 0 }
    }
  }, [totalDeployments, healthyDeployments, issueCount, podIssues.length])

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
                <Rocket className="w-6 h-6 text-purple-400" />
                Deployments
              </h1>
              <p className="text-muted-foreground">Monitor deployment health and rollout status</p>
            </div>
            {isRefreshing && (
              <span className="flex items-center gap-1 text-xs text-amber-400 animate-pulse" title="Updating...">
                <Hourglass className="w-3 h-3" />
                <span>Updating</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="deployments-auto-refresh" className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground" title="Auto-refresh every 30s">
              <input
                type="checkbox"
                id="deployments-auto-refresh"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-border w-3.5 h-3.5"
              />
              Auto
            </label>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <StatsOverview
        dashboardType="workloads"
        getStatValue={getStatValue}
        hasData={totalDeployments > 0}
        isLoading={isLoading}
        lastUpdated={lastUpdated}
        collapsedStorageKey="kubestellar-deployments-stats-collapsed"
      />

      {/* Dashboard Cards Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setShowCards(!showCards)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Deployment Cards ({cards.length})</span>
            {showCards ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {showCards && (
          <>
            {cards.length === 0 ? (
              <div className="glass p-8 rounded-lg border-2 border-dashed border-border/50 text-center">
                <div className="flex justify-center mb-4">
                  <Rocket className="w-12 h-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Deployments Dashboard</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                  Add cards to monitor deployment health, rollout progress, and issues across your clusters.
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
                      <SortableDeploymentsCard
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
                      <DeploymentsDragPreviewCard card={cards.find(c => c.id === activeId)!} />
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
        onReset={reset}
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
        card={configureCard}
        onClose={() => setConfiguringCard(null)}
        onSave={handleSaveCardConfig}
      />
    </div>
  )
}
