import { Crown } from 'lucide-react'
import { type PieceType, type Color, PIECE_SYMBOLS } from './KubeChess.engine'

export type ChessDifficulty = 1 | 2 | 3
type ChessGameResult = 'checkmate' | 'stalemate' | 'repetition' | 'ongoing'

interface ChessPromotionDialogProps {
  color: Color
  onSelect: (type: PieceType) => void
}

/** Overlay asking the player which piece a promoted pawn becomes. */
export function ChessPromotionDialog({ color, onSelect }: ChessPromotionDialogProps) {
  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-xl">
        <p className="text-sm font-medium mb-3 text-center">Promote to:</p>
        <div className="flex gap-2">
          {(['Q', 'R', 'B', 'N'] as PieceType[]).map(type => (
            <button
              key={type}
              onClick={() => onSelect(type)}
              className="w-12 h-12 flex items-center justify-center bg-yellow-100 dark:bg-yellow-200 rounded hover:bg-yellow-200 dark:hover:bg-yellow-300 transition-colors"
            >
              <span className="text-3xl">
                {PIECE_SYMBOLS[color][type]}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

interface ChessGameOverOverlayProps {
  gameResult: ChessGameResult
  /** True when the side to move (who just got mated) is not the player. */
  playerWon: boolean
  onNewGame: () => void
}

/** Overlay shown on checkmate, stalemate or threefold repetition. */
export function ChessGameOverOverlay({ gameResult, playerWon, onNewGame }: ChessGameOverOverlayProps) {
  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-xl text-center">
        <Crown className={`w-12 h-12 mx-auto mb-2 ${
          // Draws (stalemate/repetition) get the neutral yellow;
          // checkmate is colored by who won (#7894).
          gameResult === 'stalemate' || gameResult === 'repetition' ? 'text-yellow-500' :
          (playerWon ? 'text-green-500' : 'text-red-500')
        }`} />
        <p className="text-lg font-bold mb-3">
          {gameResult === 'checkmate'
            ? (playerWon ? 'You Win!' : 'You Lose!')
            : gameResult === 'repetition'
              ? 'Draw by threefold repetition!'
              : 'Stalemate!'}
        </p>
        <button
          onClick={onNewGame}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
        >
          New Game
        </button>
      </div>
    </div>
  )
}

interface ChessSettingsPanelProps {
  difficulty: ChessDifficulty
  onDifficultyChange: (difficulty: ChessDifficulty) => void
  stats: { wins: number; losses: number; draws: number }
}

/** Difficulty picker and win/loss/draw stats. */
export function ChessSettingsPanel({ difficulty, onDifficultyChange, stats }: ChessSettingsPanelProps) {
  return (
    <div className="w-full max-w-xs p-3 bg-secondary/30 rounded-lg">
      <div className="mb-3">
        <label className="text-xs text-muted-foreground block mb-1">Difficulty</label>
        <div className="flex gap-1">
          {[1, 2, 3].map(d => (
            <button
              key={d}
              onClick={() => onDifficultyChange(d as ChessDifficulty)}
              className={`flex-1 py-1 text-xs rounded ${
                difficulty === d
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary hover:bg-secondary/80'
              }`}
            >
              {d === 1 ? 'Easy' : d === 2 ? 'Medium' : 'Hard'}
            </button>
          ))}
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Stats: W{stats.wins} / L{stats.losses} / D{stats.draws}
      </div>
    </div>
  )
}
