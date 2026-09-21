import { RotateCcw, Trophy } from 'lucide-react'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { CELL_SIZE, MAZE_WIDTH, MAZE_HEIGHT } from './kubeMan.constants'
import { useKubeManGame } from './useKubeManGame'

export function KubeMan(_props: CardComponentProps) {
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: false })
  const { isExpanded } = useCardExpanded()

  const {
    gameContainerRef,
    canvasRef,
    score,
    lives,
    level,
    gameOver,
    won,
    isPlaying,
    startGame,
  } = useKubeManGame(isExpanded)

  const scale = isExpanded ? 1.5 : 1
  const canvasWidth = MAZE_WIDTH * CELL_SIZE * scale
  const canvasHeight = MAZE_HEIGHT * CELL_SIZE * scale

  return (
    <div ref={gameContainerRef} className="h-full flex flex-col p-2 select-none">
      {/* Header */}
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
          <div className="text-center">
            <div className="text-muted-foreground">Level</div>
            <div className="font-bold text-purple-400">{level}</div>
          </div>
        </div>

        <button
          onClick={startGame}
          className="p-1.5 rounded hover:bg-secondary"
          title="New Game"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Game area - relative container for overlays */}
      <div className="flex-1 flex items-center justify-center relative">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="border border-border rounded"
        />

        {/* Start overlay - only covers game area */}
        {!isPlaying && !gameOver && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <div className="text-xl font-bold text-yellow-400 mb-2">KUBE-MAN</div>
              <div className="text-muted-foreground mb-4">Eat all dots and avoid ghosts!</div>
              <button
                onClick={startGame}
                className="px-6 py-3 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 font-semibold"
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
                  <div className="text-xl font-bold text-yellow-400 mb-2">Level Complete!</div>
                </>
              ) : (
                <div className="text-xl font-bold text-red-400 mb-2">Game Over!</div>
              )}
              <div className="text-muted-foreground mb-4">Score: {score}</div>
              <button
                onClick={startGame}
                className="px-6 py-3 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 font-semibold"
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
