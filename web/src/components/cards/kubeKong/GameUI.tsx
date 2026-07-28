import { Pause, Play, RotateCcw } from 'lucide-react'

interface GameUIProps {
  t: (key: string, options?: Record<string, unknown>) => string
  score: number
  lives: number
  level: number
  highScore: number
  isPlaying: boolean
  gameOver: boolean
  isPaused: boolean
  togglePause: () => void
  startGame: () => void
}

export function GameUI({
  t,
  score,
  lives,
  level,
  highScore,
  isPlaying,
  gameOver,
  isPaused,
  togglePause,
  startGame,
}: GameUIProps) {
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
            onClick={togglePause}
            className="p-2 rounded hover:bg-secondary min-h-11 min-w-11 flex items-center justify-center"
            title={isPaused ? t('kubeKong.resume') : t('kubeKong.pauseAction')}
            aria-label={isPaused ? t('kubeKong.resume') : t('kubeKong.pauseAction')}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
        )}
        <button
          onClick={startGame}
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
