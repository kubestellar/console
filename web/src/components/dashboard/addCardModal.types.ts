import type { RefObject } from 'react'
import type { DynamicCardDefinition } from '../../lib/dynamic-cards'
import type { CardSuggestion, HoveredCard } from './shared/cardCatalog'

export interface AddCardModalProps {
  isOpen: boolean
  onClose: () => void
  onAddCards: (cards: CardSuggestion[]) => void
  existingCardTypes?: string[]
  initialSearch?: string
}

export type AddCardTab = 'ai' | 'browse'

export type CardTranslation = (key: string, defaultValue?: string) => string
export type DashboardTranslation = (key: string, options?: string | Record<string, unknown>) => string

export type CardCatalogEntry = Pick<HoveredCard, 'type' | 'title' | 'description'> & {
  visualization: CardSuggestion['visualization']
}

export type CardCatalogMap = Record<string, CardCatalogEntry[]>

export interface AddCardBrowsePanelProps {
  browseSearch: string
  existingCardTypes: string[]
  expandedCategories: Set<string>
  filteredCatalog: CardCatalogMap
  openCardFactory: () => void
  openStatFactory: () => void
  recommendedCards: CardCatalogEntry[]
  searchInputRef: RefObject<HTMLInputElement | null>
  selectedBrowseCards: Set<string>
  t: DashboardTranslation
  tCard: CardTranslation
  onBrowseSearchChange: (value: string) => void
  onHoverCardChange: (card: HoveredCard | null) => void
  onSelectedBrowseCardsChange: (cards: Set<string>) => void
  onToggleBrowseCard: (cardType: string) => void
  onToggleCategory: (category: string) => void
}

export interface AddCardAiPanelProps {
  existingCardTypes: string[]
  isGenerating: boolean
  query: string
  selectedCards: Set<number>
  suggestions: CardSuggestion[]
  t: DashboardTranslation
  tCard: CardTranslation
  onGenerate: () => void
  onQueryChange: (value: string) => void
  onToggleCard: (index: number) => void
}

export interface AddCardPreviewPanelProps {
  hoveredCard: HoveredCard | null
  t: DashboardTranslation
  tCard: CardTranslation
}

export interface BuildBrowseCardsArgs {
  dynamicCards: DynamicCardDefinition[]
  selectedBrowseCards: Set<string>
  t: DashboardTranslation
}
