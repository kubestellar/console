import { useState, useEffect, useCallback } from 'react'
import {
  Box, Server, Database, Cpu,
  RotateCcw, Trophy, Undo2, Play
} from 'lucide-react'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'

// Kubernetes-themed suits (replacing hearts, diamonds, clubs, spades)
type Suit = 'pods' | 'containers' | 'clusters' | 'nodes'
type CardValue = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

const SUITS: Suit[] = ['pods', 'containers', 'clusters', 'nodes']
const VALUES: CardValue[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

// Suit colors: red suits (pods, containers) and black suits (clusters, nodes)
const SUIT_CONFIG: Record<Suit, { Icon: typeof Box; color: string; isRed: boolean }> = {
  pods: { Icon: Box, color: 'text-blue-400', isRed: true },
  containers: { Icon: Database, color: 'text-green-400', isRed: true },
  clusters: { Icon: Server, color: 'text-orange-400', isRed: false },
  nodes: { Icon: Cpu, color: 'text-purple-400', isRed: false },
}

interface PlayingCard {
  id: string
  suit: Suit
  value: CardValue
  faceUp: boolean
}

interface GameState {
  stock: PlayingCard[]      // Draw pile
  waste: PlayingCard[]      // Flipped cards from stock
  foundations: PlayingCard[][] // 4 foundation piles (build A->K by suit)
  tableau: PlayingCard[][]  // 7 tableau columns
}

interface HighScore {
  moves: number
  time: number
  date: string
}

// Get numeric value for comparison
function getValueIndex(value: CardValue): number {
  return VALUES.indexOf(value)
}

// Check if card can be placed on foundation
function canPlaceOnFoundation(card: PlayingCard, foundation: PlayingCard[]): boolean {
  if (foundation.length === 0) {
    return card.value === 'A'
  }
  const topCard = foundation[foundation.length - 1]
  return topCard.suit === card.suit && getValueIndex(card.value) === getValueIndex(topCard.value) + 1
}

// Check if card can be placed on tableau column
function canPlaceOnTableau(card: PlayingCard, column: PlayingCard[]): boolean {
  if (column.length === 0) {
    return card.value === 'K'
  }
  const topCard = column[column.length - 1]
  if (!topCard.faceUp) return false

  const cardIsRed = SUIT_CONFIG[card.suit].isRed
  const topIsRed = SUIT_CONFIG[topCard.suit].isRed

  return cardIsRed !== topIsRed && getValueIndex(card.value) === getValueIndex(topCard.value) - 1
}

// Create and shuffle deck
function createDeck(): PlayingCard[] {
  const deck: PlayingCard[] = []
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({
        id: `${suit}-${value}`,
        suit,
        value,
        faceUp: false,
      })
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

// Deal initial game
function dealGame(): GameState {
  const deck = createDeck()
  const tableau: PlayingCard[][] = [[], [], [], [], [], [], []]

  // Deal to tableau (1 card to col 1, 2 to col 2, etc.)
  let cardIndex = 0
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      const card = { ...deck[cardIndex], faceUp: row === col }
      tableau[col].push(card)
      cardIndex++
    }
  }

  // Remaining cards go to stock
  const stock = deck.slice(cardIndex).map(c => ({ ...c, faceUp: false }))

  return {
    stock,
    waste: [],
    foundations: [[], [], [], []],
    tableau,
  }
}

// Card sizing - small (in card), medium (expanded), large (fullscreen)
type CardSize = 'small' | 'medium' | 'large'

const CARD_SIZES: Record<CardSize, { w: number; h: number; text: string; icon: string; centerIcon: string; overlap: number }> = {
  small: { w: 32, h: 44, text: 'text-[8px]', icon: 'w-2 h-2', centerIcon: 'w-4 h-4', overlap: -32 },
  medium: { w: 56, h: 77, text: 'text-xs', icon: 'w-3 h-3', centerIcon: 'w-6 h-6', overlap: -56 },
  large: { w: 80, h: 110, text: 'text-sm', icon: 'w-4 h-4', centerIcon: 'w-8 h-8', overlap: -80 },
}

