// HUD and overlay presentation for the KubeKong arcade card.
// Extracted from KubeKong.tsx (issue #21614) — markup unchanged.
import { RotateCcw, Trophy, Pause, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface KubeKongHudProps {
  score: number
  lives: number
  level: number
  highScore: number
  isPlaying: boolean
  gameOver: boolean
  isPaused: boolean
  onTogglePause: () => void
  onStartGame: () => void
}

export function KubeKongHud({
  score,
  lives,
  level,
  highScore,
  isPlaying,
  gameOver,
  isPaused,
  onTogglePause,
  onStartGame,
}: KubeKongHudProps) {
  const { t } = useTranslation('cards')

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
      <div className="flex items-center gap-3 text-xs">
        <div className="text-center">
          <div className="text-muted-foreground">{t('kubeKong.score')}</div>
          <div className="font-bold text-foreground">{score}</div>
        </div>
        <div className="text-center">
          <div className="text-muted-foreground">{t('kubeKong.lives')}</div>
          <div className="font-bold text-red-400">{'❤️'.repeat(lives)}</div>
        </div>
        <div className="text-center">
          <div className="text-muted-foreground">{t('kubeKong.level')}</div>
          <div className="font-bold text-purple-400">{level}</div>
        </div>
        <div className="text-center">
          <div className="text-muted-foreground">{t('kubeKong.best')}</div>
          <div className="font-bold text-yellow-400">{highScore}</div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {isPlaying && !gameOver && (
          <button
            onClick={onTogglePause}
            className="p-2 rounded hover:bg-secondary min-h-11 min-w-11 flex items-center justify-center"
            title={isPaused ? t('kubeKong.resume') : t('kubeKong.pauseAction')}
            aria-label={isPaused ? t('kubeKong.resume') : t('kubeKong.pauseAction')}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
        )}
        <button
          onClick={onStartGame}
          className="p-2 rounded hover:bg-secondary min-h-11 min-w-11 flex items-center justify-center"
          title={t('kubeKong.newGame')}
          aria-label={t('kubeKong.newGame')}
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

interface KubeKongOverlaysProps {
  score: number
  isPlaying: boolean
  gameOver: boolean
  isPaused: boolean
  won: boolean
  onTogglePause: () => void
  onStartGame: () => void
}

export function KubeKongOverlays({
  score,
  isPlaying,
  gameOver,
  isPaused,
  won,
  onTogglePause,
  onStartGame,
}: KubeKongOverlaysProps) {
  const { t } = useTranslation('cards')

  return (
    <>
      {/* Start overlay - only covers game area */}
      {!isPlaying && !gameOver && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <div className="text-xl font-bold text-orange-400 mb-2">{t('kubeKong.heading')}</div>
            <div className="text-muted-foreground mb-2 text-sm">{t('kubeKong.tagline')}</div>
            <div className="text-muted-foreground mb-4 text-xs">
              {t('kubeKong.controls')}
            </div>
            <button
              onClick={onStartGame}
              className="px-6 py-3 bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 font-semibold"
            >
              {t('kubeKong.startGame')}
            </button>
          </div>
        </div>
      )}

      {/* Paused overlay — issue #8944 */}
      {isPlaying && !gameOver && isPaused && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <div className="text-xl font-bold text-foreground mb-4">{t('kubeKong.pausedTitle')}</div>
            <button
              onClick={onTogglePause}
              className="px-6 py-3 bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 font-semibold"
            >
              {t('kubeKong.resume')}
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
                <div className="text-xl font-bold text-yellow-400 mb-2">{t('kubeKong.rescued')}</div>
              </>
            ) : (
              <div className="text-xl font-bold text-red-400 mb-2">{t('kubeKong.gameOver')}</div>
            )}
            <div className="text-muted-foreground mb-4">{t('kubeKong.scoreLabel', { score })}</div>
            <button
              onClick={onStartGame}
              className="px-6 py-3 bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 font-semibold"
            >
              {t('kubeKong.playAgain')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
