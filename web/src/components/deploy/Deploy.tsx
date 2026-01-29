import { useEffect, useCallback, memo } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { Rocket, Plus, LayoutGrid, ChevronDown, ChevronRight, GripVertical, GitBranch, RefreshCw } from 'lucide-react'
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
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../cards/cardRegistry'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { ConfigureCardModal } from '../dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { DashboardTemplate } from '../dashboard/templates'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { useDashboard, DashboardCard } from '../../lib/dashboards'
import { useDeployments } from '../../hooks/useMCP'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'

const DEPLOY_CARDS_KEY = 'kubestellar-deploy-cards'

// Default cards for the deploy dashboard - deployment monitoring focused
const DEFAULT_DEPLOY_CARDS = [
  // Deployment Status
  { type: 'deployment_status', title: 'Deployment Status', position: { w: 6, h: 4 } },
  { type: 'deployment_progress', title: 'Deployment Progress', position: { w: 5, h: 4 } },
  { type: 'deployment_issues', title: 'Deployment Issues', position: { w: 6, h: 4 } },
  // GitOps
  { type: 'gitops_drift', title: 'GitOps Drift', position: { w: 6, h: 4 } },
  { type: 'argocd_applications', title: 'ArgoCD Applications', position: { w: 6, h: 4 } },
  { type: 'argocd_sync_status', title: 'ArgoCD Sync Status', position: { w: 6, h: 4 } },
  { type: 'argocd_health', title: 'ArgoCD Health', position: { w: 6, h: 4 } },
  // Helm
  { type: 'helm_release_status', title: 'Helm Releases', position: { w: 6, h: 4 } },
  { type: 'helm_history', title: 'Helm History', position: { w: 8, h: 4 } },
  { type: 'chart_versions', title: 'Chart Versions', position: { w: 6, h: 4 } },
  // Kustomize
  { type: 'kustomization_status', title: 'Kustomizations', position: { w: 6, h: 4 } },
  { type: 'overlay_comparison', title: 'Overlay Comparison', position: { w: 8, h: 4 } },
  // Workload Deployment
  { type: 'workload_deployment', title: 'Workload Deployment', position: { w: 6, h: 4 } },
  // Upgrade tracking
  { type: 'upgrade_status', title: 'Upgrade Status', position: { w: 4, h: 4 } },
]

// Sortable card component with drag handle
interface SortableDeployCardProps {
  card: DashboardCard
  onConfigure: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  isDragging: boolean
  isRefreshing?: boolean
  onRefresh?: () => void
  lastUpdated?: Date | null
}

const SortableDeployCard = memo(function SortableDeployCard({
  card,
  onConfigure,
  onRemove,
  onWidthChange,
  isDragging,
  isRefreshing,
  onRefresh,
  lastUpdated,
}: SortableDeployCardProps) {
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
function DeployDragPreviewCard({ card }: { card: DashboardCard }) {
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

export function Deploy() {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const { isLoading: deploymentsLoading, isRefreshing: deploymentsRefreshing, lastUpdated, refetch } = useDeployments()
  const { showIndicator, triggerRefresh } = useRefreshIndicator(refetch)

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
    storageKey: DEPLOY_CARDS_KEY,
    defaultCards: DEFAULT_DEPLOY_CARDS,
    onRefresh: refetch,
  })

  const isRefreshing = deploymentsRefreshing || showIndicator
  const isFetching = deploymentsLoading || isRefreshing || showIndicator

  // Handle addCard URL param - open modal and clear param
  useEffect(() => {
    if (searchParams.get('addCard') === 'true') {
      setShowAddCard(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, setShowAddCard])

  // Track location for any navigation effects
  useEffect(() => {
    // Could add analytics or other effects here
  }, [location.key])

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
      <DashboardHeader
        title="KubeStellar Deploy"
        subtitle="Monitor deployments, GitOps, and Helm releases across clusters"
        icon={<Rocket className="w-6 h-6 text-blue-400" />}
        isFetching={isFetching}
        onRefresh={triggerRefresh}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="deploy-auto-refresh"
        lastUpdated={lastUpdated}
      />

      {/* Deploy Stats Banner */}
      <div className="mb-6 glass rounded-lg p-4 border border-blue-500/20 bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-green-500/10">
        <div className="flex items-center justify-center gap-8 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <Rocket className="w-5 h-5 text-blue-400" />
            <span className="text-muted-foreground">Deployment Cards:</span>
            <span className="font-bold text-blue-400">{cards.length}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <GitBranch className="w-5 h-5 text-green-400" />
            <span className="text-muted-foreground">GitOps:</span>
            <span className="font-bold text-green-400">ArgoCD + Flux</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <RefreshCw className="w-5 h-5 text-cyan-400" />
            <span className="text-muted-foreground">Focus:</span>
            <span className="font-bold text-cyan-400">Continuous Deployment</span>
          </div>
        </div>
      </div>

      {/* Dashboard Cards Section */}
      <div className="mb-6">
        {/* Card section header with toggle */}
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

        {/* Cards grid */}
        {showCards && (
          <>
            {cards.length === 0 ? (
              <div className="glass p-8 rounded-lg border-2 border-dashed border-blue-500/30 text-center">
                <div className="flex justify-center mb-4">
                  <Rocket className="w-12 h-12 text-blue-400" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Deployment Dashboard</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                  Add deployment monitoring cards! Track GitOps status, Helm releases, ArgoCD applications, and deployment health.
                </p>
                <button
                  onClick={() => setShowAddCard(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg transition-colors"
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
                      <SortableDeployCard
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
                      <DeployDragPreviewCard card={cards.find(c => c.id === activeId)!} />
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