// Card component
function Card({
  card,
  onClick,
  onDoubleClick,
  isDragging,
  isSelected,
  size = 'medium',
}: {
  card: PlayingCard | null
  onClick?: () => void
  onDoubleClick?: () => void
  isDragging?: boolean
  isSelected?: boolean
  size?: CardSize
}) {
  const { w, h, text, icon, centerIcon } = CARD_SIZES[size]

  if (!card) {
    return (
      <div
        style={{ width: w, height: h }}
        className="rounded border-2 border-dashed border-border/30 bg-secondary/20"
        onClick={onClick}
      />
    )
  }

  const { Icon, color } = SUIT_CONFIG[card.suit]

  if (!card.faceUp) {
    return (
      <div
        onClick={onClick}
        style={{ width: w, height: h }}
        className="rounded border border-border bg-gradient-to-br from-indigo-600 to-purple-700 cursor-pointer hover:brightness-110 transition-all shadow-sm flex items-center justify-center"
      >
        <div className={`${size === 'small' ? 'w-4 h-4' : size === 'medium' ? 'w-6 h-6' : 'w-8 h-8'} rounded-full bg-white/10 flex items-center justify-center`}>
          <span className={`text-white/50 font-bold ${size === 'small' ? 'text-[6px]' : size === 'medium' ? 'text-xs' : 'text-sm'}`}>K8s</span>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{ width: w, height: h }}
      className={`${text} rounded border bg-card cursor-pointer hover:brightness-110 transition-all shadow-sm p-0.5 flex flex-col justify-between ${
        isDragging ? 'opacity-50' : ''
      } ${
        isSelected ? 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-background' : 'border-border'
      }`}
    >
      <div className={`flex items-center gap-0.5 ${color}`}>
        <span className="font-bold">{card.value}</span>
        <Icon className={icon} />
      </div>
      <div className={`flex items-center justify-center ${color}`}>
        <Icon className={centerIcon} />
      </div>
      <div className={`flex items-center gap-0.5 justify-end rotate-180 ${color}`}>
        <span className="font-bold">{card.value}</span>
        <Icon className={icon} />
      </div>
    </div>
  )
}

// Stock pile (click to draw)
function StockPile({
  cards,
  onClick,
  size = 'medium',
}: {
  cards: PlayingCard[]
  onClick: () => void
  size?: CardSize
}) {
  const { w, h } = CARD_SIZES[size]

  if (cards.length === 0) {
    return (
      <div
        onClick={onClick}
        style={{ width: w, height: h }}
        className="rounded border-2 border-dashed border-green-500/50 bg-green-500/10 cursor-pointer hover:bg-green-500/20 transition-colors flex items-center justify-center"
        title="Click to reset stock"
      >
        <RotateCcw className={`${size === 'small' ? 'w-3 h-3' : size === 'medium' ? 'w-4 h-4' : 'w-5 h-5'} text-green-400`} />
      </div>
    )
  }

  return (
    <div onClick={onClick} className="cursor-pointer" title="Click to draw">
      <Card card={{ ...cards[0], faceUp: false }} size={size} />
    </div>
  )
}

