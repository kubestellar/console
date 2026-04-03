/**
 * UnifiedCardsSection — combines AI suggestions + browse catalog into one view.
 *
 * Layout: AI query bar at top → suggestion chips when results exist →
 * full browse catalog below. No tabs needed.
 */
import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Plus, Loader2, Search, Wand2, Activity } from 'lucide-react'
import { useModalState } from '../../../../lib/modals'
import { CardFactoryModal } from '../../CardFactoryModal'
import { StatBlockFactoryModal } from '../../StatBlockFactoryModal'
import { getAllDynamicCards, onRegistryChange } from '../../../../lib/dynamic-cards'
import { useToast } from '../../../ui/Toast'
import { FOCUS_DELAY_MS, RETRY_DELAY_MS } from '../../../../lib/constants/network'
import { emitCardCategoryBrowsed, emitRecommendedCardShown } from '../../../../lib/analytics'
import { isCardVisibleForProject } from '../../../../config/cards'
import { getDescriptorsByCategory } from '../../../cards/cardDescriptor'
import {
  CARD_CATALOG,
  RECOMMENDED_CARD_TYPES,
  MAX_RECOMMENDED_CARDS,
  CATEGORY_LOCALE_KEYS,
  visualizationIcons,
  wrapAbbreviations,
  generateCardSuggestions,
} from '../../shared/cardCatalog'
import type { CardSuggestion, HoveredCard } from '../../shared/cardCatalog'

interface UnifiedCardsSectionProps {
  existingCardTypes: string[]
  onAddCards: (cards: CardSuggestion[]) => void
  onHoverCard: (card: HoveredCard | null) => void
  initialSearch?: string
  isActive: boolean
  dashboardName?: string
}

