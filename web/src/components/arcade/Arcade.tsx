import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { Gamepad2, Plus, LayoutGrid, ChevronDown, ChevronRight, Trophy, Zap } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { ConfigureCardModal } from '../dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { DashboardTemplate } from '../dashboard/templates'
import { useDashboard, SortableDashboardCard, DragPreviewCard } from '../../lib/dashboards'
import { getRememberPosition, setRememberPosition } from '../../hooks/useLastRoute'
import { useTranslation } from 'react-i18next'

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
  { type: 'missile_command', title: 'Missile Command', position: { w: 6, h: 4 } },
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
  // Isometric classic
  { type: 'kube_bert', title: 'Kube Bert', position: { w: 6, h: 4 } },
  // Classic (last)
  { type: 'flappy_pod', title: 'Flappy Pod', position: { w: 6, h: 4 } },
]

export function Arcade() {
  const { t } = useTranslation('common')
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

  // Re-sync pin state whenever the path changes (e.g. navigating between dashboards)
  useEffect(() => {
    setPinned(getRememberPosition(location.pathname))
  }, [location.pathname])

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

  // Handle addCard URL param - open modal and clear param.
  // Guard: KeepAlive keeps hidden dashboards mounted; only process on active route.
  useEffect(() => {
    if (location.pathname !== '/arcade') return
    if (searchParams.get('addCard') === 'true') {
      setShowAddCard(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, setShowAddCard, location.pathname])

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
    openConfigureCard(cardId)
  }, [openConfigureCard])

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
                <Gamepad2 className="w-6 h-6 text-purple-400" />
                {t('arcade.title')}
              </h1>
              <p className="text-muted-foreground">{t('arcade.subtitle')}</p>
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
      <div className="mb-6 glass rounded-lg p-4 border border-purple-500/20 bg-gradient-to-r from-purple-500/10 via-purple-500/10 to-blue-500/10">
        <div className="flex items-center justify-center gap-8 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <Gamepad2 className="w-5 h-5 text-purple-400" />
            <span className="text-muted-foreground">{t('arcade.gamesAvailable')}</span>
            <span className="font-bold text-purple-400">{cards.length}</span>
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
            <span>{t('arcade.arcadeGames', { count: cards.length })}</span>
            {showCards ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Cards grid */}
        {showCards && (
          <>
            {cards.length === 0 ? (
              <div className="glass p-8 rounded-lg border-2 border-dashed border-purple-500/30 text-center">
                <div className="flex justify-center mb-4">
                  <Gamepad2 className="w-12 h-12 text-purple-400" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">{t('arcade.emptyStateTitle')}</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                  {t('arcade.emptyStateDescription')}
                </p>
                <button
                  onClick={() => setShowAddCard(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {t('arcade.addGames')}
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
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    {cards.map(card => (
                      <SortableDashboardCard
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
                    <DragPreviewCard card={cards.find(c => c.id === activeId)!} />
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
