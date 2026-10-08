// HUD and overlay presentation for the MissileCommand arcade card.
// Extracted from MissileCommand.tsx (issue #24058) — markup unchanged.
import { RotateCcw, Trophy, Crosshair } from 'lucide-react'
import { TOTAL_WAVES } from './MissileCommand.constants'

interface MissileCommandHudProps {
  score: number
  wave: number
  aliveCities: number
  totalAmmo: number
  onStartGame: () => void
}

export function MissileCommandHud({ score, wave, aliveCities, totalAmmo, onStartGame }: MissileCommandHudProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
      <div className="flex items-center gap-1.5">
        <Crosshair className="w-4 h-4 text-red-400" />
        <span className="text-sm font-semibold">Missile Command</span>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <div className="text-center">
          <div className="text-muted-foreground">Score</div>
          <div className="font-bold text-foreground">{score}</div>
        </div>
        <div className="text-center">
          <div className="text-muted-foreground">Wave</div>
          <div className="font-bold text-orange-400">{wave}/{TOTAL_WAVES}</div>
        </div>
        <div className="text-center">
          <div className="text-muted-foreground">Cities</div>
          <div className="font-bold text-blue-400">{aliveCities}</div>
        </div>
        <div className="text-center">
          <div className="text-muted-foreground">Ammo</div>
          <div className="font-bold text-cyan-400">{totalAmmo}</div>
        </div>
      </div>

      <button
        onClick={onStartGame}
        className="p-2 rounded hover:bg-secondary min-h-11 min-w-11 flex items-center justify-center"
        title="New Game"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
    </div>
  )
}

interface MissileCommandOverlaysProps {
  isPlaying: boolean
  gameOver: boolean
  won: boolean
  score: number
  onStartGame: () => void
}

export function MissileCommandOverlays({ isPlaying, gameOver, won, score, onStartGame }: MissileCommandOverlaysProps) {
  return (
    <>
      {/* Start overlay */}
      {!isPlaying && !gameOver && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
          <div className="text-center px-4">
            <div className="text-xl font-bold text-red-400 mb-1">MISSILE COMMAND</div>
            <div className="text-muted-foreground mb-1 text-sm">Defend your Kubernetes clusters!</div>
            <div className="text-muted-foreground mb-4 text-xs">Click to fire interceptors at incoming missiles</div>
            <button
              onClick={onStartGame}
              className="px-6 py-3 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 font-semibold"
            >
              Start Game
            </button>
          </div>
        </div>
      )}

      {/* Game over overlay */}
      {gameOver && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
          <div className="text-center">
            {won ? (
              <>
                <Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
                <div className="text-xl font-bold text-yellow-400 mb-2">Cluster Defended!</div>
              </>
            ) : (
              <div className="text-xl font-bold text-red-400 mb-2">Cluster Destroyed!</div>
            )}
            <div className="text-muted-foreground mb-4">Score: {score}</div>
            <button
              onClick={onStartGame}
              className="px-6 py-3 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 font-semibold"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </>
  )
}
