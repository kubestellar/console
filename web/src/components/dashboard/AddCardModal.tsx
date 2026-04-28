import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Plus, Loader2, LayoutGrid, Search, Wand2, Activity, Eye } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { useModalState } from '../../lib/modals'
import { CardFactoryModal } from './CardFactoryModal'
import { StatBlockFactoryModal } from './StatBlockFactoryModal'
import { getAllDynamicCards, onRegistryChange } from '../../lib/dynamic-cards'
import { useToast } from '../ui/Toast'
import { FOCUS_DELAY_MS, RETRY_DELAY_MS } from '../../lib/constants/network'
import { emitAddCardModalOpened, emitAddCardModalAbandoned, emitCardCategoryBrowsed, emitRecommendedCardShown } from '../../lib/analytics'
import { isCardVisibleForProject } from '../../config/cards'
import { getDescriptorsByCategory } from '../cards/cardDescriptor'
import {
  CARD_CATALOG,
  RECOMMENDED_CARD_TYPES,
  MAX_RECOMMENDED_CARDS,
  CATEGORY_LOCALE_KEYS,
  visualizationIcons,
  wrapAbbreviations,
  generateCardSuggestions,
} from './shared/cardCatalog'
import type { CardSuggestion, HoveredCard } from './shared/cardCatalog'
import { CardPreview } from './shared/CardPreview'

// Re-export shared types and data for backward compatibility
export type { CardSuggestion, HoveredCard } from './shared/cardCatalog'
export { CARD_CATALOG } from './shared/cardCatalog'

/* CARD_CATALOG, types, helpers, and CardPreview are now in ./shared/cardCatalog.ts
   and ./shared/CardPreview.tsx */

interface AddCardModalProps {
  isOpen: boolean
  onClose: () => void
  onAddCards: (cards: CardSuggestion[]) => void
  existingCardTypes?: string[]
  initialSearch?: string
}

