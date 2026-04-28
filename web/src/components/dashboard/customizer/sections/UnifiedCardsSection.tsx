/**
 * UnifiedCardsSection — combines AI suggestions + browse catalog into one view.
 *
 * Layout: AI query bar at top → suggestion chips when results exist →
 * full browse catalog below. No tabs needed.
 */
import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Plus, Loader2, Search } from 'lucide-react'
import { getAllDynamicCards, onRegistryChange } from '../../../../lib/dynamic-cards'
import { useToast } from '../../../ui/Toast'
import { FOCUS_DELAY_MS, RETRY_DELAY_MS } from '../../../../lib/constants/network'
import { emitCardCategoryBrowsed } from '../../../../lib/analytics'
import { isCardVisibleForProject } from '../../../../config/cards'
import { getDescriptorsByCategory } from '../../../cards/cardDescriptor'
import {
  CARD_CATALOG,
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
  // Card/Stat factories are now separate nav items in Console Studio
  const [browseSearch, setBrowseSearch] = useState(initialSearch || '')
  const [selectedBrowseCards, setSelectedBrowseCards] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set([...Object.keys(CARD_CATALOG), 'Custom Cards']))
  const searchInputRef = useRef<HTMLInputElement>(null)

  // AI state — query is synced with browseSearch via handleUnifiedSearch
  const [aiSuggestions, setAiSuggestions] = useState<CardSuggestion[]>([])
  const [selectedAiCards, setSelectedAiCards] = useState<Set<number>>(new Set())
  const [isGenerating, setIsGenerating] = useState(false)

  // Dynamic cards from registry
  const [dynamicCards, setDynamicCards] = useState(() => getAllDynamicCards())
  useEffect(() => {
    const unsub = onRegistryChange(() => setDynamicCards(getAllDynamicCards()))
    return unsub
  }, [])

  // Static recommendations removed — AI suggestions at top is the smarter approach

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
    // Clear browse search so full catalog shows below AI suggestions
    setBrowseSearch('')
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
    setBrowseSearch('')
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
  const dashboardLabel = dashboardName || 'your dashboard'

  const aiExamples = [
    t('dashboard.addCard.exampleGpuUtil'),
    t('dashboard.addCard.examplePodIssues'),
    t('dashboard.addCard.exampleHelmReleases'),
    t('dashboard.addCard.exampleNamespaceQuotas'),
    t('dashboard.addCard.exampleOperatorStatus'),
    t('dashboard.addCard.exampleKustomizeGitOps'),
  ]

  // Unified search: filters catalog instantly, and can AI-generate on Enter or button click
  const handleUnifiedSearch = (value: string) => {
    setBrowseSearch(value)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        {/* Single unified search bar */}
        <div className="mb-3">
          <p className="text-xs text-muted-foreground mb-2">
            Search the card catalog or describe what you need — cards will be added to the {dashboardLabel} dashboard
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={browseSearch}
                onChange={(e) => handleUnifiedSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && browseSearch.trim() && handleGenerateWithQuery(browseSearch)}
                placeholder="Search cards or describe what you want to monitor..."
                className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
              />
            </div>
            <button
              onClick={() => handleGenerateWithQuery(browseSearch)}
              disabled={!browseSearch.trim() || isGenerating}
              className="px-3 py-2 bg-gradient-ks text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
              title="Use AI to suggest cards based on your query"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {isGenerating ? 'Thinking...' : 'AI Suggest'}
            </button>
          </div>
          {/* Quick AI prompts — click to auto-generate card suggestions */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-xs text-muted-foreground mr-1">Try:</span>
            {aiExamples.map((example) => (
              <button
                key={example}
                onClick={() => { handleUnifiedSearch(example); handleGenerateWithQuery(example) }}
                className="px-2 py-0.5 text-xs bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {/* AI suggestions (shown when generated, above catalog results) */}
        {aiSuggestions.length > 0 && (
          <div className="mb-4 p-3 rounded-lg border border-purple-500/20 bg-purple-500/5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                AI Suggestions ({selectedAiCards.size} selected)
              </p>
              <button
                onClick={() => { setAiSuggestions([]); setSelectedAiCards(new Set()); setBrowseSearch('') }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear &amp; show all cards
              </button>
            </div>
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
                    <p className="text-xs text-muted-foreground line-clamp-1">{wrapAbbreviations(tCard(`cards:descriptions.${card.type}`, card.description))}</p>
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

      {/* Sticky footer — always rendered to prevent height shift; hidden when nothing selected */}
      <div className={`border-t border-border px-4 py-3 flex items-center justify-between shrink-0 transition-all ${
        totalSelected > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none h-0 py-0 overflow-hidden border-t-0'
      }`}>
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
            {`Add ${totalSelected} to ${dashboardLabel} dashboard`}
          </button>
        </div>
      </div>

      {/* Card/Stat factories are now separate Console Studio nav items */}
    </div>
  )
}
