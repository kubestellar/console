import { useState, useEffect, useCallback, memo } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { Gamepad2, Plus, LayoutGrid, ChevronDown, ChevronRight, GripVertical, Trophy, Zap } from 'lucide-react'
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
import { getRememberPosition, setRememberPosition } from '../../hooks/useLastRoute'
import { useMobile } from '../../hooks/useMobile'

const ARCADE_CARDS_KEY = 'kubestellar-arcade-cards'

// Default cards for the arcade dashboard - ALL game cards
const DEFAULT_ARCADE_CARDS = [
  // Strategy games (featured)
  { type: 'checkers', title: 'Kube Checkers', position: { w: 5, h: 4 } },
  { type: 'kube_chess', title: 'Kube Chess', position: { w: 5, h: 4 } },
  { type: 'sudoku_game', title: 'Kube Sudoku', position: { w: 6, h: 4 } },
  // Classic arcade games
  { type: 'container_tetris', title: 'Container Tetris', position: { w: 6, h: 4 } },
  { type: 'node_invaders', title: 'Node Invaders', position: { w: 6, h: 4 } },
  { type: 'kube_man', title: 'Kube-Man', position: { w: 6, h: 4 } },
  { type: 'kube_kong', title: 'Kube Kong', position: { w: 6, h: 4 } },
  { type: 'pod_crosser', title: 'Pod Crosser', position: { w: 6, h: 4 } },
  { type: 'pod_pitfall', title: 'Pod Pitfall', position: { w: 6, h: 4 } },
  { type: 'pod_brothers', title: 'Pod Brothers', position: { w: 6, h: 4 } },
  { type: 'kube_galaga', title: 'Kube Galaga', position: { w: 5, h: 4 } },
  // Action & racing games
  { type: 'kube_pong', title: 'Kube Pong', position: { w: 5, h: 4 } },
  { type: 'kube_snake', title: 'Kube Snake', position: { w: 5, h: 4 } },
  { type: 'kube_kart', title: 'Kube Kart', position: { w: 5, h: 4 } },
  // Puzzle games
  { type: 'game_2048', title: 'Kube 2048', position: { w: 4, h: 4 } },
  { type: 'pod_sweeper', title: 'Pod Sweeper', position: { w: 6, h: 4 } },
  { type: 'match_game', title: 'Kube Match', position: { w: 6, h: 4 } },
  { type: 'kubedle', title: 'Kubedle', position: { w: 6, h: 4 } },
  // Strategy games (remaining)
  { type: 'solitaire', title: 'Kube Solitaire', position: { w: 6, h: 4 } },
  // Sandbox games
  { type: 'kube_craft', title: 'KubeCraft', position: { w: 5, h: 4 } },
  // { type: 'kube_craft_3d', title: 'KubeCraft 3D', position: { w: 6, h: 4 } }, // Disabled — component removed to reduce bundle size
  // Classic (last)
  { type: 'flappy_pod', title: 'Flappy Pod', position: { w: 6, h: 4 } },
]

// Sortable card component with drag handle
interface SortableArcadeCardProps {
  card: DashboardCard
  onConfigure: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  isDragging: boolean
}

const SortableArcadeCard = memo(function SortableArcadeCard({
  card,
  onConfigure,
  onRemove,
  onWidthChange,
  isDragging,
}: SortableArcadeCardProps) {
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
    // Only apply multi-column span on desktop; mobile uses single column
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
function ArcadeDragPreviewCard({ card }: { card: DashboardCard }) {
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

export function Arcade() {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()

  // Pin: default ON for arcade — set on first visit if not already stored
  const [pinned, setPinned] = useState<boolean>(() => {
    const stored = getRememberPosition(location.pathname)
    if (!stored) {
      // First visit: enable pin by default
      setRememberPosition(location.pathname, true)
      return true
    }
    return stored
  })

  // Use the shared dashboard hook for cards, DnD, modals
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
  } = useDashboard({
    storageKey: ARCADE_CARDS_KEY,
    defaultCards: DEFAULT_ARCADE_CARDS,
  })

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
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Gamepad2 className="w-6 h-6 text-pink-400" />
                Arcade
              </h1>
              <p className="text-muted-foreground">Take a break with Kubernetes-themed games</p>
            </div>
          </div>
          <label
            htmlFor="arcade-pin"
            className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground"
            title="Remember scroll position when navigating away"
          >
            <input
              type="checkbox"
              id="arcade-pin"
              checked={pinned}
              onChange={(e) => {
                setPinned(e.target.checked)
                setRememberPosition(location.pathname, e.target.checked)
              }}
              className="rounded border-border w-3.5 h-3.5"
            />
            Pin
          </label>
        </div>
      </div>

      {/* Fun Stats Banner */}
      <div className="mb-6 glass rounded-lg p-4 border border-pink-500/20 bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-blue-500/10">
        <div className="flex items-center justify-center gap-8 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <Gamepad2 className="w-5 h-5 text-pink-400" />
            <span className="text-muted-foreground">Games Available:</span>
            <span className="font-bold text-pink-400">{cards.length}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <span className="text-muted-foreground">High Scores:</span>
            <span className="font-bold text-yellow-400">Saved Locally</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Zap className="w-5 h-5 text-blue-400" />
            <span className="text-muted-foreground">Theme:</span>
            <span className="font-bold text-blue-400">Kubernetes</span>
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
            <span>Arcade Games ({cards.length})</span>
            {showCards ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Cards grid */}
        {showCards && (
          <>
            {cards.length === 0 ? (
              <div className="glass p-8 rounded-lg border-2 border-dashed border-pink-500/30 text-center">
                <div className="flex justify-center mb-4">
                  <Gamepad2 className="w-12 h-12 text-pink-400" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Arcade Dashboard</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                  Add games to your arcade! Choose from Kubernetes-themed classics like Flappy Pod, Container Tetris, and more.
                </p>
                <button
                  onClick={() => setShowAddCard(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-pink-500/20 text-pink-400 hover:bg-pink-500/30 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Games
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
                      <SortableArcadeCard
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
                      <ArcadeDragPreviewCard card={cards.find(c => c.id === activeId)!} />
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
