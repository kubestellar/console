import { RotateCcw, Pause, Play } from 'lucide-react'
import { CardComponentProps } from './cardRegistry.types'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { useTranslation } from 'react-i18next'
import { useContainerTetris, TETROMINOES } from './useContainerTetris'

function ContainerTetrisInternal(_props: CardComponentProps) {
  const { t } = useTranslation('cards')
  const { isExpanded } = useCardExpanded()
  const { gameContainerRef, score, level, lines, highScore, isPlaying, gameOver, isPaused, togglePause, startGame, nextPiece, displayBoard } = useContainerTetris()

  const cellSize = isExpanded ? 'w-5 h-5' : 'w-3 h-3'
  const previewCellSize = isExpanded ? 'w-4 h-4' : 'w-2.5 h-2.5'

  return (
    <div ref={gameContainerRef} className="h-full flex flex-col p-2 select-none">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-3 text-xs">
          <div className="text-center">
            <div className="text-muted-foreground">{t('containerTetris.score')}</div>
            <div className="font-bold text-foreground">{score}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">{t('containerTetris.level')}</div>
            <div className="font-bold text-purple-400">{level}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">{t('containerTetris.lines')}</div>
            <div className="font-bold text-green-400">{lines}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">{t('containerTetris.best')}</div>
            <div className="font-bold text-yellow-400">{highScore}</div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {isPlaying && !gameOver && (
            <button
              onClick={togglePause}
              className="p-1.5 rounded hover:bg-secondary"
              title={isPaused ? t('containerTetris.resume') : t('containerTetris.pauseAction')}
              aria-label={isPaused ? t('containerTetris.resume') : t('containerTetris.pauseAction')}
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={startGame}
            className="p-1.5 rounded hover:bg-secondary"
            title={t('containerTetris.newGame')}
            aria-label={t('containerTetris.newGame')}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Game area - relative container for overlays */}
      <div className="flex-1 flex items-center justify-center gap-4 relative">
        {/* Main board */}
        <div data-testid="tetris-board" className="border border-border rounded overflow-hidden bg-gray-900">
          {displayBoard.map((row, rowIdx) => (
            <div key={rowIdx} className="flex">
              {row.map((cell, colIdx) => (
                <div
                  key={colIdx}
                  data-color={cell || 'empty'}
                  className={`${cellSize} border border-gray-800 ${cell || 'bg-gray-900'}`}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-4">
          {/* Next piece preview */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t('containerTetris.next')}</div>
            <div data-testid="tetris-next-preview" className="border border-border rounded p-1 bg-gray-900">
              {nextPiece.shape.map((row, r) => (
                <div key={r} className="flex">
                  {row.map((cell, c) => (
                    <div
                      key={c}
                      data-color={cell ? TETROMINOES[nextPiece.type].color : 'empty'}
                      className={`${previewCellSize} ${cell ? TETROMINOES[nextPiece.type].color : 'bg-gray-900'}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Controls hint */}
          {isExpanded && (
            <div className="text-xs text-muted-foreground space-y-1">
              <div>{t('containerTetris.moveControl')}</div>
              <div>{t('containerTetris.softDrop')}</div>
              <div>{t('containerTetris.rotate')}</div>
              <div>{t('containerTetris.hardDrop')}</div>
              <div>{t('containerTetris.pause')}</div>
            </div>
          )}
        </div>

        {/* Start overlay - only covers game area */}
        {!isPlaying && !gameOver && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
            <button
              onClick={startGame}
              className="px-6 py-3 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 font-semibold"
            >
              {t('containerTetris.startGame')}
            </button>
          </div>
        )}

        {/* Paused overlay - only covers game area */}
        {isPaused && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <div className="text-xl font-bold text-foreground mb-4">{t('containerTetris.pausedTitle')}</div>
              <button
                onClick={togglePause}
                className="px-6 py-3 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 font-semibold"
              >
                {t('containerTetris.resume')}
              </button>
            </div>
          </div>
        )}

        {/* Game over overlay - only covers game area */}
        {gameOver && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <div className="text-xl font-bold text-foreground mb-2">{t('containerTetris.gameOver')}</div>
              <div className="text-muted-foreground mb-4">{t('containerTetris.scoreLabel', { score })}</div>
              <button
                onClick={startGame}
                className="px-6 py-3 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 font-semibold"
              >
                {t('containerTetris.playAgain')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function ContainerTetris(props: CardComponentProps) {
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: false })
  return (
    <DynamicCardErrorBoundary cardId="ContainerTetris">
      <ContainerTetrisInternal {...props} />
    </DynamicCardErrorBoundary>
  )
}
