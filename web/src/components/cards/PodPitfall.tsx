import { RotateCcw, Trophy } from 'lucide-react'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './podPitfall.constants'
import { usePodPitfallGame } from './usePodPitfallGame'

export function PodPitfall(_props: CardComponentProps) {
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: false })
  const { isExpanded } = useCardExpanded()

  const {
    gameContainerRef,
    canvasRef,
    score,
    lives,
    gameOver,
    won,
    isPlaying,
    distance,
    startGame,
  } = usePodPitfallGame(isExpanded)

  const scale = isExpanded ? 1.5 : 1

  return (
    <div ref={gameContainerRef} className="h-full flex flex-col p-2 select-none">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-3 text-xs">
          <div className="text-center">
            <div className="text-muted-foreground">Score</div>
            <div className="font-bold text-foreground">{score}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Lives</div>
            <div className="font-bold text-red-400">{'❤️'.repeat(lives)}</div>
          </div>
        </div>

        <button onClick={startGame} className="p-2 min-h-11 min-w-11 rounded hover:bg-secondary" title="New Game">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Game area - relative container for overlays */}
      <div className="flex-1 flex items-center justify-center relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH * scale}
          height={CANVAS_HEIGHT * scale}
          className="border border-border rounded"
        />

        {/* Start overlay - only covers game area */}
        {!isPlaying && !gameOver && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <div className="text-xl font-bold text-green-400 mb-2">POD PITFALL</div>
              <div className="text-muted-foreground mb-2 text-sm">Explore the jungle infrastructure!</div>
              <div className="text-muted-foreground mb-4 text-xs">Arrow keys + Space to jump, Up to grab vines</div>
              <button
                onClick={startGame}
                className="px-6 py-3 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 font-semibold"
              >
                Start Game
              </button>
            </div>
          </div>
        )}

        {/* Game over overlay - only covers game area */}
        {gameOver && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
            <div className="text-center">
              {won ? (
                <>
                  <Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
                  <div className="text-xl font-bold text-yellow-400 mb-2">Jungle Cleared!</div>
                </>
              ) : (
                <div className="text-xl font-bold text-red-400 mb-2">Game Over!</div>
              )}
              <div className="text-muted-foreground mb-2">Score: {score}</div>
              <div className="text-muted-foreground mb-4">Distance: {distance}m</div>
              <button
                onClick={startGame}
                className="px-6 py-3 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 font-semibold"
              >
                Play Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
