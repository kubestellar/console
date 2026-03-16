import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, LayoutGrid, ChevronDown, ChevronRight, Layout, AlertTriangle } from 'lucide-react'
import { useModalState } from '../../lib/modals'
import { Button } from '../ui/Button'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS, LIVE_DATA_CARDS } from '../cards/cardRegistry'
import { AddCardModal } from './AddCardModal'
import { TemplatesModal } from './TemplatesModal'
import { ConfigureCardModal } from './ConfigureCardModal'
import { DashboardTemplate } from './templates'
import { DashboardCard } from '../../hooks/useDashboardCards'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { DashboardHealthIndicator } from './DashboardHealthIndicator'

interface CardSuggestion {
  type: string
  title: string
  config: Record<string, unknown>
}

interface DashboardCardsProps {
  cards: DashboardCard[]
  onAddCard: (cardType: string, config?: Record<string, unknown>, title?: string) => void
  onRemoveCard: (cardId: string) => void
  onUpdateCardConfig: (cardId: string, config: Record<string, unknown>) => void
  onReplaceCards: (cards: DashboardCard[]) => void
  /** Title shown in the collapsible header */
  sectionTitle?: string
  /** Placeholder content when no cards */
  emptyIcon?: React.ReactNode
  emptyTitle?: string
  emptyDescription?: string
  /** Start collapsed? */
  defaultCollapsed?: boolean
}

export function DashboardCards({
  cards,
  onAddCard,
  onRemoveCard,
  onUpdateCardConfig,
  onReplaceCards,
  sectionTitle = 'Dashboard Cards',
  emptyIcon,
  emptyTitle = 'No cards added',
  emptyDescription = 'Add cards to customize this dashboard.',
  defaultCollapsed = false,
}: DashboardCardsProps) {
  const { t } = useTranslation()
  const [showCards, setShowCards] = useState(!defaultCollapsed)
  const addCardModal = useModalState()
  const templatesModal = useModalState()
  const configureModal = useModalState()
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)

  // Listen for marketplace card-preset installs
  useEffect(() => {
    const handler = (e: Event) => {
      const { card_type, config, title } = (e as CustomEvent).detail || {}
      if (card_type) onAddCard(card_type, config || {}, title)
    }
    window.addEventListener('kc-add-card-from-marketplace', handler)
    return () => window.removeEventListener('kc-add-card-from-marketplace', handler)
  }, [onAddCard])

  const handleAddCards = (suggestions: CardSuggestion[]) => {
    suggestions.forEach(card => {
      onAddCard(card.type, card.config, card.title)
    })
    addCardModal.close()
  }

  const handleConfigureCard = (cardId: string) => {
    setSelectedCardId(cardId)
    configureModal.open()
  }

  const handleSaveConfig = (cardId: string, config: Record<string, unknown>, _title?: string) => {
    onUpdateCardConfig(cardId, config)
    configureModal.close()
    setSelectedCardId(null)
  }

  const handleApplyTemplate = (template: DashboardTemplate) => {
    const newCards: DashboardCard[] = template.cards.map((card, idx) => ({
      id: `${card.card_type}-${Date.now()}-${idx}`,
      card_type: card.card_type,
      config: card.config || {},
      title: card.title,
    }))
    onReplaceCards(newCards)
    templatesModal.close()
  }

  const selectedCard = cards.find(c => c.id === selectedCardId)
  // Transform to the Card format expected by ConfigureCardModal
  const configureCard = selectedCard ? {
    id: selectedCard.id,
    card_type: selectedCard.card_type,
    config: selectedCard.config,
    title: selectedCard.title,
  } : null

  return (
    <div className="mt-6">
      {/* Header with toggle and actions */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCards(!showCards)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
            <span>{sectionTitle} ({cards.length})</span>
            {showCards ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {/* Health indicator */}
          <DashboardHealthIndicator size="sm" />
        </div>

        {showCards && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<Layout className="w-3.5 h-3.5" />}
              onClick={templatesModal.open}
            >
              {t('dashboard.actions.templates')}
            </Button>
            <Button
              variant="accent"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={addCardModal.open}
            >
              {t('dashboard.actions.addCard')}
            </Button>
          </div>
        )}
      </div>

      {/* Cards grid */}
      {showCards && (
        <>
          {cards.length === 0 ? (
            <div className="glass p-8 rounded-lg border-2 border-dashed border-border/50 text-center">
              {emptyIcon && <div className="flex justify-center mb-4">{emptyIcon}</div>}
              <h3 className="text-lg font-medium text-foreground mb-2">{emptyTitle}</h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                {emptyDescription}
              </p>
              <Button
                variant="accent"
                size="lg"
                icon={<Plus className="w-4 h-4" />}
                onClick={addCardModal.open}
              >
                {t('dashboard.addCard.addCards')}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cards.map(card => {
                const CardComponent = CARD_COMPONENTS[card.card_type]
                return (
                  <CardWrapper
                    key={card.id}
                    cardId={card.id}
                    cardType={card.card_type}
                    title={formatCardTitle(card.card_type)}
                    onConfigure={() => handleConfigureCard(card.id)}
                    onRemove={() => onRemoveCard(card.id)}
                    isDemoData={DEMO_DATA_CARDS.has(card.card_type)}
                    isLive={LIVE_DATA_CARDS.has(card.card_type)}
                  >
                    {CardComponent ? (
                      <CardComponent config={card.config} />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-4">
                        <AlertTriangle className="w-6 h-6 text-yellow-500" />
                        <p className="text-sm font-medium">Unknown card type: {card.card_type}</p>
                        <p className="text-xs">This card type is not registered. You can remove it.</p>
                      </div>
                    )}
                  </CardWrapper>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      <AddCardModal
        isOpen={addCardModal.isOpen}
        onClose={addCardModal.close}
        onAddCards={handleAddCards}
      />

      <TemplatesModal
        isOpen={templatesModal.isOpen}
        onClose={templatesModal.close}
        onApplyTemplate={handleApplyTemplate}
      />

      <ConfigureCardModal
        isOpen={configureModal.isOpen}
        onClose={() => {
          configureModal.close()
          setSelectedCardId(null)
        }}
        card={configureCard}
        onSave={handleSaveConfig}
      />
    </div>
  )
}
