import { Play, RotateCcw, Trophy, Heart, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export type PodBrothersGameState = 'idle' | 'playing' | 'paused' | 'won' | 'lost'

interface PodBrothersStatsBarProps {
  score: number
  lives: number
  highScore: number
}

export function PodBrothersStatsBar({ score, lives, highScore }: PodBrothersStatsBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-y-2 w-full max-w-[480px] text-sm">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <Star className="w-4 h-4 text-yellow-400" />
          <span>{score}</span>
        </div>
        <div className="flex items-center gap-1">
          <Heart className="w-4 h-4 text-red-400" />
          <span>{lives}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Trophy className="w-4 h-4 text-yellow-500" />
        <span>{highScore}</span>
      </div>
    </div>
  )
}

interface PodBrothersOverlayProps {
  gameState: PodBrothersGameState
  score: number
  onStart: () => void
  onResume: () => void
}

export function PodBrothersOverlay({ gameState, score, onStart, onResume }: PodBrothersOverlayProps) {
  const { t } = useTranslation('cards')

  if (gameState === 'idle') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
        <h3 className="text-2xl font-bold text-orange-400 mb-2">{t('podBrothers.title')}</h3>
        <p className="text-sm text-muted-foreground mb-4">{t('podBrothers.instructions')}</p>
        <button
          onClick={onStart}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white"
        >
          <Play className="w-4 h-4" />
          {t('podBrothers.startGame')}
        </button>
      </div>
    )
  }

  if (gameState === 'paused') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
        <h3 className="text-xl font-bold text-white mb-4">{t('podBrothers.paused')}</h3>
        <button
          onClick={onResume}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
        >
          <Play className="w-4 h-4" />
          {t('podBrothers.resume')}
        </button>
      </div>
    )
  }

  if (gameState === 'won') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
        <Trophy className="w-12 h-12 text-yellow-400 mb-2" />
        <h3 className="text-2xl font-bold text-green-400 mb-2">{t('podBrothers.levelComplete')}</h3>
        <p className="text-lg text-white mb-4">{t('podBrothers.scoreLabel', { score })}</p>
        <button
          onClick={onStart}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white"
        >
          <RotateCcw className="w-4 h-4" />
          {t('podBrothers.playAgain')}
        </button>
      </div>
    )
  }

  if (gameState === 'lost') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
        <h3 className="text-2xl font-bold text-red-400 mb-2">{t('podBrothers.gameOver')}</h3>
        <p className="text-lg text-white mb-4">{t('podBrothers.scoreLabel', { score })}</p>
        <button
          onClick={onStart}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded text-white"
        >
          <RotateCcw className="w-4 h-4" />
          {t('podBrothers.tryAgain')}
        </button>
      </div>
    )
  }

  return null
}
