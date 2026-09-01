import { useState, useEffect } from 'react'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import {
  SUITS, VALUES, SUIT_CONFIG, TIMER_TICK_MS, MAX_UNDO_HISTORY, SOLITAIRE_HIGH_SCORE_KEY,
  type CardValue, type PlayingCard, type GameState, type HighScore,
} from './solitaire.constants'

export function getValueIndex(value: CardValue): number {
  return VALUES.indexOf(value)
}

export function canPlaceOnFoundation(card: PlayingCard, foundation: PlayingCard[]): boolean {
  if (foundation.length === 0) return card.value === 'A'
  const top = foundation[foundation.length - 1]
  return top.suit === card.suit && getValueIndex(card.value) === getValueIndex(top.value) + 1
}

export function canPlaceOnTableau(card: PlayingCard, column: PlayingCard[]): boolean {
  if (column.length === 0) return card.value === 'K'
  const top = column[column.length - 1]
  if (!top.faceUp) return false
  const cardIsRed = SUIT_CONFIG[card.suit].isRed
  const topIsRed = SUIT_CONFIG[top.suit].isRed
  return cardIsRed !== topIsRed && getValueIndex(card.value) === getValueIndex(top.value) - 1
}

function createDeck(): PlayingCard[] {
  const deck: PlayingCard[] = []
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ id: `${suit}-${value}`, suit, value, faceUp: false })
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

export function dealGame(): GameState {
  const deck = createDeck()
  const tableau: PlayingCard[][] = [[], [], [], [], [], [], []]
  let cardIndex = 0
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      tableau[col].push({ ...deck[cardIndex], faceUp: row === col })
      cardIndex++
    }
  }
  const stock = deck.slice(cardIndex).map(c => ({ ...c, faceUp: false }))
  return { stock, waste: [], foundations: [[], [], [], []], tableau }
}

export interface SelectedCard {
  source: string
  index: number
  cardIndex?: number
}

