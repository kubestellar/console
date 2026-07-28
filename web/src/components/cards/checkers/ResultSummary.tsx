import { Play, Trophy } from 'lucide-react'
import type { Player } from './gameLogic'

interface ResultSummaryProps {
  t: (key: string, options?: Record<string, unknown>) => string
  gameOver: Player | 'draw' | null
  moveCount: number
  newGame: () => void
}

export function ResultSummary({ t, gameOver, moveCount, newGame }: ResultSummaryProps) {
  if (!gameOver) return null

  return (
    <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
      <div className="text-center p-6 bg-card rounded-xl border border-border shadow-lg">
        <Trophy className={`w-12 h-12 mx-auto mb-3 ${gameOver === 'pods' ? 'text-blue-400' : 'text-orange-400'}`} />
        <h3 className="text-xl font-bold text-foreground mb-2">
          {gameOver === 'pods' ? t('checkers.youWon') : t('checkers.aiWinsExclaim')}
        </h3>
        <p className="text-muted-foreground mb-4">
          {moveCount} {t('checkers.movesPlayed')}
        </p>
        <button
          onClick={newGame}
          className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg mx-auto hover:bg-purple-500/30"
        >
          <Play className="w-4 h-4" />
          {t('checkers.playAgain')}
        </button>
      </div>
    </div>
  )
}
