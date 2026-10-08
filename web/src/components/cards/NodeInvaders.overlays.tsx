import { Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface NodeInvadersOverlaysProps {
  isPlaying: boolean
  isPaused: boolean
  gameOver: boolean
  won: boolean
  score: number
  onStart: () => void
  onTogglePause: () => void
}

/** Start / paused / game-over overlays rendered over the Node Invaders canvas. */
export function NodeInvadersOverlays({
  isPlaying,
  isPaused,
  gameOver,
  won,
  score,
  onStart,
  onTogglePause }: NodeInvadersOverlaysProps) {
  const { t } = useTranslation('cards')
  return (
    <>
      {/* Start overlay - only covers game area */}
      {!isPlaying && !gameOver && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <div className="text-xl font-bold text-cyan-400 mb-2">{t('nodeInvaders.heading')}</div>
            <div className="text-muted-foreground mb-2 text-sm">{t('nodeInvaders.tagline')}</div>
            <div className="text-muted-foreground mb-4 text-xs">{t('nodeInvaders.controls')}</div>
            <button
              onClick={onStart}
              className="px-6 py-3 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 font-semibold"
            >
              {t('nodeInvaders.startGame')}
            </button>
          </div>
        </div>
      )}

      {/* Paused overlay — issue #8943 */}
      {isPlaying && !gameOver && isPaused && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <div className="text-xl font-bold text-foreground mb-4">{t('nodeInvaders.pausedTitle')}</div>
            <button
              onClick={onTogglePause}
              className="px-6 py-3 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 font-semibold"
            >
              {t('nodeInvaders.resume')}
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
                <div className="text-xl font-bold text-yellow-400 mb-2">{t('nodeInvaders.defended')}</div>
              </>
            ) : (
              <div className="text-xl font-bold text-red-400 mb-2">{t('nodeInvaders.overrun')}</div>
            )}
            <div className="text-muted-foreground mb-4">{t('nodeInvaders.scoreLabel', { score })}</div>
            <button
              onClick={onStart}
              className="px-6 py-3 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 font-semibold"
            >
              {t('nodeInvaders.playAgain')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