export function UnifiedCardsSection({
  existingCardTypes,
  onAddCards,
  onHoverCard,
  initialSearch = '',
  isActive,
  dashboardName,
}: UnifiedCardsSectionProps) {
  const { t } = useTranslation()
  const tCard = t as (key: string, defaultValue?: string) => string
  const { showToast } = useToast()
  const { isOpen: isCardFactoryOpen, open: openCardFactory, close: closeCardFactory } = useModalState()
  const { isOpen: isStatFactoryOpen, open: openStatFactory, close: closeStatFactory } = useModalState()
  const [browseSearch, setBrowseSearch] = useState(initialSearch || '')
  const [selectedBrowseCards, setSelectedBrowseCards] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set([...Object.keys(CARD_CATALOG), 'Custom Cards']))
  const searchInputRef = useRef<HTMLInputElement>(null)

  // AI state
  const [aiQuery, setAiQuery] = useState('')
  const [aiSuggestions, setAiSuggestions] = useState<CardSuggestion[]>([])
  const [selectedAiCards, setSelectedAiCards] = useState<Set<number>>(new Set())
  const [isGenerating, setIsGenerating] = useState(false)

  // Dynamic cards from registry
  const [dynamicCards, setDynamicCards] = useState(() => getAllDynamicCards())
  useEffect(() => {
    const unsub = onRegistryChange(() => setDynamicCards(getAllDynamicCards()))
    return unsub
  }, [])

  // Recommended cards
  const recommendedCards = useMemo(() => {
    const existing = new Set(existingCardTypes || [])
    const catalogCards = Object.values(CARD_CATALOG).flat() as Array<{ type: string; title: string; description: string; visualization: string }>
    const descriptorCards = Array.from(getDescriptorsByCategory().values()).flat().map(d => ({
      type: d.id, title: d.title, description: d.description, visualization: d.visualization,
    }))
    const allCards = [...catalogCards, ...descriptorCards]
    return (RECOMMENDED_CARD_TYPES as readonly string[])
      .filter(type => !existing.has(type))
      .map(type => allCards.find(c => c.type === type))
      .filter((c): c is NonNullable<typeof c> => c != null)
      .slice(0, MAX_RECOMMENDED_CARDS)
  }, [existingCardTypes])

  useEffect(() => {
    if (isActive && recommendedCards.length > 0) {
      emitRecommendedCardShown(recommendedCards.map(c => c.type))
    }
  }, [isActive, recommendedCards])

  useEffect(() => {
    if (isActive) {
      const timer = setTimeout(() => searchInputRef.current?.focus(), FOCUS_DELAY_MS)
      return () => clearTimeout(timer)
    }
  }, [isActive])

  // AI generate
  const handleGenerateWithQuery = async (q: string) => {
    if (!q.trim()) return
    setIsGenerating(true)
    setAiSuggestions([])
    setSelectedAiCards(new Set())
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    const results = generateCardSuggestions(q)
    setAiSuggestions(results)
    setSelectedAiCards(new Set(results.map((card, i) => existingCardTypes.includes(card.type) ? -1 : i).filter(i => i !== -1)))
    setIsGenerating(false)
  }

  const toggleAiCard = (index: number) => {
    const s = new Set(selectedAiCards)
    if (s.has(index)) s.delete(index); else s.add(index)
    setSelectedAiCards(s)
  }

  const toggleBrowseCard = (cardType: string) => {
    const s = new Set(selectedBrowseCards)
    if (s.has(cardType)) s.delete(cardType); else s.add(cardType)
    setSelectedBrowseCards(s)
  }

  const toggleCategory = (category: string) => {
    const s = new Set(expandedCategories)
    if (s.has(category)) { s.delete(category) } else { s.add(category); emitCardCategoryBrowsed(category) }
    setExpandedCategories(s)
  }

  // Build merged catalog
  const dynamicCatalogEntries = dynamicCards.map(dc => ({
    type: `dynamic_card::${dc.id}`, title: dc.title,
    description: dc.description || t('dashboard.addCard.customDynamicCard'),
    visualization: dc.tier === 'tier1' ? 'table' : 'status',
  }))

  const staticCatalog = Object.fromEntries(
    Object.entries(CARD_CATALOG)
      .map(([k, v]) => [k, v.filter(card => isCardVisibleForProject(card.type))])
      .filter(([, v]) => (v as unknown[]).length > 0),
  ) as Record<string, Array<{ type: string; title: string; description: string; visualization: string }>>

  const descriptorsByCategory = getDescriptorsByCategory()
  for (const [category, descriptors] of descriptorsByCategory) {
    const existing = staticCatalog[category] || []
    const existingTypes = new Set(existing.map(c => c.type))
    for (const d of descriptors) {
      if (!existingTypes.has(d.id)) {
        existing.push({ type: d.id, title: d.title, description: d.description, visualization: d.visualization })
      }
    }
    staticCatalog[category] = existing
  }

  const mergedCatalog: Record<string, Array<{ type: string; title: string; description: string; visualization: string }>> = {
    ...(dynamicCatalogEntries.length > 0 ? { 'Custom Cards': dynamicCatalogEntries } : {}),
    ...staticCatalog,
  }

  const filteredCatalog = Object.entries(mergedCatalog).reduce((acc, [category, cards]) => {
    if (!browseSearch.trim()) {
      acc[category] = [...cards]
    } else {
      const search = browseSearch.toLowerCase()
      const filtered = cards.filter(
        card => card.title.toLowerCase().includes(search) || card.description.toLowerCase().includes(search) || card.type.toLowerCase().includes(search)
      )
      if (filtered.length > 0) acc[category] = filtered
    }
    return acc
  }, {} as Record<string, Array<{ type: string; title: string; description: string; visualization: string }>>)

  // Add handlers
  const handleAddAiCards = () => {
    const cardsToAdd = aiSuggestions.filter((_, i) => selectedAiCards.has(i))
    onAddCards(cardsToAdd)
    setAiQuery('')
    setAiSuggestions([])
    setSelectedAiCards(new Set())
  }

  const handleAddBrowseCards = () => {
    const cardsToAdd: CardSuggestion[] = []
    const addedTypes = new Set<string>()
    for (const dc of dynamicCards) {
      const key = `dynamic_card::${dc.id}`
      if (selectedBrowseCards.has(key) && !addedTypes.has(key)) {
        addedTypes.add(key)
        cardsToAdd.push({ type: 'dynamic_card', title: dc.title, description: dc.description || t('dashboard.addCard.customDynamicCard'), visualization: (dc.tier === 'tier1' ? 'table' : 'status') as CardSuggestion['visualization'], config: { dynamicCardId: dc.id } })
      }
    }
    for (const cards of Object.values(CARD_CATALOG)) {
      for (const card of cards) {
        if (selectedBrowseCards.has(card.type) && !addedTypes.has(card.type)) {
          addedTypes.add(card.type)
          cardsToAdd.push({ type: card.type, title: card.title, description: card.description, visualization: card.visualization as CardSuggestion['visualization'], config: {} })
        }
      }
    }
    for (const descriptors of descriptorsByCategory.values()) {
      for (const d of descriptors) {
        if (selectedBrowseCards.has(d.id) && !addedTypes.has(d.id)) {
          addedTypes.add(d.id)
          cardsToAdd.push({ type: d.id, title: d.title, description: d.description, visualization: d.visualization as CardSuggestion['visualization'], config: {} })
        }
      }
    }
    try { onAddCards(cardsToAdd) } catch (error) {
      console.error('Error adding cards:', error)
      showToast(t('dashboard.addCard.failedToAdd'), 'error')
    }
    setSelectedBrowseCards(new Set())
  }

  const totalSelected = selectedBrowseCards.size + selectedAiCards.size
  const dashboardLabel = dashboardName || t('dashboard.studio.currentDashboard', 'current dashboard')

  const aiExamples = [
    t('dashboard.addCard.exampleGpuUtil'),
    t('dashboard.addCard.examplePodIssues'),
    t('dashboard.addCard.exampleHelmReleases'),
    t('dashboard.addCard.exampleNamespaceQuotas'),
    t('dashboard.addCard.exampleOperatorStatus'),
    t('dashboard.addCard.exampleKustomizeGitOps'),
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        {/* AI query bar */}
        <div className="mb-4 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
          <p className="text-xs text-muted-foreground mb-2">
            Describe what you want to monitor — AI will suggest cards to add to <strong className="text-foreground">{dashboardLabel}</strong>
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerateWithQuery(aiQuery)}
              placeholder={t('dashboard.addCard.aiPlaceholder')}
              className="flex-1 px-3 py-1.5 bg-secondary rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            />
            <button
              onClick={() => handleGenerateWithQuery(aiQuery)}
              disabled={!aiQuery.trim() || isGenerating}
              className="px-3 py-1.5 bg-gradient-ks text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {isGenerating ? t('dashboard.addCard.thinking') : t('dashboard.addCard.generate')}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {aiExamples.map((example) => (
              <button
                key={example}
                onClick={() => { setAiQuery(example); handleGenerateWithQuery(example) }}
                className="px-2 py-0.5 text-2xs bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {/* AI suggestions (when generated) */}
        {aiSuggestions.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              AI Suggestions ({selectedAiCards.size} selected)
            </p>
            <div className="grid grid-cols-2 gap-2">
              {aiSuggestions.map((card, index) => {
                const isAlreadyAdded = existingCardTypes.includes(card.type)
                return (
                  <button
                    key={index}
                    onClick={() => !isAlreadyAdded && toggleAiCard(index)}
                    onMouseEnter={() => onHoverCard(card)}
                    onMouseLeave={() => onHoverCard(null)}
                    disabled={isAlreadyAdded}
                    className={`p-2 rounded-lg text-left transition-all ${isAlreadyAdded
                        ? 'bg-secondary/30 border-2 border-transparent opacity-50 cursor-not-allowed'
                        : selectedAiCards.has(index)
                          ? 'bg-purple-500/20 border-2 border-purple-500'
                          : 'bg-secondary/50 border-2 border-transparent hover:border-purple-500/30'
                      }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm">{visualizationIcons[card.visualization]}</span>
                      <span className="text-xs font-medium text-foreground">{tCard(`cards:titles.${card.type}`, card.title)}</span>
                    </div>
                    <p className="text-2xs text-muted-foreground line-clamp-1">{wrapAbbreviations(tCard(`cards:descriptions.${card.type}`, card.description))}</p>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Search + Create Custom */}
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              value={browseSearch}
              onChange={(e) => setBrowseSearch(e.target.value)}
              placeholder={t('dashboard.addCard.searchCards')}
              className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>
          <button onClick={() => openCardFactory()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors text-sm font-medium whitespace-nowrap shrink-0">
            <Wand2 className="w-4 h-4" />
            {t('dashboard.addCard.createCustom')}
          </button>
          <button onClick={() => openStatFactory()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors text-sm font-medium whitespace-nowrap shrink-0">
            <Activity className="w-4 h-4" />
            {t('dashboard.addCard.createStats')}
          </button>
        </div>

        {/* Recommended cards */}
        {!browseSearch.trim() && recommendedCards.length > 0 && (
          <div className="mb-3 rounded-xl border border-purple-500/20 bg-purple-500/5 p-3">
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
                    onMouseEnter={() => onHoverCard({ type: card.type, title: card.title, description: card.description, visualization: card.visualization })}
                    onMouseLeave={() => onHoverCard(null)}
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
        <div className="space-y-3">
          {Object.entries(filteredCatalog).map(([category, cards]) => {
            const availableCards = cards.filter(c => !existingCardTypes.includes(c.type))
            const allCategorySelected = availableCards.length > 0 && availableCards.every(c => selectedBrowseCards.has(c.type))
            return (
              <div key={category} className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center bg-secondary/50 hover:bg-secondary transition-colors">
                  <button onClick={() => toggleCategory(category)} className="flex-1 px-3 py-2 text-left text-sm font-medium text-foreground flex items-center justify-between">
                    <span>{CATEGORY_LOCALE_KEYS[category] ? tCard(`cards:categories.${CATEGORY_LOCALE_KEYS[category]}`, category) : category}</span>
                    <span className="text-xs text-muted-foreground">{cards.length} {t('dashboard.addCard.cards')} {expandedCategories.has(category) ? '\u25BC' : '\u25B6'}</span>
                  </button>
                  {availableCards.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const s = new Set(selectedBrowseCards)
                        if (allCategorySelected) availableCards.forEach(c => s.delete(c.type))
                        else availableCards.forEach(c => s.add(c.type))
                        setSelectedBrowseCards(s)
                      }}
                      className={`px-2 py-1 mr-2 text-xs rounded transition-colors ${allCategorySelected ? 'bg-purple-500/30 text-purple-300 hover:bg-purple-500/40' : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground'}`}
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
                        <button key={card.type} onClick={() => !isAlreadyAdded && toggleBrowseCard(card.type)} onMouseEnter={() => onHoverCard(card)} onMouseLeave={() => onHoverCard(null)} disabled={isAlreadyAdded}
                          className={`p-2 rounded-lg text-left transition-all ${isAlreadyAdded ? 'bg-secondary/30 opacity-50 cursor-not-allowed' : isSelected ? 'bg-purple-500/20 border-2 border-purple-500' : 'bg-secondary/30 border-2 border-transparent hover:border-purple-500/30'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm">{visualizationIcons[card.visualization]}</span>
                            <span className="text-xs font-medium text-foreground truncate">{tCard(`cards:titles.${card.type}`, card.title)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{wrapAbbreviations(tCard(`cards:descriptions.${card.type}`, card.description))}</p>
                          {isAlreadyAdded && <span className="text-xs text-muted-foreground">{t('dashboard.addCard.added')}</span>}
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

      {/* Sticky footer — only shown when cards are selected */}
      {totalSelected > 0 && (
      <div className="border-t border-border px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {`${totalSelected} card${totalSelected !== 1 ? 's' : ''} selected`}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => { setSelectedBrowseCards(new Set()); setSelectedAiCards(new Set()) }} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            {t('dashboard.addCard.clear')}
          </button>
          <button
            onClick={() => { if (selectedAiCards.size > 0) handleAddAiCards(); if (selectedBrowseCards.size > 0) handleAddBrowseCards() }}
            className="px-4 py-2 bg-gradient-ks text-primary-foreground rounded-lg font-medium flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {`Add ${totalSelected} to ${dashboardLabel}`}
          </button>
        </div>
      </div>
      )}

      {/* Sub-modals */}
      <CardFactoryModal isOpen={isCardFactoryOpen} onClose={closeCardFactory} onCardCreated={(cardId) => {
        onAddCards([{ type: 'dynamic_card', title: t('dashboard.addCard.customCard'), description: t('dashboard.addCard.dynamicallyCreated'), visualization: 'status', config: { dynamicCardId: cardId } }])
      }} />
      <StatBlockFactoryModal isOpen={isStatFactoryOpen} onClose={closeStatFactory} />
    </div>
  )
}
