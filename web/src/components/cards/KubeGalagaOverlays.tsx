// HUD and overlay presentation for the KubeGalaga arcade card.
// Extracted from KubeGalaga.tsx (issue #24058) — markup unchanged.
import { Play, RotateCcw, Trophy, Target, Heart, Zap } from 'lucide-react'
import type { KubeGalagaGameState } from './KubeGalaga.constants'

interface KubeGalagaHudProps {
  score: number
  level: number
  lives: number
  highScore: number
}

export function KubeGalagaHud({ score, level, lives, highScore }: KubeGalagaHudProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-y-2 w-full max-w-[400px] text-sm">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <Target className="w-4 h-4 text-cyan-400" />
          <span className="font-bold">{score}</span>
        </div>
        <div className="flex items-center gap-1">
          <Zap className="w-4 h-4 text-yellow-400" />
          <span>Lv.{level}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          {Array.from({ length: lives }).map((_, i) => (
            <Heart key={i} className="w-4 h-4 text-red-400 fill-red-400" />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Trophy className="w-4 h-4 text-yellow-500" />
          <span>{highScore}</span>
        </div>
      </div>
    </div>
  )
}

interface KubeGalagaOverlaysProps {
  gameState: KubeGalagaGameState
  score: number
  level: number
  highScore: number
  onStartGame: () => void
  onTogglePause: () => void
  onNextLevel: () => void
}

export function KubeGalagaOverlays({
  gameState,
  score,
  level,
  highScore,
  onStartGame,
  onTogglePause,
  onNextLevel,
}: KubeGalagaOverlaysProps) {
  return (
    <>
      {gameState === 'idle' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
          <h3 className="text-2xl font-bold text-cyan-400 mb-2">Kube Galaga</h3>
          <p className="text-sm text-muted-foreground mb-4">Arrow keys to move, Space to shoot</p>
          <span
            role="button"
            tabIndex={0}
            aria-label="Start Kube Galaga game"
            onClick={onStartGame}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStartGame() } }}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded text-white cursor-pointer"
          >
            <Play className="w-4 h-4" />
            Start Game
          </span>
        </div>
      )}

      {gameState === 'paused' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
          <h3 className="text-xl font-bold text-white mb-4">Paused</h3>
          <span
            role="button"
            tabIndex={0}
            aria-label="Resume Kube Galaga game"
            onClick={onTogglePause}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTogglePause() } }}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded text-white cursor-pointer"
          >
            <Play className="w-4 h-4" />
            Resume
          </span>
        </div>
      )}

      {gameState === 'levelcomplete' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
          <Zap className="w-12 h-12 text-yellow-400 mb-2" />
          <h3 className="text-2xl font-bold text-green-400 mb-2">Level {level - 1} Complete!</h3>
          <p className="text-lg text-white mb-4">Score: {score}</p>
          <span
            role="button"
            tabIndex={0}
            aria-label={`Start level ${level} of Kube Galaga`}
            onClick={onNextLevel}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNextLevel() } }}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded text-white cursor-pointer"
          >
            <Play className="w-4 h-4" />
            Level {level}
          </span>
        </div>
      )}

      {gameState === 'gameover' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded">
          <h3 className="text-2xl font-bold text-red-400 mb-2">Game Over</h3>
          <p className="text-lg text-white mb-1">Score: {score}</p>
          <p className="text-sm text-muted-foreground mb-1">Reached Level {level}</p>
          {score === highScore && score > 0 && (
            <p className="text-sm text-yellow-400 mb-4">New High Score!</p>
          )}
          <span
            role="button"
            tabIndex={0}
            aria-label="Play Kube Galaga again"
            onClick={onStartGame}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStartGame() } }}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded text-white cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Play Again
          </span>
        </div>
      )}
    </>
  )
}
