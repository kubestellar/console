import { RotateCcw, Rocket, Pause, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './NodeInvaders.constants'
import { NodeInvadersOverlays } from './NodeInvaders.overlays'
import { useNodeInvadersGame } from './useNodeInvadersGame'

export function NodeInvaders(_props: CardComponentProps) {
  const { t } = useTranslation('cards')
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: false })
  const { isExpanded } = useCardExpanded()
  const {
    gameContainerRef, canvasRef, player, score, level, highScore, isPlaying,
    gameOver, isPaused, won, scale, startGame, togglePause,
  } = useNodeInvadersGame(isExpanded)

  return (
    <div ref={gameContainerRef} className="h-full flex flex-col p-2 select-none">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <Rocket className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold">{t('nodeInvaders.title')}</span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="text-center">
            <div className="text-muted-foreground">{t('nodeInvaders.score')}</div>
            <div className="font-bold text-foreground">{score}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">{t('nodeInvaders.lives')}</div>
            <div className="font-bold text-red-400">{'❤️'.repeat(player.lives)}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">{t('nodeInvaders.wave')}</div>
            <div className="font-bold text-purple-400">{level}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">{t('nodeInvaders.best')}</div>
            <div className="font-bold text-yellow-400">{highScore}</div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {isPlaying && !gameOver && (
            <button
              onClick={togglePause}
              className="p-2 rounded hover:bg-secondary min-h-11 min-w-11 flex items-center justify-center"
              title={isPaused ? t('nodeInvaders.resume') : t('nodeInvaders.pauseAction')}
              aria-label={isPaused ? t('nodeInvaders.resume') : t('nodeInvaders.pauseAction')}
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={startGame}
            className="p-2 rounded hover:bg-secondary min-h-11 min-w-11 flex items-center justify-center"
            title={t('nodeInvaders.newGame')}
            aria-label={t('nodeInvaders.newGame')}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Game area - relative container for overlays */}
      <div className="flex-1 flex items-center justify-center relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH * scale}
          height={CANVAS_HEIGHT * scale}
          className="border border-border rounded"
        />

        <NodeInvadersOverlays
          isPlaying={isPlaying}
          isPaused={isPaused}
          gameOver={gameOver}
          won={won}
          score={score}
          onStart={startGame}
          onTogglePause={togglePause}
        />
      </div>
    </div>
  )
}