export function AddCardModal({ isOpen, onClose, onAddCards, existingCardTypes = [], initialSearch = '' }: AddCardModalProps) {
  const { t } = useTranslation()
  // Cross-namespace lookup for dynamic card keys (template literals can't be statically typed)
  const tCard = t as (key: string, defaultValue?: string) => string
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<'ai' | 'browse'>('browse')
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
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Dynamic cards from registry (reactive — updates when cards are created/deleted)
  const [dynamicCards, setDynamicCards] = useState(() => getAllDynamicCards())
  useEffect(() => {
    const unsub = onRegistryChange(() => setDynamicCards(getAllDynamicCards()))
    return unsub
  }, [])

  // Compute recommended cards — popular cards not already on the dashboard
  const recommendedCards = useMemo(() => {
    const existing = new Set(existingCardTypes || [])
    // Include both static catalog cards and descriptor-registered cards
    const catalogCards = Object.values(CARD_CATALOG).flat() as Array<{ type: string; title: string; description: string; visualization: string }>
    const descriptorCards = Array.from(getDescriptorsByCategory().values()).flat().map(d => ({
      type: d.id,
      title: d.title,
      description: d.description,
      visualization: d.visualization,
    }))
    const allCards = [...catalogCards, ...descriptorCards]
    return (RECOMMENDED_CARD_TYPES as readonly string[])
      .filter(type => !existing.has(type))
      .map(type => allCards.find(c => c.type === type))
      .filter((c): c is NonNullable<typeof c> => c != null)
      .slice(0, MAX_RECOMMENDED_CARDS)
  }, [existingCardTypes])

  // Track whether cards were added during this modal session
  const didAddCards = useRef(false)
  // Guard: only fire "abandoned" after the modal has actually been opened
  const wasOpened = useRef(false)

  // Pre-fill browse search when opening with initialSearch from global search
  useEffect(() => {
    if (isOpen && initialSearch) {
      setBrowseSearch(initialSearch)
      setActiveTab('browse')
    }
  }, [isOpen, initialSearch])

  useEffect(() => {
    if (isOpen) {
      didAddCards.current = false
      wasOpened.current = true
      emitAddCardModalOpened()
      if (recommendedCards.length > 0) {
        emitRecommendedCardShown(recommendedCards.map(c => c.type))
      }
    } else if (wasOpened.current) {
      // Modal just closed — if no cards were added, it was abandoned
      wasOpened.current = false
      if (!didAddCards.current) {
        emitAddCardModalAbandoned()
      }
    }
  }, [isOpen])

  // Auto-focus search input when browse tab is active
  useEffect(() => {
    if (isOpen && activeTab === 'browse') {
      const timer = setTimeout(() => searchInputRef.current?.focus(), FOCUS_DELAY_MS)
      return () => clearTimeout(timer)
    }
  }, [isOpen, activeTab])

  const handleGenerate = async () => {
    if (!query.trim()) return

    setIsGenerating(true)
    setSuggestions([])
    setSelectedCards(new Set())

    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))

    const results = generateCardSuggestions(query)
    setSuggestions(results)
    // Select all non-duplicate by default
    setSelectedCards(new Set(results.map((card, i) => existingCardTypes.includes(card.type) ? -1 : i).filter(i => i !== -1)))
    setIsGenerating(false)
  }

  const toggleCard = (index: number) => {
    const newSelected = new Set(selectedCards)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedCards(newSelected)
  }

  const toggleBrowseCard = (cardType: string) => {
    const newSelected = new Set(selectedBrowseCards)
    if (newSelected.has(cardType)) {
      newSelected.delete(cardType)
    } else {
      newSelected.add(cardType)
    }
    setSelectedBrowseCards(newSelected)
  }

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
      emitCardCategoryBrowsed(category)
    }
    setExpandedCategories(newExpanded)
  }

  // Merge dynamic cards into catalog as "Custom Cards" category
  const dynamicCatalogEntries = dynamicCards.map(dc => ({
    type: `dynamic_card::${dc.id}`,
    title: dc.title,
    description: dc.description || t('dashboard.addCard.customDynamicCard'),
    visualization: dc.tier === 'tier1' ? 'table' : 'status',
  }))

  // Filter catalog entries by active project context (white-label support)
  const staticCatalog = Object.fromEntries(
    Object.entries(CARD_CATALOG)
      .map(([k, v]) => [k, v.filter(card => isCardVisibleForProject(card.type))])
      .filter(([, v]) => (v as unknown[]).length > 0),
  ) as Record<string, Array<{ type: string; title: string; description: string; visualization: string }>>

  // Merge cards registered via the unified descriptor system into the catalog.
  // Descriptors are grouped by their category and appended to the matching
  // static catalog category (or create a new category if none exists).
  const descriptorsByCategory = getDescriptorsByCategory()
  for (const [category, descriptors] of descriptorsByCategory) {
    const existing = staticCatalog[category] || []
    const existingTypes = new Set(existing.map(c => c.type))
    for (const d of descriptors) {
      // Skip if already present in the static catalog (avoid duplicates during migration)
      if (!existingTypes.has(d.id)) {
        existing.push({
          type: d.id,
          title: d.title,
          description: d.description,
          visualization: d.visualization,
        })
      }
    }
    staticCatalog[category] = existing
  }

  const mergedCatalog: Record<string, Array<{ type: string; title: string; description: string; visualization: string }>> = {
    ...(dynamicCatalogEntries.length > 0 ? { 'Custom Cards': dynamicCatalogEntries } : {}),
    ...staticCatalog,
  }

  // Filter catalog by search
  const filteredCatalog = Object.entries(mergedCatalog).reduce((acc, [category, cards]) => {
    if (!browseSearch.trim()) {
      acc[category] = [...cards]
    } else {
      const search = browseSearch.toLowerCase()
      const filtered = cards.filter(
        card => card.title.toLowerCase().includes(search) ||
          card.description.toLowerCase().includes(search) ||
          card.type.toLowerCase().includes(search)
      )
      if (filtered.length > 0) {
        acc[category] = filtered
      }
    }
    return acc
  }, {} as Record<string, Array<{ type: string; title: string; description: string; visualization: string }>>)

  const handleAddCards = () => {
    const cardsToAdd = suggestions.filter((_, i) => selectedCards.has(i))
    didAddCards.current = cardsToAdd.length > 0
    onAddCards(cardsToAdd)
    onClose()
    setQuery('')
    setSuggestions([])
    setSelectedCards(new Set())
  }

  const handleAddBrowseCards = () => {
    const cardsToAdd: CardSuggestion[] = []
    const addedTypes = new Set<string>() // Track added types to prevent duplicates

    // Handle dynamic cards (keyed as "dynamic_card::cardId")
    for (const dc of dynamicCards) {
      const key = `dynamic_card::${dc.id}`
      if (selectedBrowseCards.has(key) && !addedTypes.has(key)) {
        addedTypes.add(key)
        cardsToAdd.push({
          type: 'dynamic_card',
          title: dc.title,
          description: dc.description || t('dashboard.addCard.customDynamicCard'),
          visualization: (dc.tier === 'tier1' ? 'table' : 'status') as CardSuggestion['visualization'],
          config: { dynamicCardId: dc.id },
        })
      }
    }

    // Handle static catalog cards
    for (const cards of Object.values(CARD_CATALOG)) {
      for (const card of cards) {
        // Only add if selected AND not already added (prevents duplicates from multiple categories)
        if (selectedBrowseCards.has(card.type) && !addedTypes.has(card.type)) {
          addedTypes.add(card.type)
          cardsToAdd.push({
            type: card.type,
            title: card.title,
            description: card.description,
            visualization: card.visualization as CardSuggestion['visualization'],
            config: {},
          })
        }
      }
    }

    // Handle cards registered via the unified descriptor system
    for (const descriptors of descriptorsByCategory.values()) {
      for (const d of descriptors) {
        if (selectedBrowseCards.has(d.id) && !addedTypes.has(d.id)) {
          addedTypes.add(d.id)
          cardsToAdd.push({
            type: d.id,
            title: d.title,
            description: d.description,
            visualization: d.visualization as CardSuggestion['visualization'],
            config: {},
          })
        }
      }
    }
    try {
      didAddCards.current = cardsToAdd.length > 0
      onAddCards(cardsToAdd)
    } catch (error) {
      console.error('Error adding cards:', error)
      showToast(t('dashboard.addCard.failedToAdd'), 'error')
    }
    // Always close and reset state
    onClose()
    setBrowseSearch('')
    setSelectedBrowseCards(new Set())
  }

  const tabs = [
    { id: 'browse', label: t('dashboard.addCard.browseCards'), icon: LayoutGrid },
    { id: 'ai', label: t('dashboard.addCard.aiSuggestions'), icon: Sparkles },
  ]

  return (
    <>
      <BaseModal isOpen={isOpen} onClose={onClose} size="xl" closeOnBackdrop={false}>
        <BaseModal.Header
          title={t('dashboard.addCard.title')}
          icon={Plus}
          onClose={onClose}
          showBack={false}
        />

        <BaseModal.Tabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab as 'ai' | 'browse')}
        />

        <BaseModal.Content className="max-h-[60vh]">
          {/* Browse Tab */}
          {activeTab === 'browse' && (
            <div className="flex gap-4">
              {/* Left side - Card catalog */}
              <div className="flex-1 min-w-0">
                {/* Search + Create Custom */}
                <div className="mb-4 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={browseSearch}
                      onChange={(e) => setBrowseSearch(e.target.value)}
                      placeholder={t('dashboard.addCard.searchCards')}
                      className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
                    />
                  </div>
                  <button
                    onClick={() => openCardFactory()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors text-sm font-medium whitespace-nowrap shrink-0"
                  >
                    <Wand2 className="w-4 h-4" />
                    {t('dashboard.addCard.createCustom')}
                  </button>
                  <button
                    onClick={() => openStatFactory()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors text-sm font-medium whitespace-nowrap shrink-0"
                  >
                    <Activity className="w-4 h-4" />
                    {t('dashboard.addCard.createStats')}
                  </button>
                </div>

                {/* Recommended for you — shown at top of browse tab when no search active */}
                {!browseSearch.trim() && recommendedCards.length > 0 && (
                  <div className="mb-4 rounded-xl border border-purple-500/20 bg-purple-500/5 p-3">
                    <h4 className="text-xs font-medium text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      {t('dashboard.addCard.recommended', 'Recommended for you')}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {recommendedCards.map(card => {
                        const isSelected = selectedBrowseCards.has(card.type)
                        return (
                          <button
                            key={card.type}
                            onClick={() => toggleBrowseCard(card.type)}
                            onMouseEnter={() => setHoveredCard({ type: card.type, title: card.title, description: card.description, visualization: card.visualization })}
                            onMouseLeave={() => setHoveredCard(null)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                              isSelected
                                ? 'bg-purple-500/20 border border-purple-500 text-foreground ring-1 ring-purple-500/50'
                                : 'bg-secondary/50 border border-border/50 hover:border-purple-500/30 hover:bg-secondary text-foreground'
                            }`}
                          >
                            <Activity className="w-3.5 h-3.5 text-purple-400" />
                            <span className="font-medium text-xs">{card.title}</span>
                            {!isSelected && <Plus className="w-3 h-3 text-purple-400" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Card catalog */}
                <div className="max-h-[40vh] overflow-y-auto space-y-3">
                  {Object.entries(filteredCatalog).map(([category, cards]) => {
                    // Count how many cards in this category are not already added
                    const availableCards = cards.filter(c => !existingCardTypes.includes(c.type))
                    const allCategorySelected = availableCards.length > 0 && availableCards.every(c => selectedBrowseCards.has(c.type))

                    return (
                      <div key={category} className="border border-border rounded-lg overflow-hidden">
                        <div className="flex items-center bg-secondary/50 hover:bg-secondary transition-colors">
                          <button
                            onClick={() => toggleCategory(category)}
                            className="flex-1 px-3 py-2 text-left text-sm font-medium text-foreground flex items-center justify-between"
                          >
                            <span>{CATEGORY_LOCALE_KEYS[category] ? tCard(`cards:categories.${CATEGORY_LOCALE_KEYS[category]}`, category) : category}</span>
                            <span className="text-xs text-muted-foreground">
                              {cards.length} {t('dashboard.addCard.cards')} {expandedCategories.has(category) ? '\u25BC' : '\u25B6'}
                            </span>
                          </button>
                          {availableCards.length > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                const newSelected = new Set(selectedBrowseCards)
                                if (allCategorySelected) {
                                  availableCards.forEach(c => newSelected.delete(c.type))
                                } else {
                                  availableCards.forEach(c => newSelected.add(c.type))
                                }
                                setSelectedBrowseCards(newSelected)
                              }}
                              className={`px-2 py-1 mr-2 text-xs rounded transition-colors ${allCategorySelected
                                  ? 'bg-purple-500/30 text-purple-300 hover:bg-purple-500/40'
                                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
                                }`}
                            >
                              {allCategorySelected ? t('dashboard.addCard.deselectAll') : t('dashboard.addCard.addAll')}
                            </button>
                          )}
                        </div>
                        {expandedCategories.has(category) && (
                          <div className="p-2 grid grid-cols-2 gap-2">
                            {cards.map((card) => {
                              const isAlreadyAdded = existingCardTypes.includes(card.type)
                              const isSelected = selectedBrowseCards.has(card.type)
                              return (
                                <button
                                  key={card.type}
                                  onClick={() => !isAlreadyAdded && toggleBrowseCard(card.type)}
                                  onMouseEnter={() => setHoveredCard(card)}
                                  onMouseLeave={() => setHoveredCard(null)}
                                  disabled={isAlreadyAdded}
                                  className={`p-2 rounded-lg text-left transition-all ${isAlreadyAdded
                                      ? 'bg-secondary/30 opacity-50 cursor-not-allowed'
                                      : isSelected
                                        ? 'bg-purple-500/20 border-2 border-purple-500'
                                        : 'bg-secondary/30 border-2 border-transparent hover:border-purple-500/30'
                                    }`}
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm">{visualizationIcons[card.visualization]}</span>
                                    <span className="text-xs font-medium text-foreground truncate">
                                      {tCard(`cards:titles.${card.type}`, card.title)}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {wrapAbbreviations(tCard(`cards:descriptions.${card.type}`, card.description))}
                                  </p>
                                  {isAlreadyAdded && (
                                    <span className="text-xs text-muted-foreground">{t('dashboard.addCard.added')}</span>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Right side - Preview Panel (always visible) */}
              <div className="w-64 border-l border-border pl-4 shrink-0">
                <div className="text-2xs text-muted-foreground uppercase tracking-wide mb-2">{t('dashboard.addCard.preview')}</div>

                {hoveredCard ? (
                  <div>
                    <CardPreview card={hoveredCard} />
                    <div className="mt-3 space-y-2">
                      <div>
                        <h3 className="text-sm font-medium text-foreground">
                          {tCard(`cards:titles.${hoveredCard.type}`, hoveredCard.title)}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {wrapAbbreviations(tCard(`cards:descriptions.${hoveredCard.type}`, hoveredCard.description))}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-secondary text-xs text-foreground capitalize">
                          {visualizationIcons[hoveredCard.visualization]} {hoveredCard.visualization}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-32 rounded-lg border border-dashed border-border/50 bg-secondary/20">
                    <Eye className="w-6 h-6 text-muted-foreground/40 mb-2" />
                    <p className="text-xs text-muted-foreground/60 text-center px-4">
                      {t('dashboard.addCard.hoverToPreview', 'Hover over a card to see a preview')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI Tab */}
          {activeTab === 'ai' && (
            <>
              {/* Query input */}
              <div className="mb-4">
                <label className="block text-sm text-muted-foreground mb-2">
                  {t('dashboard.addCard.describeWhatYouWant')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                    placeholder={t('dashboard.addCard.aiPlaceholder')}
                    className="flex-1 px-4 py-2 bg-secondary rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
                  />
                  <button
                    onClick={handleGenerate}
                    disabled={!query.trim() || isGenerating}
                    className="px-4 py-2 bg-gradient-ks text-primary-foreground rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('dashboard.addCard.thinking')}
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        {t('dashboard.addCard.generate')}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Example queries */}
              {!suggestions.length && !isGenerating && (
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground mb-2">{t('dashboard.addCard.tryAsking')}</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      t('dashboard.addCard.exampleGpuUtil'),
                      t('dashboard.addCard.examplePodIssues'),
                      t('dashboard.addCard.exampleHelmReleases'),
                      t('dashboard.addCard.exampleNamespaceQuotas'),
                      t('dashboard.addCard.exampleOperatorStatus'),
                      t('dashboard.addCard.exampleKustomizeGitOps'),
                    ].map((example) => (
                      <button
                        key={example}
                        onClick={() => setQuery(example)}
                        className="px-3 py-1 text-xs bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full transition-colors"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggestions */}
              {suggestions.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {t('dashboard.addCard.suggestedCards', { count: selectedCards.size })}
                  </p>
                  <div className="grid grid-cols-2 gap-3 max-h-[40vh] overflow-y-auto">
                    {suggestions.map((card, index) => {
                      const isAlreadyAdded = existingCardTypes.includes(card.type)
                      return (
                        <button
                          key={index}
                          onClick={() => !isAlreadyAdded && toggleCard(index)}
                          disabled={isAlreadyAdded}
                          className={`p-3 rounded-lg text-left transition-all ${isAlreadyAdded
                              ? 'bg-secondary/30 border-2 border-transparent opacity-50 cursor-not-allowed'
                              : selectedCards.has(index)
                                ? 'bg-purple-500/20 border-2 border-purple-500'
                                : 'bg-secondary/50 border-2 border-transparent hover:border-purple-500/30'
                            }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span>{visualizationIcons[card.visualization]}</span>
                            <span className="text-sm font-medium text-foreground">
                              {tCard(`cards:titles.${card.type}`, card.title)}
                            </span>
                            {isAlreadyAdded && (
                              <span className="text-xs text-muted-foreground">{t('dashboard.addCard.alreadyAdded')}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {wrapAbbreviations(tCard(`cards:descriptions.${card.type}`, card.description))}
                          </p>
                          <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground capitalize">
                            {card.visualization}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </BaseModal.Content>


        {/* Footer - Browse tab (always visible so Add button is never hidden) */}
        {activeTab === 'browse' && (
          <BaseModal.Footer showKeyboardHints={false} className="justify-between">
            <span className="text-sm text-muted-foreground">
              {selectedBrowseCards.size > 0
                ? t('dashboard.addCard.cardsSelected', { count: selectedBrowseCards.size })
                : t('dashboard.addCard.cardsAvailable', { count: Object.values(filteredCatalog).flat().filter(c => !existingCardTypes.includes(c.type)).length })}
            </span>
            <div className="flex items-center gap-2">
              {selectedBrowseCards.size > 0 && (
                <button
                  onClick={() => setSelectedBrowseCards(new Set())}
                  className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('dashboard.addCard.clear')}
                </button>
              )}
              <button
                onClick={handleAddBrowseCards}
                disabled={selectedBrowseCards.size === 0}
                className="px-4 py-2 bg-gradient-ks text-primary-foreground rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                {selectedBrowseCards.size > 0
                  ? t('dashboard.addCard.addCount', { count: selectedBrowseCards.size })
                  : t('dashboard.addCard.addCards')}
              </button>
            </div>
          </BaseModal.Footer>
        )}

        {/* Footer - AI tab */}
        {activeTab === 'ai' && suggestions.length > 0 && (
          <BaseModal.Footer showKeyboardHints={false} className="justify-end">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('actions.cancel')}
              </button>
              <button
                onClick={handleAddCards}
                disabled={selectedCards.size === 0}
                className="px-4 py-2 bg-gradient-ks text-primary-foreground rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {t('dashboard.addCard.addCount', { count: selectedCards.size })}
              </button>
            </div>
          </BaseModal.Footer>
        )}
      </BaseModal>

      {/* Card Factory Modal */}
      <CardFactoryModal
        isOpen={isCardFactoryOpen}
        onClose={closeCardFactory}
        onCardCreated={(cardId) => {
          // Add the newly created dynamic card to the dashboard
          onAddCards([{
            type: 'dynamic_card',
            title: t('dashboard.addCard.customCard'),
            description: t('dashboard.addCard.dynamicallyCreated'),
            visualization: 'status',
            config: { dynamicCardId: cardId },
          }])
        }}
      />

      {/* Stat Block Factory Modal */}
      <StatBlockFactoryModal
        isOpen={isStatFactoryOpen}
        onClose={closeStatFactory}
      />
    </>
  )
}
