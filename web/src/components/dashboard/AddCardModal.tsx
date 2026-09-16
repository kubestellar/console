import { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutGrid, Plus, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { emitAddCardModalAbandoned, emitAddCardModalOpened, emitCardCategoryBrowsed, emitRecommendedCardShown } from '../../lib/analytics'
import { FOCUS_DELAY_MS, RETRY_DELAY_MS } from '../../lib/constants/network'
import { getAllDynamicCards, onRegistryChange } from '../../lib/dynamic-cards'
import { BaseModal, useModalState } from '../../lib/modals'
import { useToast } from '../ui/Toast'
import { AddCardAiPanel } from './AddCardAiPanel'
import { AddCardBrowsePanel } from './AddCardBrowsePanel'
import { AddCardPreviewPanel } from './AddCardPreviewPanel'
import { CardFactoryModal } from './CardFactoryModal'
import { StatBlockFactoryModal } from './StatBlockFactoryModal'
import { buildBrowseCardsToAdd, buildMergedCatalog, buildRecommendedCards, filterCatalog } from './addCardModal.utils'
import type { AddCardModalProps, AddCardTab, CardTranslation, DashboardTranslation } from './addCardModal.types'
import { CARD_CATALOG, generateCardSuggestions } from './shared/cardCatalog'
import type { CardSuggestion, HoveredCard } from './shared/cardCatalog'

export type { CardSuggestion, HoveredCard } from './shared/cardCatalog'
export { CARD_CATALOG } from './shared/cardCatalog'

export function AddCardModal({
  isOpen,
  onClose,
  onAddCards,
  existingCardTypes = [],
  initialSearch = '',
}: AddCardModalProps) {
  const { t } = useTranslation()
  const tDashboard = t as DashboardTranslation
  const tCard = t as CardTranslation
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<AddCardTab>('browse')
  const { isOpen: isCardFactoryOpen, open: openCardFactory, close: closeCardFactory } = useModalState()
  const { isOpen: isStatFactoryOpen, open: openStatFactory, close: closeStatFactory } = useModalState()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<CardSuggestion[]>([])
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set())
  const [isGenerating, setIsGenerating] = useState(false)
  const [browseSearch, setBrowseSearch] = useState('')
  const [selectedBrowseCards, setSelectedBrowseCards] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set([...Object.keys(CARD_CATALOG), 'Custom Cards']))
  const [hoveredCard, setHoveredCard] = useState<HoveredCard | null>(null)
  const [dynamicCards, setDynamicCards] = useState(() => getAllDynamicCards())
  const searchInputRef = useRef<HTMLInputElement>(null)
  const didAddCards = useRef(false)
  const wasOpened = useRef(false)

  const recommendedCards = useMemo(
    () => buildRecommendedCards(existingCardTypes),
    [existingCardTypes],
  )

  const mergedCatalog = useMemo(
    () => buildMergedCatalog(dynamicCards, tDashboard),
    [dynamicCards, tDashboard],
  )

  const filteredCatalog = useMemo(
    () => filterCatalog(mergedCatalog, browseSearch),
    [browseSearch, mergedCatalog],
  )

  useEffect(() => {
    const unsubscribe = onRegistryChange(() => setDynamicCards(getAllDynamicCards()))
    return unsubscribe
  }, [])

  useEffect(() => {
    if (isOpen && initialSearch) {
      setBrowseSearch(initialSearch)
      setActiveTab('browse')
    }
  }, [initialSearch, isOpen])

  useEffect(() => {
    if (isOpen) {
      didAddCards.current = false
      wasOpened.current = true
      emitAddCardModalOpened()
      if (recommendedCards.length > 0) {
        emitRecommendedCardShown(recommendedCards.map(card => card.type))
      }
      return
    }

    if (wasOpened.current) {
      wasOpened.current = false
      if (!didAddCards.current) {
        emitAddCardModalAbandoned()
      }
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && activeTab === 'browse') {
      const timer = setTimeout(() => searchInputRef.current?.focus(), FOCUS_DELAY_MS)
      return () => clearTimeout(timer)
    }
  }, [activeTab, isOpen])

  const handleGenerate = async () => {
    if (!query.trim()) return

    setIsGenerating(true)
    setSuggestions([])
    setSelectedCards(new Set())

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))

    const results = generateCardSuggestions(query)
    setSuggestions(results)
    setSelectedCards(new Set(
      results
        .map((card, index) => existingCardTypes.includes(card.type) ? -1 : index)
        .filter(index => index !== -1),
    ))
    setIsGenerating(false)
  }

  const toggleCard = (index: number) => {
    setSelectedCards((current) => {
      const nextSelected = new Set(current)
      if (nextSelected.has(index)) {
        nextSelected.delete(index)
      } else {
        nextSelected.add(index)
      }
      return nextSelected
    })
  }

  const toggleBrowseCard = (cardType: string) => {
    setSelectedBrowseCards((current) => {
      const nextSelected = new Set(current)
      if (nextSelected.has(cardType)) {
        nextSelected.delete(cardType)
      } else {
        nextSelected.add(cardType)
      }
      return nextSelected
    })
  }

  const toggleCategory = (category: string) => {
    setExpandedCategories((current) => {
      const nextExpanded = new Set(current)
      if (nextExpanded.has(category)) {
        nextExpanded.delete(category)
      } else {
        nextExpanded.add(category)
        emitCardCategoryBrowsed(category)
      }
      return nextExpanded
    })
  }

  const handleAddCards = () => {
    const cardsToAdd = suggestions.filter((_, index) => selectedCards.has(index))
    didAddCards.current = cardsToAdd.length > 0
    onAddCards(cardsToAdd)
    onClose()
    setQuery('')
    setSuggestions([])
    setSelectedCards(new Set())
  }

  const handleAddBrowseCards = () => {
    const cardsToAdd = buildBrowseCardsToAdd({
      dynamicCards,
      selectedBrowseCards,
      t: tDashboard,
    })

    try {
      didAddCards.current = cardsToAdd.length > 0
      onAddCards(cardsToAdd)
    } catch (error: unknown) {
      console.error('Error adding cards:', error)
      showToast(tDashboard('dashboard.addCard.failedToAdd'), 'error')
    }

    onClose()
    setBrowseSearch('')
    setSelectedBrowseCards(new Set())
  }

  const tabs = [
    { id: 'browse', label: tDashboard('dashboard.addCard.browseCards'), icon: LayoutGrid },
    { id: 'ai', label: tDashboard('dashboard.addCard.aiSuggestions'), icon: Sparkles },
  ]

  const availableBrowseCount = Object.values(filteredCatalog)
    .flat()
    .filter(card => !existingCardTypes.includes(card.type)).length

  return (
    <>
      <BaseModal isOpen={isOpen} onClose={onClose} size="xl" closeOnBackdrop={false}>
        <BaseModal.Header
          title={tDashboard('dashboard.addCard.title')}
          icon={Plus}
          onClose={onClose}
          showBack={false}
        />

        <BaseModal.Tabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab as AddCardTab)}
        />

        <BaseModal.Content className="max-h-[60vh]">
          {activeTab === 'browse' && (
            <div className="flex gap-4">
              <AddCardBrowsePanel
                browseSearch={browseSearch}
                existingCardTypes={existingCardTypes}
                expandedCategories={expandedCategories}
                filteredCatalog={filteredCatalog}
                openCardFactory={openCardFactory}
                openStatFactory={openStatFactory}
                recommendedCards={recommendedCards}
                searchInputRef={searchInputRef}
                selectedBrowseCards={selectedBrowseCards}
                t={tDashboard}
                tCard={tCard}
                onBrowseSearchChange={setBrowseSearch}
                onHoverCardChange={setHoveredCard}
                onSelectedBrowseCardsChange={setSelectedBrowseCards}
                onToggleBrowseCard={toggleBrowseCard}
                onToggleCategory={toggleCategory}
              />
              <AddCardPreviewPanel hoveredCard={hoveredCard} t={tDashboard} tCard={tCard} />
            </div>
          )}

          {activeTab === 'ai' && (
            <AddCardAiPanel
              existingCardTypes={existingCardTypes}
              isGenerating={isGenerating}
              query={query}
              selectedCards={selectedCards}
              suggestions={suggestions}
              t={tDashboard}
              tCard={tCard}
              onGenerate={handleGenerate}
              onQueryChange={setQuery}
              onToggleCard={toggleCard}
            />
          )}
        </BaseModal.Content>

        {activeTab === 'browse' && (
          <BaseModal.Footer showKeyboardHints={false} className="justify-between">
            <span className="text-sm text-muted-foreground">
              {selectedBrowseCards.size > 0
                ? tDashboard('dashboard.addCard.cardsSelected', { count: selectedBrowseCards.size })
                : tDashboard('dashboard.addCard.cardsAvailable', { count: availableBrowseCount })}
            </span>
            <div className="flex items-center gap-2">
              {selectedBrowseCards.size > 0 && (
                <button
                  onClick={() => setSelectedBrowseCards(new Set())}
                  className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {tDashboard('dashboard.addCard.clear')}
                </button>
              )}
              <button
                onClick={handleAddBrowseCards}
                disabled={selectedBrowseCards.size === 0}
                className="px-4 py-2 bg-gradient-ks text-primary-foreground rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                {selectedBrowseCards.size > 0
                  ? tDashboard('dashboard.addCard.addCount', { count: selectedBrowseCards.size })
                  : tDashboard('dashboard.addCard.addCards')}
              </button>
            </div>
          </BaseModal.Footer>
        )}

        {activeTab === 'ai' && suggestions.length > 0 && (
          <BaseModal.Footer showKeyboardHints={false} className="justify-end">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {tDashboard('actions.cancel')}
              </button>
              <button
                onClick={handleAddCards}
                disabled={selectedCards.size === 0}
                className="px-4 py-2 bg-gradient-ks text-primary-foreground rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {tDashboard('dashboard.addCard.addCount', { count: selectedCards.size })}
              </button>
            </div>
          </BaseModal.Footer>
        )}
      </BaseModal>

      <CardFactoryModal
        isOpen={isCardFactoryOpen}
        onClose={closeCardFactory}
        onCardCreated={(cardId) => {
          onAddCards([{
            type: 'dynamic_card',
            title: tDashboard('dashboard.addCard.customCard'),
            description: tDashboard('dashboard.addCard.dynamicallyCreated'),
            visualization: 'status',
            config: { dynamicCardId: cardId },
          }])
        }}
      />

      <StatBlockFactoryModal
        isOpen={isStatFactoryOpen}
        onClose={closeStatFactory}
      />
    </>
  )
}
