import type { RefObject } from 'react'
import { Play, RotateCcw, Pause, Trophy, Flag, Timer, Gauge } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../ui/StatusBadge'
import { AI_COUNT, CANVAS_HEIGHT, CANVAS_WIDTH, MAX_SPEED, type GameState } from './KubeKart.constants'

interface KubeKartViewProps {
  gameContainerRef: RefObject<HTMLDivElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  isExpanded: boolean
  gameState: GameState
  countdown: number
  playerLap: number
  totalLaps: number
  raceTime: number
  position: number
  bestTime: number
  playerSpeed: number
  startGame: () => void
  togglePause: () => void
  formatTime: (seconds: number) => string
}

export function KubeKartView({
  gameContainerRef,
  canvasRef,
  isExpanded,
  gameState,
  countdown,
  playerLap,
  totalLaps,
  raceTime,
  position,
  bestTime,
  playerSpeed,
  startGame,
  togglePause,
  formatTime,
}: KubeKartViewProps) {
  const { t } = useTranslation('cards')

  return (
    <div ref={gameContainerRef} className="h-full flex flex-col">
      <div className={`flex flex-col items-center gap-3 ${isExpanded ? 'flex-1 min-h-0' : ''}`}>
        {/* Stats bar */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 w-full max-w-[400px] text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Flag className="w-4 h-4 text-green-400" />
              <span>{t('kubeKart.lap', 'Lap')} {playerLap}/{totalLaps}</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-secondary">
              <span className="font-bold text-lg">{position}</span>
              <span className="text-xs text-muted-foreground">/{AI_COUNT + 1}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Timer className="w-4 h-4 text-blue-400" />
              <span className="font-mono">{formatTime(raceTime)}</span>
            </div>
            {bestTime < Infinity && (
              <div className="flex items-center gap-1 text-yellow-500">
                <Trophy className="w-4 h-4" />
                <span className="font-mono text-xs">{formatTime(bestTime)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Game canvas */}
        <div className={`relative ${isExpanded ? 'flex-1 min-h-0' : ''}`}>
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="border border-border rounded"
            tabIndex={0}
            style={isExpanded ? { width: '100%', height: '100%', objectFit: 'contain' } : undefined}
          />

          {/* Overlays */}
          {gameState === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
              <h3 className="text-2xl font-bold text-blue-400 mb-2">{t('kubeKart.title', 'Kube Kart')}</h3>
              <p className="text-sm text-muted-foreground mb-4">{t('kubeKart.instructions', 'Arrow keys or WASD to drive')}</p>
              <div className="flex gap-2 mb-4 text-xs">
                <StatusBadge color="cyan" size="md">{t('kubeKart.boost')}</StatusBadge>
                <StatusBadge color="purple" size="md">{t('kubeKart.shield')}</StatusBadge>
                <StatusBadge color="orange" size="md">{t('kubeKart.slowOthers')}</StatusBadge>
              </div>
              <button
                onClick={startGame}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
              >
                <Play className="w-4 h-4" />
                {t('kubeKart.startRace', 'Start Race')}
              </button>
            </div>
          )}

          {gameState === 'countdown' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded">
              <span className="text-6xl font-bold text-white animate-pulse">
                {countdown || t('kubeKart.go', 'GO!')}
              </span>
            </div>
          )}

          {gameState === 'paused' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
              <h3 className="text-xl font-bold text-white mb-4">{t('kubeKart.paused', 'Paused')}</h3>
              <button
                onClick={togglePause}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
              >
                <Play className="w-4 h-4" />
                {t('kubeKart.resume', 'Resume')}
              </button>
            </div>
          )}

          {gameState === 'finished' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
              <Trophy className="w-12 h-12 text-yellow-400 mb-2" />
              <h3 className="text-2xl font-bold text-white mb-2">
                {position === 1
                  ? t('kubeKart.youWin', 'You Win!')
                  : t('kubeKart.finishedPosition', 'Finished {{position}}{{suffix}}', {
                    position,
                    suffix: position === 2 ? 'nd' : position === 3 ? 'rd' : 'th',
                  })}
              </h3>
              <p className="text-lg text-white mb-1">{t('kubeKart.time', 'Time')}: {formatTime(raceTime)}</p>
              {raceTime === bestTime && (
                <p className="text-sm text-yellow-400 mb-4">{t('kubeKart.newBestTime', 'New Best Time!')}</p>
              )}
              <button
                onClick={startGame}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
              >
                <RotateCcw className="w-4 h-4" />
                {t('kubeKart.raceAgain', 'Race Again')}
              </button>
            </div>
          )}
        </div>

        {/* Controls */}
        {gameState === 'playing' && (
          <div className="flex gap-2 items-center">
            <button
              onClick={togglePause}
              className="flex items-center gap-1 px-3 py-1 bg-secondary hover:bg-secondary/80 rounded text-sm"
            >
              <Pause className="w-4 h-4" />
              {t('kubeKart.pause', 'Pause')}
            </button>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Gauge className="w-3 h-3" />
              <span>{Math.round(playerSpeed / MAX_SPEED * 100)}%</span>
            </div>
          </div>
        )}
      </div>
    </div>

  )
}
