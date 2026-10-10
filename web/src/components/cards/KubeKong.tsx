import { CardComponentProps } from './cardRegistry.types'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState, useCardDemoState } from './CardDataContext'
import { KubeKongHud, KubeKongOverlays } from './KubeKongOverlays'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './KubeKong.constants'
import { useKubeKongGame } from './useKubeKongGame'

export function KubeKong(_props: CardComponentProps) {
  const { showDemoBadge } = useCardDemoState({ requires: 'none' })
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: showDemoBadge })
  const { isExpanded } = useCardExpanded()
  const {
    gameContainerRef, canvasRef, score, lives, level, highScore, isPlaying,
    gameOver, isPaused, won, scale, startGame, togglePause,
  } = useKubeKongGame(isExpanded)

  return (
    <div ref={gameContainerRef} className="h-full flex flex-col p-2 select-none">
      <KubeKongHud
        score={score}
        lives={lives}
        level={level}
        highScore={highScore}
        isPlaying={isPlaying}
        gameOver={gameOver}
        isPaused={isPaused}
        onTogglePause={togglePause}
        onStartGame={startGame}
      />

      {/* Game area - relative container for overlays */}
      <div className="flex-1 flex items-center justify-center relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH * scale}
          height={CANVAS_HEIGHT * scale}
          className="border border-border rounded"
        />

        <KubeKongOverlays
          score={score}
          isPlaying={isPlaying}
          gameOver={gameOver}
          isPaused={isPaused}
          won={won}
          onTogglePause={togglePause}
          onStartGame={startGame}
        />
      </div>
    </div>
  )
}