export function useSolitaireGame() {
  const [game, setGame] = useState<GameState>(dealGame)
  const [moves, setMoves] = useState(0)
  const [time, setTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [hasWon, setHasWon] = useState(false)
  const [selectedCard, setSelectedCard] = useState<SelectedCard | null>(null)
  const [history, setHistory] = useState<{ game: GameState; moves: number }[]>([])
  const [highScore, setHighScore] = useState<HighScore | null>(() => {
    try {
      const stored = localStorage.getItem(SOLITAIRE_HIGH_SCORE_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    if (isPlaying && !hasWon) {
      interval = setInterval(() => setTime(t => t + 1), TIMER_TICK_MS)
    }
    return () => clearInterval(interval)
  }, [isPlaying, hasWon])

  useEffect(() => {
    const totalInFoundations = game.foundations.reduce((sum, f) => sum + f.length, 0)
    if (totalInFoundations === 52) {
      setHasWon(true)
      setIsPlaying(false)
      emitGameEnded('solitaire', 'win', moves)
      if (!highScore || moves < highScore.moves || (moves === highScore.moves && time < highScore.time)) {
        const newScore = { moves, time, date: new Date().toISOString() }
        setHighScore(newScore)
        try {
          localStorage.setItem(SOLITAIRE_HIGH_SCORE_KEY, JSON.stringify(newScore))
        } catch {
          // Ignore storage errors (e.g. private browsing, quota exceeded)
        }
      }
    }
  }, [game.foundations, moves, time, highScore])

  const newGame = () => {
    setGame(dealGame())
    setMoves(0)
    setTime(0)
    setIsPlaying(true)
    setHasWon(false)
    setSelectedCard(null)
    setHistory([])
    emitGameStarted('solitaire')
  }

  useEffect(() => {
    newGame()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveHistory = () => {
    setHistory(h => [...h.slice(-MAX_UNDO_HISTORY), { game: JSON.parse(JSON.stringify(game)), moves }])
  }

  const undo = () => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setGame(prev.game)
    setMoves(prev.moves)
    setHistory(h => h.slice(0, -1))
    setSelectedCard(null)
  }

  const drawFromStock = () => {
    if (!isPlaying) return
    saveHistory()
    setGame(g => {
      if (g.stock.length === 0) {
        return {
          ...g,
          stock: [...g.waste].reverse().map(c => ({ ...c, faceUp: false })),
          waste: [],
        }
      }
      const drawn = g.stock.slice(-1).map(c => ({ ...c, faceUp: true }))
      return { ...g, stock: g.stock.slice(0, -1), waste: [...g.waste, ...drawn] }
    })
    setMoves(m => m + 1)
    setSelectedCard(null)
  }

  const tryAutoFoundation = (card: PlayingCard, source: string, _cardIndex?: number): boolean => {
    for (let i = 0; i < 4; i++) {
      if (canPlaceOnFoundation(card, game.foundations[i])) {
        saveHistory()
        setGame(g => {
          const next = { ...g }
          next.foundations = g.foundations.map((f, idx) =>
            idx === i ? [...f, { ...card, faceUp: true }] : [...f]
          )
          if (source === 'waste') {
            next.waste = g.waste.slice(0, -1)
          } else if (source.startsWith('tableau-')) {
            const col = parseInt(source.split('-')[1])
            next.tableau = g.tableau.map((t, idx) => {
              if (idx !== col) return [...t]
              const newCol = t.slice(0, -1)
              if (newCol.length > 0 && !newCol[newCol.length - 1].faceUp) {
                newCol[newCol.length - 1] = { ...newCol[newCol.length - 1], faceUp: true }
              }
              return newCol
            })
          }
          return next
        })
        setMoves(m => m + 1)
        setSelectedCard(null)
        return true
      }
    }
    return false
  }

  const handleCardClick = (source: string, cardIndex?: number) => {
    if (!isPlaying) return

    let card: PlayingCard | null = null

    if (source === 'waste' && game.waste.length > 0) {
      card = game.waste[game.waste.length - 1]
    } else if (source.startsWith('tableau-')) {
      const col = parseInt(source.split('-')[1])
      if (cardIndex !== undefined && game.tableau[col][cardIndex]?.faceUp) {
        card = game.tableau[col].slice(cardIndex)[0]
      }
    } else if (source.startsWith('foundation-')) {
      const idx = parseInt(source.split('-')[1])
      if (game.foundations[idx].length > 0) {
        card = game.foundations[idx][game.foundations[idx].length - 1]
      }
    }

    if (!card) { setSelectedCard(null); return }

    if (!selectedCard) { setSelectedCard({ source, index: 0, cardIndex }); return }

    if (selectedCard.source === source && selectedCard.cardIndex === cardIndex) {
      setSelectedCard(null)
      return
    }

    let targetCards: PlayingCard[] = []
    if (selectedCard.source === 'waste' && game.waste.length > 0) {
      targetCards = [game.waste[game.waste.length - 1]]
    } else if (selectedCard.source.startsWith('tableau-')) {
      const col = parseInt(selectedCard.source.split('-')[1])
      if (selectedCard.cardIndex !== undefined) {
        targetCards = game.tableau[col].slice(selectedCard.cardIndex)
      }
    } else if (selectedCard.source.startsWith('foundation-')) {
      const idx = parseInt(selectedCard.source.split('-')[1])
      if (game.foundations[idx].length > 0) {
        targetCards = [game.foundations[idx][game.foundations[idx].length - 1]]
      }
    }

    if (targetCards.length === 0) { setSelectedCard({ source, index: 0, cardIndex }); return }

    const movingCard = targetCards[0]

    if (source.startsWith('tableau-')) {
      const destCol = parseInt(source.split('-')[1])
      if (canPlaceOnTableau(movingCard, game.tableau[destCol])) {
        saveHistory()
        setGame(g => {
          const next = { ...g }
          next.tableau = g.tableau.map((t, idx) => {
            if (idx === destCol) return [...t, ...targetCards.map(c => ({ ...c, faceUp: true }))]
            return [...t]
          })
          if (selectedCard.source === 'waste') {
            next.waste = g.waste.slice(0, -1)
          } else if (selectedCard.source.startsWith('tableau-')) {
            const srcCol = parseInt(selectedCard.source.split('-')[1])
            next.tableau = next.tableau.map((t, idx) => {
              if (idx !== srcCol) return t
              const newCol = g.tableau[srcCol].slice(0, selectedCard.cardIndex)
              if (newCol.length > 0 && !newCol[newCol.length - 1].faceUp) {
                newCol[newCol.length - 1] = { ...newCol[newCol.length - 1], faceUp: true }
              }
              return newCol
            })
          } else if (selectedCard.source.startsWith('foundation-')) {
            const srcIdx = parseInt(selectedCard.source.split('-')[1])
            next.foundations = g.foundations.map((f, idx) =>
              idx === srcIdx ? f.slice(0, -1) : [...f]
            )
          }
          return next
        })
        setMoves(m => m + 1)
        setSelectedCard(null)
        return
      }
    }

    if (source.startsWith('foundation-') && targetCards.length === 1) {
      const destIdx = parseInt(source.split('-')[1])
      if (canPlaceOnFoundation(movingCard, game.foundations[destIdx])) {
        saveHistory()
        setGame(g => {
          const next = { ...g }
          next.foundations = g.foundations.map((f, idx) =>
            idx === destIdx ? [...f, { ...movingCard, faceUp: true }] : [...f]
          )
          if (selectedCard.source === 'waste') {
            next.waste = g.waste.slice(0, -1)
          } else if (selectedCard.source.startsWith('tableau-')) {
            const srcCol = parseInt(selectedCard.source.split('-')[1])
            next.tableau = g.tableau.map((t, idx) => {
              if (idx !== srcCol) return [...t]
              const newCol = t.slice(0, -1)
              if (newCol.length > 0 && !newCol[newCol.length - 1].faceUp) {
                newCol[newCol.length - 1] = { ...newCol[newCol.length - 1], faceUp: true }
              }
              return newCol
            })
          }
          return next
        })
        setMoves(m => m + 1)
        setSelectedCard(null)
        return
      }
    }

    setSelectedCard({ source, index: 0, cardIndex })
  }

  const handleDoubleClick = (source: string, cardIndex?: number) => {
    if (!isPlaying) return
    let card: PlayingCard | null = null
    if (source === 'waste' && game.waste.length > 0) {
      card = game.waste[game.waste.length - 1]
    } else if (source.startsWith('tableau-')) {
      const col = parseInt(source.split('-')[1])
      const colCards = game.tableau[col]
      if (colCards.length > 0) {
        card = colCards[colCards.length - 1]
        cardIndex = colCards.length - 1
      }
    }
    if (card) tryAutoFoundation(card, source, cardIndex)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return {
    game,
    moves,
    time,
    isPlaying,
    hasWon,
    selectedCard,
    history,
    highScore,
    newGame,
    undo,
    drawFromStock,
    handleCardClick,
    handleDoubleClick,
    formatTime,
  }
}
