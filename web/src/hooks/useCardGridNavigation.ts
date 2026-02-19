import { useCallback, useMemo, useRef } from 'react'

interface CardLike {
  id: string
  position: { w: number; h: number }
}

interface GridPosition {
  cardId: string
  index: number
  row: number
  colStart: number
}

interface UseCardGridNavigationOptions {
  cards: CardLike[]
  onExpandCard: (cardId: string) => void
  gridColumns?: number
}

function computeGridLayout(cards: CardLike[], gridColumns: number): GridPosition[] {
  const layout: GridPosition[] = []
  let row = 0
  let col = 0

  for (let i = 0; i < cards.length; i++) {
    const w = Math.min(cards[i].position.w, gridColumns)
    if (col + w > gridColumns) {
      row++
      col = 0
    }
    layout.push({ cardId: cards[i].id, index: i, row, colStart: col })
    col += w
  }
  return layout
}

export function useCardGridNavigation({
  cards,
  onExpandCard,
  gridColumns = 12,
}: UseCardGridNavigationOptions) {
  const cardRefMap = useRef<Map<string, HTMLElement>>(new Map())

  const layout = useMemo(
    () => computeGridLayout(cards, gridColumns),
    [cards, gridColumns]
  )

  const registerCardRef = useCallback((cardId: string, el: HTMLElement | null) => {
    if (el) {
      cardRefMap.current.set(cardId, el)
    } else {
      cardRefMap.current.delete(cardId)
    }
  }, [])

  const focusCard = useCallback((cardId: string) => {
    const el = cardRefMap.current.get(cardId)
    el?.focus()
  }, [])

  const handleGridKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Don't handle if inside a modal or input
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target instanceof HTMLElement && e.target.closest('[role="dialog"]'))
    ) {
      return
    }

    // Find which card is focused
    const target = e.currentTarget as HTMLElement
    let currentIdx = -1
    for (let i = 0; i < layout.length; i++) {
      if (cardRefMap.current.get(layout[i].cardId) === target) {
        currentIdx = i
        break
      }
    }
    if (currentIdx === -1) return

    const current = layout[currentIdx]

    switch (e.key) {
      case 'ArrowRight': {
        e.preventDefault()
        const next = layout[currentIdx + 1]
        if (next) focusCard(next.cardId)
        break
      }
      case 'ArrowLeft': {
        e.preventDefault()
        const prev = layout[currentIdx - 1]
        if (prev) focusCard(prev.cardId)
        break
      }
      case 'ArrowDown': {
        e.preventDefault()
        const belowCards = layout.filter(p => p.row === current.row + 1)
        if (belowCards.length > 0) {
          const nearest = belowCards.reduce((best, p) =>
            Math.abs(p.colStart - current.colStart) < Math.abs(best.colStart - current.colStart) ? p : best
          )
          focusCard(nearest.cardId)
        }
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        const aboveCards = layout.filter(p => p.row === current.row - 1)
        if (aboveCards.length > 0) {
          const nearest = aboveCards.reduce((best, p) =>
            Math.abs(p.colStart - current.colStart) < Math.abs(best.colStart - current.colStart) ? p : best
          )
          focusCard(nearest.cardId)
        }
        break
      }
      case 'Enter':
      case ' ': {
        // Only expand when the card container itself is focused, not a button inside it
        if (e.target === e.currentTarget) {
          e.preventDefault()
          onExpandCard(current.cardId)
        }
        break
      }
    }
  }, [layout, onExpandCard, focusCard])

  return { registerCardRef, handleGridKeyDown }
}
