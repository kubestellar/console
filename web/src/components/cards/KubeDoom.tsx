import { Play, RotateCcw, Pause, Trophy, Target, Heart, Crosshair } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CSSProperties } from 'react'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { CANVAS_WIDTH, CANVAS_HEIGHT, LOW_AMMO_THRESHOLD } from './kubeDoom.constants'
import { useKubeDoomGame } from './useKubeDoomGame'

// Inline style constants
const KUBE_DOOM_H3_STYLE_1: CSSProperties = { fontFamily: 'monospace' }

export function KubeDoom() {
  const { t } = useTranslation('cards')
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: false })
  const { isExpanded } = useCardExpanded()

  const {
    gameContainerRef,
    canvasRef,
    gameState,
    score,
    health,
    ammo,
    level,
    kills,
    highScore,
    totalEnemiesRef,
    startGame,
    nextLevel,
    togglePause,
  } = useKubeDoomGame()

  return (
    <div ref={gameContainerRef} className="h-full flex flex-col">
      <div className={`flex flex-col items-center gap-3 ${isExpanded ? 'flex-1 min-h-0' : ''}`}>
        {/* Stats bar */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 w-full max-w-[480px] text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Target className="w-4 h-4 text-cyan-400" />
              <span className="font-bold">{score}</span>
            </div>
            <div className="flex items-center gap-1">
              <Crosshair className="w-4 h-4 text-yellow-400" />
              <span>Lv.{level}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {kills}/{totalEnemiesRef.current}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Heart className="w-4 h-4 text-red-400 fill-red-400" />
              <span className={health <= 25 ? 'text-red-400 font-bold' : ''}>{health}%</span>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <span className={ammo <= LOW_AMMO_THRESHOLD ? 'text-red-400' : 'text-muted-foreground'}>
                {t('kubeDoom.ammoCount', { count: ammo })}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Trophy className="w-4 h-4 text-yellow-500" />
              <span>{highScore}</span>
            </div>
          </div>
        </div>

        {/* Game canvas */}
        <div className={`relative ${isExpanded ? 'flex-1 min-h-0' : ''}`}>
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="border border-border rounded"
            style={isExpanded ? { width: '100%', height: '100%', objectFit: 'contain' } : undefined}
            tabIndex={0}
          />

          {/* Overlays */}
          {gameState === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded">
              <h3 className="text-3xl font-bold text-red-500 mb-1 tracking-wider" style={KUBE_DOOM_H3_STYLE_1}>{t('kubeDoom.title')}</h3>
              <p className="text-xs text-muted-foreground mb-1">{t('kubeDoom.tagline')}</p>
              <p className="text-xs text-muted-foreground mb-4">{t('kubeDoom.controls')}</p>
              <button
                onClick={startGame}
                className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 rounded text-white"
              >
                <Play className="w-4 h-4" />
                {t('kubeDoom.startGame')}
              </button>
            </div>
          )}

          {gameState === 'paused' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
              <h3 className="text-xl font-bold text-white mb-4">{t('kubeDoom.paused')}</h3>
              <button
                onClick={togglePause}
                className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 rounded text-white"
              >
                <Play className="w-4 h-4" />
                {t('kubeDoom.resume')}
              </button>
            </div>
          )}

          {gameState === 'levelcomplete' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
              <Crosshair className="w-12 h-12 text-green-400 mb-2" />
              <h3 className="text-2xl font-bold text-green-400 mb-2">{t('kubeDoom.levelClear', { level: level - 1 })}</h3>
              <p className="text-sm text-muted-foreground mb-1">{t('kubeDoom.allEliminated')}</p>
              <p className="text-lg text-white mb-4">{t('kubeDoom.scoreLabel', { score })}</p>
              <button
                onClick={nextLevel}
                className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 rounded text-white"
              >
                <Play className="w-4 h-4" />
                {t('kubeDoom.nextLevel', { level })}
              </button>
            </div>
          )}

          {gameState === 'gameover' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded">
              <h3 className="text-2xl font-bold text-red-400 mb-2">{t('kubeDoom.terminated')}</h3>
              <p className="text-sm text-muted-foreground mb-1">{t('kubeDoom.gotYou')}</p>
              <p className="text-lg text-white mb-1">{t('kubeDoom.scoreLabel', { score })}</p>
              <p className="text-sm text-muted-foreground mb-1">{t('kubeDoom.levelAndKills', { level, kills })}</p>
              {score === highScore && score > 0 && (
                <p className="text-sm text-yellow-400 mb-4">{t('kubeDoom.newHighScore')}</p>
              )}
              <button
                onClick={startGame}
                className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 rounded text-white"
              >
                <RotateCcw className="w-4 h-4" />
                {t('kubeDoom.playAgain')}
              </button>
            </div>
          )}
        </div>

        {/* Controls */}
        {gameState === 'playing' && (
          <div className="flex gap-2">
            <button
              onClick={togglePause}
              className="flex items-center gap-1 px-3 py-1 bg-secondary hover:bg-secondary/80 rounded text-sm"
            >
              <Pause className="w-4 h-4" />
              {t('kubeDoom.pauseAction')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
