import { isCardVisibleForProject } from '../../config/cards'
import { CARD_CATALOG, MAX_RECOMMENDED_CARDS, RECOMMENDED_CARD_TYPES } from './shared/cardCatalog'
import { getDescriptorsByCategory } from '../cards/cardDescriptor'
import type { BuildBrowseCardsArgs, CardCatalogEntry, CardCatalogMap, DashboardTranslation } from './addCardModal.types'
import type { CardSuggestion } from './shared/cardCatalog'

export const CUSTOM_CARDS_CATEGORY = 'Custom Cards'

function toCatalogEntry(card: {
  type: string
  title: string
  description: string
  visualization: string
}): CardCatalogEntry {
  return {
    type: card.type,
    title: card.title,
    description: card.description,
    visualization: card.visualization as CardSuggestion['visualization'],
  }
}

export function buildRecommendedCards(existingCardTypes: string[]): CardCatalogEntry[] {
  const existing = new Set(existingCardTypes)
  const catalogCards = Object.values(CARD_CATALOG).flat().map(toCatalogEntry)
  const descriptorCards = Array.from(getDescriptorsByCategory().values()).flat().map(descriptor =>
    toCatalogEntry({
      type: descriptor.id,
      title: descriptor.title,
      description: descriptor.description,
      visualization: descriptor.visualization,
    }),
  )
  const allCards = [...catalogCards, ...descriptorCards]

  return RECOMMENDED_CARD_TYPES
    .filter(type => !existing.has(type))
    .map(type => allCards.find(card => card.type === type))
    .filter((card): card is CardCatalogEntry => card != null)
    .slice(0, MAX_RECOMMENDED_CARDS)
}

export function buildMergedCatalog(
  dynamicCards: BuildBrowseCardsArgs['dynamicCards'],
  t: DashboardTranslation,
): CardCatalogMap {
  const dynamicCatalogEntries = dynamicCards.map(card => ({
    type: `dynamic_card::${card.id}`,
    title: card.title,
    description: card.description || t('dashboard.addCard.customDynamicCard'),
    visualization: card.tier === 'tier1' ? 'table' : 'status',
  } satisfies CardCatalogEntry))

  const staticCatalog = Object.fromEntries(
    Object.entries(CARD_CATALOG).map(([category, cards]) => [
      category,
      cards.filter(card => isCardVisibleForProject(card.type)).map(toCatalogEntry),
    ]).filter(([, cards]) => cards.length > 0),
  ) as CardCatalogMap

  const descriptorsByCategory = getDescriptorsByCategory()
  for (const [category, descriptors] of descriptorsByCategory) {
    const existingCards = staticCatalog[category] || []
    const existingTypes = new Set(existingCards.map(card => card.type))

    for (const descriptor of descriptors) {
      if (!existingTypes.has(descriptor.id)) {
        existingCards.push(toCatalogEntry({
          type: descriptor.id,
          title: descriptor.title,
          description: descriptor.description,
          visualization: descriptor.visualization,
        }))
      }
    }

    staticCatalog[category] = existingCards
  }

  return {
    ...(dynamicCatalogEntries.length > 0 ? { [CUSTOM_CARDS_CATEGORY]: dynamicCatalogEntries } : {}),
    ...staticCatalog,
  }
}

export function filterCatalog(catalog: CardCatalogMap, searchQuery: string): CardCatalogMap {
  if (!searchQuery.trim()) {
    return Object.fromEntries(
      Object.entries(catalog).map(([category, cards]) => [category, [...cards]]),
    ) as CardCatalogMap
  }

  const search = searchQuery.toLowerCase()

  return Object.entries(catalog).reduce<CardCatalogMap>((accumulator, [category, cards]) => {
    const filteredCards = cards.filter(card =>
      card.title.toLowerCase().includes(search)
      || card.description.toLowerCase().includes(search)
      || card.type.toLowerCase().includes(search),
    )

    if (filteredCards.length > 0) {
      accumulator[category] = filteredCards
    }

    return accumulator
  }, {})
}

export function countAvailableCards(cards: CardCatalogEntry[], existingCardTypes: string[]): number {
  return cards.filter(card => !existingCardTypes.includes(card.type)).length
}

export function buildBrowseCardsToAdd({ dynamicCards, selectedBrowseCards, t }: BuildBrowseCardsArgs): CardSuggestion[] {
  const cardsToAdd: CardSuggestion[] = []
  const addedTypes = new Set<string>()

  for (const dynamicCard of dynamicCards) {
    const key = `dynamic_card::${dynamicCard.id}`
    if (selectedBrowseCards.has(key) && !addedTypes.has(key)) {
      addedTypes.add(key)
      cardsToAdd.push({
        type: 'dynamic_card',
        title: dynamicCard.title,
        description: dynamicCard.description || t('dashboard.addCard.customDynamicCard'),
        visualization: (dynamicCard.tier === 'tier1' ? 'table' : 'status') as CardSuggestion['visualization'],
        config: { dynamicCardId: dynamicCard.id },
      })
    }
  }

  for (const cards of Object.values(CARD_CATALOG)) {
    for (const card of cards) {
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

  for (const descriptors of getDescriptorsByCategory().values()) {
    for (const descriptor of descriptors) {
      if (selectedBrowseCards.has(descriptor.id) && !addedTypes.has(descriptor.id)) {
        addedTypes.add(descriptor.id)
        cardsToAdd.push({
          type: descriptor.id,
          title: descriptor.title,
          description: descriptor.description,
          visualization: descriptor.visualization as CardSuggestion['visualization'],
          config: {},
        })
      }
    }
  }

  return cardsToAdd
}