export function Solitaire(_props: CardComponentProps) {
  const { isExpanded } = useCardExpanded()
  const [game, setGame] = useState<GameState>(dealGame)
  const [moves, setMoves] = useState(0)
  const [time, setTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [hasWon, setHasWon] = useState(false)
  const [selectedCard, setSelectedCard] = useState<{ source: string; index: number; cardIndex?: number } | null>(null)
  const [history, setHistory] = useState<{ game: GameState; moves: number }[]>([])
  const [highScore, setHighScore] = useState<HighScore | null>(() => {
    try {
      const stored = localStorage.getItem('solitaire-high-score')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  // Timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>
    if (isPlaying && !hasWon) {
      interval = setInterval(() => setTime(t => t + 1), 1000)
    }
    return () => clearInterval(interval)
  }, [isPlaying, hasWon])

  // Check for win
  useEffect(() => {
    const totalInFoundations = game.foundations.reduce((sum, f) => sum + f.length, 0)
    if (totalInFoundations === 52) {
      setHasWon(true)
      setIsPlaying(false)

      // Save high score
      if (!highScore || moves < highScore.moves || (moves === highScore.moves && time < highScore.time)) {
        const newScore = { moves, time, date: new Date().toISOString() }
        setHighScore(newScore)
        localStorage.setItem('solitaire-high-score', JSON.stringify(newScore))
      }
    }
  }, [game.foundations, moves, time, highScore])

  // Start new game
  const newGame = useCallback(() => {
    setGame(dealGame())
    setMoves(0)
    setTime(0)
    setIsPlaying(true)
    setHasWon(false)
    setSelectedCard(null)
    setHistory([])
  }, [])

  // Start on mount
  useEffect(() => {
    newGame()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Save state for undo
  const saveHistory = useCallback(() => {
    setHistory(h => [...h.slice(-19), { game: JSON.parse(JSON.stringify(game)), moves }])
  }, [game, moves])

  // Undo
  const undo = useCallback(() => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setGame(prev.game)
    setMoves(prev.moves)
    setHistory(h => h.slice(0, -1))
    setSelectedCard(null)
  }, [history])

  // Draw from stock
  const drawFromStock = useCallback(() => {
    if (!isPlaying) return
    saveHistory()

    setGame(g => {
      if (g.stock.length === 0) {
        // Reset: move waste back to stock
        return {
          ...g,
          stock: [...g.waste].reverse().map(c => ({ ...c, faceUp: false })),
          waste: [],
        }
      }
      // Draw 1 card (standard draw-1 rules)
      const drawn = g.stock.slice(-1).map(c => ({ ...c, faceUp: true }))
      return {
        ...g,
        stock: g.stock.slice(0, -1),
        waste: [...g.waste, ...drawn],
      }
    })
    setMoves(m => m + 1)
    setSelectedCard(null)
  }, [isPlaying, saveHistory])

  // Try to auto-move card to foundation
  const tryAutoFoundation = useCallback((card: PlayingCard, source: string, _cardIndex?: number): boolean => {
    for (let i = 0; i < 4; i++) {
      if (canPlaceOnFoundation(card, game.foundations[i])) {
        saveHistory()
        setGame(g => {
          const newGame = { ...g }
          newGame.foundations = g.foundations.map((f, idx) =>
            idx === i ? [...f, { ...card, faceUp: true }] : [...f]
          )

          if (source === 'waste') {
            newGame.waste = g.waste.slice(0, -1)
          } else if (source.startsWith('tableau-')) {
            const col = parseInt(source.split('-')[1])
            newGame.tableau = g.tableau.map((t, idx) => {
              if (idx !== col) return [...t]
              const newCol = t.slice(0, -1)
              if (newCol.length > 0 && !newCol[newCol.length - 1].faceUp) {
                newCol[newCol.length - 1] = { ...newCol[newCol.length - 1], faceUp: true }
              }
              return newCol
            })
          }

          return newGame
        })
        setMoves(m => m + 1)
        setSelectedCard(null)
        return true
      }
    }
    return false
  }, [game.foundations, saveHistory])

  // Handle card click (select or move)
  const handleCardClick = useCallback((source: string, cardIndex?: number) => {
    if (!isPlaying) return

    let card: PlayingCard | null = null
    let cards: PlayingCard[] = []

    if (source === 'waste' && game.waste.length > 0) {
      card = game.waste[game.waste.length - 1]
      cards = [card]
    } else if (source.startsWith('tableau-')) {
      const col = parseInt(source.split('-')[1])
      if (cardIndex !== undefined && game.tableau[col][cardIndex]?.faceUp) {
        cards = game.tableau[col].slice(cardIndex)
        card = cards[0]
      }
    } else if (source.startsWith('foundation-')) {
      const idx = parseInt(source.split('-')[1])
      if (game.foundations[idx].length > 0) {
        card = game.foundations[idx][game.foundations[idx].length - 1]
        cards = [card]
      }
    }

    if (!card) {
      setSelectedCard(null)
      return
    }

    // If no selection, select this card
    if (!selectedCard) {
      setSelectedCard({ source, index: 0, cardIndex })
      return
    }

    // If clicking same card, deselect
    if (selectedCard.source === source && selectedCard.cardIndex === cardIndex) {
      setSelectedCard(null)
      return
    }

    // Try to move selected cards to clicked location
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

    if (targetCards.length === 0) {
      setSelectedCard({ source, index: 0, cardIndex })
      return
    }

    const movingCard = targetCards[0]

    // Try move to tableau
    if (source.startsWith('tableau-')) {
      const destCol = parseInt(source.split('-')[1])
      if (canPlaceOnTableau(movingCard, game.tableau[destCol])) {
        saveHistory()
        setGame(g => {
          const newGame = { ...g }

          // Add cards to destination
          newGame.tableau = g.tableau.map((t, idx) => {
            if (idx === destCol) {
              return [...t, ...targetCards.map(c => ({ ...c, faceUp: true }))]
            }
            return [...t]
          })

          // Remove from source
          if (selectedCard.source === 'waste') {
            newGame.waste = g.waste.slice(0, -1)
          } else if (selectedCard.source.startsWith('tableau-')) {
            const srcCol = parseInt(selectedCard.source.split('-')[1])
            newGame.tableau = newGame.tableau.map((t, idx) => {
              if (idx !== srcCol) return t
              const newCol = g.tableau[srcCol].slice(0, selectedCard.cardIndex)
              if (newCol.length > 0 && !newCol[newCol.length - 1].faceUp) {
                newCol[newCol.length - 1] = { ...newCol[newCol.length - 1], faceUp: true }
              }
              return newCol
            })
          } else if (selectedCard.source.startsWith('foundation-')) {
            const srcIdx = parseInt(selectedCard.source.split('-')[1])
            newGame.foundations = g.foundations.map((f, idx) =>
              idx === srcIdx ? f.slice(0, -1) : [...f]
            )
          }

          return newGame
        })
        setMoves(m => m + 1)
        setSelectedCard(null)
        return
      }
    }

    // Try move to foundation (single card only)
    if (source.startsWith('foundation-') && targetCards.length === 1) {
      const destIdx = parseInt(source.split('-')[1])
      if (canPlaceOnFoundation(movingCard, game.foundations[destIdx])) {
        saveHistory()
        setGame(g => {
          const newGame = { ...g }

          newGame.foundations = g.foundations.map((f, idx) =>
            idx === destIdx ? [...f, { ...movingCard, faceUp: true }] : [...f]
          )

          if (selectedCard.source === 'waste') {
            newGame.waste = g.waste.slice(0, -1)
          } else if (selectedCard.source.startsWith('tableau-')) {
            const srcCol = parseInt(selectedCard.source.split('-')[1])
            newGame.tableau = g.tableau.map((t, idx) => {
              if (idx !== srcCol) return [...t]
              const newCol = t.slice(0, -1)
              if (newCol.length > 0 && !newCol[newCol.length - 1].faceUp) {
                newCol[newCol.length - 1] = { ...newCol[newCol.length - 1], faceUp: true }
              }
              return newCol
            })
          }

          return newGame
        })
        setMoves(m => m + 1)
        setSelectedCard(null)
        return
      }
    }

    // Move failed, select new card
    setSelectedCard({ source, index: 0, cardIndex })
  }, [isPlaying, game, selectedCard, saveHistory])

  // Handle double-click to auto-move to foundation
  const handleDoubleClick = useCallback((source: string, cardIndex?: number) => {
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

    if (card) {
      tryAutoFoundation(card, source, cardIndex)
    }
  }, [isPlaying, game, tryAutoFoundation])

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Determine card size based on expanded state
  const cardSize: CardSize = isExpanded ? 'large' : 'small'
  const { w: cardWidth, h: cardHeight, overlap } = CARD_SIZES[cardSize]
  const gap = isExpanded ? 12 : 4

  return (
    <div className="h-full flex flex-col p-2 select-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-semibold">Kube Solitaire</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Moves: {moves}</span>
          <span>Time: {formatTime(time)}</span>
          {highScore && (
            <span className="text-yellow-400" title={`Best: ${highScore.moves} moves in ${formatTime(highScore.time)}`}>
              🏆 {highScore.moves}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={history.length === 0}
            className="p-1.5 rounded hover:bg-secondary disabled:opacity-30"
            title="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={newGame}
            className="p-1.5 rounded hover:bg-secondary"
            title="New Game"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Game area - centered */}
      <div className="flex-1 flex items-center justify-center overflow-auto">
        <div className="flex flex-col" style={{ gap }}>
          {/* Top row: Stock, Waste, Foundations */}
          <div className="flex items-start" style={{ gap }}>
            {/* Stock */}
            <StockPile cards={game.stock} onClick={drawFromStock} size={cardSize} />

            {/* Waste */}
            <div style={{ width: cardWidth }}>
              {game.waste.length > 0 ? (
                <Card
                  card={game.waste[game.waste.length - 1]}
                  onClick={() => handleCardClick('waste')}
                  onDoubleClick={() => handleDoubleClick('waste')}
                  isSelected={selectedCard?.source === 'waste'}
                  size={cardSize}
                />
              ) : (
                <Card card={null} size={cardSize} />
              )}
            </div>

            {/* Spacer */}
            <div style={{ width: cardWidth }} />

            {/* Foundations */}
            {game.foundations.map((foundation, idx) => (
              <div
                key={idx}
                onClick={() => handleCardClick(`foundation-${idx}`)}
                className="cursor-pointer"
              >
                {foundation.length > 0 ? (
                  <Card
                    card={foundation[foundation.length - 1]}
                    isSelected={selectedCard?.source === `foundation-${idx}`}
                    size={cardSize}
                  />
                ) : (
                  <div
                    style={{ width: cardWidth, height: cardHeight }}
                    className="rounded border-2 border-dashed border-border/50 bg-secondary/30 flex items-center justify-center"
                    title={`${SUITS[idx]} foundation`}
                  >
                    {(() => {
                      const { Icon, color } = SUIT_CONFIG[SUITS[idx]]
                      return <Icon className={`${isExpanded ? 'w-6 h-6' : 'w-3 h-3'} ${color} opacity-30`} />
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Tableau */}
          <div className="flex" style={{ gap }}>
            {game.tableau.map((column, colIdx) => (
              <div key={colIdx} className="flex flex-col" style={{ minWidth: cardWidth }}>
                {column.length === 0 ? (
                  <div
                    onClick={() => handleCardClick(`tableau-${colIdx}`)}
                    style={{ width: cardWidth, height: cardHeight }}
                    className="rounded border-2 border-dashed border-border/30 bg-secondary/20 cursor-pointer hover:border-primary/30"
                  />
                ) : (
                  column.map((card, cardIdx) => (
                    <div
                      key={card.id}
                      style={{ marginTop: cardIdx > 0 ? overlap : 0 }}
                      className="relative"
                    >
                      <Card
                        card={card}
                        onClick={() => card.faceUp && handleCardClick(`tableau-${colIdx}`, cardIdx)}
                        onDoubleClick={() => card.faceUp && cardIdx === column.length - 1 && handleDoubleClick(`tableau-${colIdx}`, cardIdx)}
                        isSelected={
                          selectedCard?.source === `tableau-${colIdx}` &&
                          selectedCard?.cardIndex !== undefined &&
                          cardIdx >= selectedCard.cardIndex
                        }
                        size={cardSize}
                      />
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Win overlay */}
      {hasWon && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
          <div className="text-center p-6 bg-card rounded-xl border border-yellow-500/50 shadow-lg">
            <Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
            <h3 className="text-xl font-bold text-foreground mb-2">You Won!</h3>
            <p className="text-muted-foreground mb-4">
              {moves} moves in {formatTime(time)}
            </p>
            <button
              onClick={newGame}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500/20 text-yellow-400 rounded-lg mx-auto hover:bg-yellow-500/30"
            >
              <Play className="w-4 h-4" />
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
