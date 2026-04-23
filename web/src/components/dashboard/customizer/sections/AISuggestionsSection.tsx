/**
 * AISuggestionsSection — AI-powered card suggestion tab extracted from AddCardModal.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Plus, Loader2 } from 'lucide-react'
import { RETRY_DELAY_MS } from '../../../../lib/constants/network'
import {
  visualizationIcons,
  wrapAbbreviations,
  generateCardSuggestions,
} from '../../shared/cardCatalog'
import type { CardSuggestion } from '../../shared/cardCatalog'

interface AISuggestionsSectionProps {
  existingCardTypes: string[]
  onAddCards: (cards: CardSuggestion[]) => void
  /** Dashboard name for context */
  dashboardName?: string
  /** Hover callback for preview panel */
  onHoverCard?: (card: { type: string; title: string; description: string; visualization: string } | null) => void
}

export function AISuggestionsSection({
  existingCardTypes,
  onAddCards,
  dashboardName,
  onHoverCard,
}: AISuggestionsSectionProps) {
  const { t } = useTranslation()
  const tCard = t as (key: string, defaultValue?: string) => string
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<CardSuggestion[]>([])
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set())
  const [isGenerating, setIsGenerating] = useState(false)

  /** Generate suggestions for a given query string */
  const handleGenerateWithQuery = async (q: string) => {
    if (!q.trim()) return
    setIsGenerating(true)
    setSuggestions([])
    setSelectedCards(new Set())
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    const results = generateCardSuggestions(q)
    setSuggestions(results)
    setSelectedCards(new Set(results.map((card, i) => existingCardTypes.includes(card.type) ? -1 : i).filter(i => i !== -1)))
    setIsGenerating(false)
  }

  const handleGenerate = () => handleGenerateWithQuery(query)

  const toggleCard = (index: number) => {
    const newSelected = new Set(selectedCards)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedCards(newSelected)
  }

  const handleAddCards = () => {
    const cardsToAdd = suggestions.filter((_, i) => selectedCards.has(i))
    onAddCards(cardsToAdd)
    setQuery('')
    setSuggestions([])
    setSelectedCards(new Set())
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        {/* Context + Query input */}
        <div className="mb-4">
          <p className="text-sm text-muted-foreground mb-3">
            {t('dashboard.studio.aiContext', `Describe what you want to monitor and AI will suggest cards to add to ${dashboardName ? `"${dashboardName}"` : 'your current dashboard'}. Cards are visual widgets that display real-time data from your clusters.`)}
          </p>
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

        {/* Example queries — always visible so user can try different ones */}
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
                  onClick={() => { setQuery(example); handleGenerateWithQuery(example) }}
                  className="px-3 py-1 text-xs bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              {t('dashboard.addCard.suggestedCards', { count: selectedCards.size })}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {suggestions.map((card, index) => {
                const isAlreadyAdded = existingCardTypes.includes(card.type)
                return (
                  <button
                    key={index}
                    onClick={() => !isAlreadyAdded && toggleCard(index)}
                    onMouseEnter={() => onHoverCard?.(card)}
                    onMouseLeave={() => onHoverCard?.(null)}
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
      </div>

      {/* Footer */}
      {suggestions.length > 0 && (
        <div className="border-t border-border px-4 py-3 flex items-center justify-end gap-3 bg-background">
          <button
            onClick={handleAddCards}
            disabled={selectedCards.size === 0}
            className="px-4 py-2 bg-gradient-ks text-primary-foreground rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('dashboard.addCard.addCount', { count: selectedCards.size })}
          </button>
        </div>
      )}
    </div>
  )
}
