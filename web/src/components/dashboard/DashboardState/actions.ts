import type { Card } from '../dashboardUtils'

export function createCardActionHandlers(
  setCards: React.Dispatch<React.SetStateAction<Card[]>>,
  snapshot: (cards: Card[]) => void,
) {
  const updateCard = (cardId: string, updates: Partial<Card>) => {
    snapshot(setCards as any)
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, ...updates } : c))
  }

  const removeCard = (cardId: string) => {
    snapshot(setCards as any)
    setCards(prev => prev.filter(c => c.id !== cardId))
  }

  const addCards = (newCards: Card[]) => {
    snapshot(setCards as any)
    setCards(prev => [...newCards, ...prev])
  }

  const moveCard = (fromIndex: number, toIndex: number) => {
    snapshot(setCards as any)
    setCards(prev => {
      const newCards = [...prev]
      const [moved] = newCards.splice(fromIndex, 1)
      newCards.splice(toIndex, 0, moved)
      return newCards
    })
  }

  return { updateCard, removeCard, addCards, moveCard }
}
