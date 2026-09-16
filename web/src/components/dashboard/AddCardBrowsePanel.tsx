import { Activity, Plus, Search, Sparkles, Wand2 } from 'lucide-react'
import { Input } from '../ui/Input'
import { CATEGORY_LOCALE_KEYS, visualizationIcons, wrapAbbreviations } from './shared/cardCatalog'
import { countAvailableCards } from './addCardModal.utils'
import type { AddCardBrowsePanelProps, CardCatalogEntry } from './addCardModal.types'

export function AddCardBrowsePanel({
  browseSearch,
  existingCardTypes,
  expandedCategories,
  filteredCatalog,
  openCardFactory,
  openStatFactory,
  recommendedCards,
  searchInputRef,
  selectedBrowseCards,
  t,
  tCard,
  onBrowseSearchChange,
  onHoverCardChange,
  onSelectedBrowseCardsChange,
  onToggleBrowseCard,
  onToggleCategory,
}: AddCardBrowsePanelProps) {
  return (
    <div className="flex-1 min-w-0">
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            value={browseSearch}
            onChange={(event) => onBrowseSearchChange(event.target.value)}
            placeholder={t('dashboard.addCard.searchCards')}
            className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
          />
        </div>
        <button
          onClick={openCardFactory}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors text-sm font-medium whitespace-nowrap shrink-0"
        >
          <Wand2 className="w-4 h-4" />
          {t('dashboard.addCard.createCustom')}
        </button>
        <button
          onClick={openStatFactory}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors text-sm font-medium whitespace-nowrap shrink-0"
        >
          <Activity className="w-4 h-4" />
          {t('dashboard.addCard.createStats')}
        </button>
      </div>

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
                  onClick={() => onToggleBrowseCard(card.type)}
                  onMouseEnter={() => onHoverCardChange(card)}
                  onMouseLeave={() => onHoverCardChange(null)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${isSelected
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

      <div className="max-h-[40vh] overflow-y-auto space-y-3">
        {Object.entries(filteredCatalog).map(([category, cards]) => (
          <CategorySection
            key={category}
            cards={cards}
            category={category}
            existingCardTypes={existingCardTypes}
            expandedCategories={expandedCategories}
            selectedBrowseCards={selectedBrowseCards}
            t={t}
            tCard={tCard}
            onHoverCardChange={onHoverCardChange}
            onSelectedBrowseCardsChange={onSelectedBrowseCardsChange}
            onToggleBrowseCard={onToggleBrowseCard}
            onToggleCategory={onToggleCategory}
          />
        ))}
      </div>
    </div>
  )
}

interface CategorySectionProps {
  cards: CardCatalogEntry[]
  category: string
  existingCardTypes: string[]
  expandedCategories: Set<string>
  selectedBrowseCards: Set<string>
  t: AddCardBrowsePanelProps['t']
  tCard: AddCardBrowsePanelProps['tCard']
  onHoverCardChange: AddCardBrowsePanelProps['onHoverCardChange']
  onSelectedBrowseCardsChange: AddCardBrowsePanelProps['onSelectedBrowseCardsChange']
  onToggleBrowseCard: AddCardBrowsePanelProps['onToggleBrowseCard']
  onToggleCategory: AddCardBrowsePanelProps['onToggleCategory']
}

function CategorySection({
  cards,
  category,
  existingCardTypes,
  expandedCategories,
  selectedBrowseCards,
  t,
  tCard,
  onHoverCardChange,
  onSelectedBrowseCardsChange,
  onToggleBrowseCard,
  onToggleCategory,
}: CategorySectionProps) {
  const availableCards = cards.filter(card => !existingCardTypes.includes(card.type))
  const allCategorySelected = countAvailableCards(cards, existingCardTypes) > 0
    && availableCards.every(card => selectedBrowseCards.has(card.type))

  const handleToggleAll = () => {
    const nextSelectedCards = new Set(selectedBrowseCards)

    if (allCategorySelected) {
      availableCards.forEach(card => nextSelectedCards.delete(card.type))
    } else {
      availableCards.forEach(card => nextSelectedCards.add(card.type))
    }

    onSelectedBrowseCardsChange(nextSelectedCards)
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center bg-secondary/50 hover:bg-secondary transition-colors">
        <button
          onClick={() => onToggleCategory(category)}
          className="flex-1 px-3 py-2 text-left text-sm font-medium text-foreground flex items-center justify-between"
        >
          <span>{CATEGORY_LOCALE_KEYS[category] ? tCard(`cards:categories.${CATEGORY_LOCALE_KEYS[category]}`, category) : category}</span>
          <span className="text-xs text-muted-foreground">
            {cards.length} {t('dashboard.addCard.cards')} {expandedCategories.has(category) ? '▼' : '▶'}
          </span>
        </button>
        {availableCards.length > 0 && (
          <button
            onClick={(event) => {
              event.stopPropagation()
              handleToggleAll()
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
                onClick={() => !isAlreadyAdded && onToggleBrowseCard(card.type)}
                onMouseEnter={() => onHoverCardChange(card)}
                onMouseLeave={() => onHoverCardChange(null)}
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
}
