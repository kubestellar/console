import { Loader2, Sparkles } from 'lucide-react'
import { visualizationIcons, wrapAbbreviations } from './shared/cardCatalog'
import type { AddCardAiPanelProps } from './addCardModal.types'

const EXAMPLE_KEYS = [
  'dashboard.addCard.exampleGpuUtil',
  'dashboard.addCard.examplePodIssues',
  'dashboard.addCard.exampleHelmReleases',
  'dashboard.addCard.exampleNamespaceQuotas',
  'dashboard.addCard.exampleOperatorStatus',
  'dashboard.addCard.exampleKustomizeGitOps',
] as const

export function AddCardAiPanel({
  existingCardTypes,
  isGenerating,
  query,
  selectedCards,
  suggestions,
  t,
  tCard,
  onGenerate,
  onQueryChange,
  onToggleCard,
}: AddCardAiPanelProps) {
  const examples = EXAMPLE_KEYS.map(key => t(key))

  return (
    <>
      <div className="mb-4">
        <label className="block text-sm text-muted-foreground mb-2">
          {t('dashboard.addCard.describeWhatYouWant')}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && onGenerate()}
            placeholder={t('dashboard.addCard.aiPlaceholder')}
            className="flex-1 px-4 py-2 bg-secondary rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
          />
          <button
            onClick={onGenerate}
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

      {!suggestions.length && !isGenerating && (
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-2">{t('dashboard.addCard.tryAsking')}</p>
          <div className="flex flex-wrap gap-2">
            {examples.map((example) => (
              <button
                key={example}
                onClick={() => onQueryChange(example)}
                className="px-3 py-1 text-xs bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

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
                  onClick={() => !isAlreadyAdded && onToggleCard(index)}
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
  )
}
