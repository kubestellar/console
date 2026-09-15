import { Play, RotateCcw, Trophy, Heart, ArrowUp, ArrowDown } from 'lucide-react'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { useKubeBertGame } from './useKubeBertGame'

// ─── Component ────────────────────────────────────────────────────────────────
export function KubeBert() {
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: false })
  const { isExpanded } = useCardExpanded()

  const {
    canvasRef,
    containerRef,
    gameState,
    score,
    level,
    livesRef,
    highScore,
    startGame,
    movePlayer,
  } = useKubeBertGame(isExpanded)

  const canvasHeight = isExpanded ? 'calc(100% - 80px)' : '320px'

  return (
    <div ref={containerRef} className="h-full flex flex-col">
      {/* Stats bar */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 px-3 py-1.5 bg-black/30 rounded-t-lg text-xs">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-yellow-400">
            <Trophy className="w-3.5 h-3.5" />
            {score}
          </span>
          <span className="text-blue-400">Lvl {level}</span>
          <span className="flex items-center gap-1 text-red-400">
            {Array.from({ length: livesRef.current }).map((_, i) => (
              <Heart key={i} className="w-3 h-3 fill-red-400" />
            ))}
          </span>
        </div>
        <span className="text-muted-foreground">
          Best: {highScore}
        </span>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: canvasHeight, display: 'block' }}
        />

        {/* Idle overlay */}
        {gameState === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-b-lg">
            <div className="text-2xl font-bold text-yellow-400 mb-1">Kube Bert</div>
            <p className="text-xs text-muted-foreground mb-3 text-center px-4">
              Hop on every tile to change its color!<br />
              Avoid enemies and don&apos;t fall off!
            </p>
            <button
              onClick={startGame}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 rounded-lg text-sm font-medium transition-colors"
            >
              <Play className="w-4 h-4" /> Start Game
            </button>
          </div>
        )}

        {/* Game over overlay */}
        {gameState === 'gameover' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-b-lg">
            <div className="text-xl font-bold text-red-400 mb-1">@#!? Game Over!</div>
            <p className="text-sm text-yellow-400 mb-1">Score: {score}</p>
            {score >= highScore && score > 0 && (
              <p className="text-xs text-green-400 mb-2">New High Score!</p>
            )}
            <button
              onClick={startGame}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 rounded-lg text-sm font-medium transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Try Again
            </button>
          </div>
        )}
      </div>

      {/* Controls — mobile touch buttons */}
      <div className="flex items-center justify-center gap-1 py-1.5 bg-black/20">
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={() => movePlayer('up-left')}
            className="p-1.5 rounded bg-black/10 hover:bg-black/20 active:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30 transition-colors"
            title="Up-Left (↑)"
          >
            <ArrowUp className="w-4 h-4 text-blue-400 -rotate-45" />
          </button>
          <button
            onClick={() => movePlayer('up-right')}
            className="p-1.5 rounded bg-black/10 hover:bg-black/20 active:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30 transition-colors"
            title="Up-Right (→)"
          >
            <ArrowUp className="w-4 h-4 text-blue-400 rotate-45" />
          </button>
          <button
            onClick={() => movePlayer('down-left')}
            className="p-1.5 rounded bg-black/10 hover:bg-black/20 active:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30 transition-colors"
            title="Down-Left (←)"
          >
            <ArrowDown className="w-4 h-4 text-orange-400 -rotate-45" />
          </button>
          <button
            onClick={() => movePlayer('down-right')}
            className="p-1.5 rounded bg-black/10 hover:bg-black/20 active:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30 transition-colors"
            title="Down-Right (↓)"
          >
            <ArrowDown className="w-4 h-4 text-orange-400 rotate-45" />
          </button>
        </div>
        <div className="ml-3 text-xs text-muted-foreground leading-tight">
          <div>↑ up-left &nbsp; → up-right</div>
          <div>← down-left &nbsp; ↓ down-right</div>
        </div>
      </div>
    </div>
  )
}
