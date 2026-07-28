import { Trophy } from 'lucide-react'

interface GameCanvasProps {
  t: (key: string, options?: Record<string, unknown>) => string
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  scale: number
  isPlaying: boolean
  gameOver: boolean
  isPaused: boolean
  won: boolean
  score: number
  startGame: () => void
  togglePause: () => void
  canvasWidth: number
  canvasHeight: number
}

export function GameCanvas({
  t,
  canvasRef,
  scale,
  isPlaying,
  gameOver,
  isPaused,
  won,
  score,
  startGame,
  togglePause,
  canvasWidth,
  canvasHeight,
}: GameCanvasProps) {
  return (
    <div className="flex-1 flex items-center justify-center relative">
      <canvas
        ref={canvasRef}
        width={canvasWidth * scale}
        height={canvasHeight * scale}
        className="border border-border rounded"
      />

      {!isPlaying && !gameOver && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <div className="text-xl font-bold text-orange-400 mb-2">{t('kubeKong.heading')}</div>
            <div className="text-muted-foreground mb-2 text-sm">{t('kubeKong.tagline')}</div>
            <div className="text-muted-foreground mb-4 text-xs">
              {t('kubeKong.controls')}
            </div>
            <button
              onClick={startGame}
              className="px-6 py-3 bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 font-semibold"
            >
              {t('kubeKong.startGame')}
            </button>
          </div>
        </div>
      )}

      {isPlaying && !gameOver && isPaused && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <div className="text-xl font-bold text-foreground mb-4">{t('kubeKong.pausedTitle')}</div>
            <button
              onClick={togglePause}
              className="px-6 py-3 bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 font-semibold"
            >
              {t('kubeKong.resume')}
            </button>
          </div>
        </div>
      )}

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
              onClick={startGame}
              className="px-6 py-3 bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 font-semibold"
            >
              {t('kubeKong.playAgain')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
