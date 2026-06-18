import type { Card } from './dashboardUtils'

export function buildCardsFromSuggestions(
  suggestions: Array<{
    type: string
    title: string
    visualization: string
    config: Record<string, unknown>
  }>,
  mapVisualizationToCardType: (visualization: string, type: string) => string,
  getDefaultCardSize: (cardType: string) => { w: number; h: number },
): Card[] {
  return suggestions.map((suggestion, index) => {
    const cardType = mapVisualizationToCardType(suggestion.visualization, suggestion.type)
    const size = getDefaultCardSize(cardType)
    return {
      id: `new-${Date.now()}-${index}`,
      card_type: cardType,
      config: suggestion.config,
      position: { x: 0, y: 0, ...size },
      title: suggestion.title,
    }
  })
}
