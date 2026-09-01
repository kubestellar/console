import { RotateCcw, Trophy, Undo2, Play } from 'lucide-react'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { SUITS, SUIT_CONFIG, CARD_SIZES } from './solitaire.constants'
import { useSolitaireGame } from './useSolitaireGame'
import { SolitaireCard, StockPile } from './SolitaireCard'

export function Solitaire(_props: CardComponentProps) {
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: false })
  const { isExpanded } = useCardExpanded()

  const {
    game,
    moves,
    time,
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
  } = useSolitaireGame()

  const cardSize = isExpanded ? 'large' : 'small'
  const { w: cardWidth, h: cardHeight, overlap } = CARD_SIZES[cardSize]
  const gap = isExpanded ? 12 : 4

  return (
    <div className="h-full flex flex-col p-2 select-none">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
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

      {/* Game area */}
      <div className="flex-1 flex items-center justify-center overflow-auto">
        <div className="flex flex-col" style={{ gap }}>
          {/* Top row: Stock, Waste, Foundations */}
          <div className="flex items-start" style={{ gap }}>
            <StockPile cards={game.stock} onClick={drawFromStock} size={cardSize} />

            {/* Waste */}
            <div style={{ width: cardWidth }}>
              {game.waste.length > 0 ? (
                <SolitaireCard
                  card={game.waste[game.waste.length - 1]}
                  onClick={() => handleCardClick('waste')}
                  onDoubleClick={() => handleDoubleClick('waste')}
                  isSelected={selectedCard?.source === 'waste'}
                  size={cardSize}
                />
              ) : (
                <SolitaireCard card={null} size={cardSize} />
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
                  <SolitaireCard
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
                      <SolitaireCard
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
