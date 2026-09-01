import { Trophy, Sparkles } from 'lucide-react'
import type { BestTimes, Cell, GameState } from './sudoku.types'
import { BOX_SIZE } from './sudoku.constants'

interface SudokuBoardProps {
  board: Cell[][]
  selectedCell: [number, number] | null
  isComplete: boolean
  isMaximized: boolean
  cellSize: string
  noteSize: string
  onCellClick: (row: number, col: number) => void
}

export function SudokuBoard({
  board,
  selectedCell,
  isComplete,
  isMaximized,
  cellSize,
  noteSize,
  onCellClick,
}: SudokuBoardProps) {
  return (
    <div className={`inline-grid grid-cols-9 gap-0 ${isMaximized ? 'border-4 rounded-lg' : 'border-2 rounded'} border-purple-400 overflow-hidden bg-secondary/20`}>
      {board.map((row, i) =>
        row.map((cell, j) => {
          const isSelected = selectedCell?.[0] === i && selectedCell?.[1] === j
          const isInSameRow = selectedCell?.[0] === i
          const isInSameCol = selectedCell?.[1] === j
          const isInSameBox =
            selectedCell &&
            Math.floor(selectedCell[0] / BOX_SIZE) === Math.floor(i / BOX_SIZE) &&
            Math.floor(selectedCell[1] / BOX_SIZE) === Math.floor(j / BOX_SIZE)
          const rightBorder = (j + 1) % BOX_SIZE === 0 && j !== 8
          const bottomBorder = (i + 1) % BOX_SIZE === 0 && i !== 8

          return (
            <button
              key={`${i}-${j}`}
              onClick={() => onCellClick(i, j)}
              disabled={isComplete}
              className={`
                ${cellSize} font-medium transition-all
                ${rightBorder ? (isMaximized ? 'border-r-4' : 'border-r-2') + ' border-purple-400' : 'border-r border-border/60'}
                ${bottomBorder ? (isMaximized ? 'border-b-4' : 'border-b-2') + ' border-purple-400' : 'border-b border-border/60'}
                ${isSelected ? 'bg-purple-500/30 ring-2 ring-purple-500' : ''}
                ${!isSelected && (isInSameRow || isInSameCol || isInSameBox) ? 'bg-purple-500/10' : ''}
                ${cell.isOriginal ? 'text-foreground font-bold' : 'text-purple-400'}
                ${cell.isConflict ? 'text-red-500 bg-red-500/20' : ''}
                ${!cell.isOriginal && !isComplete ? 'hover:bg-purple-500/20 cursor-pointer' : ''}
                ${isComplete ? 'cursor-default' : ''}
              `}
            >
              {cell.value || (
                cell.notes.size > 0 && (
                  <div className={`grid grid-cols-3 gap-0 ${noteSize} text-muted-foreground/50 leading-none`}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                      <div key={n}>{cell.notes.has(n) ? n : ''}</div>
                    ))}
                  </div>
                )
              )}
            </button>
          )
        })
      )}
    </div>
  )
}

interface SudokuVictoryModalProps {
  gameState: GameState
  bestTimes: BestTimes
  formatTime: (s: number) => string
  difficulties: Record<string, { label: string }>
  onPlayAgain: () => void
}

export function SudokuVictoryModal({
  gameState,
  bestTimes,
  formatTime,
  difficulties,
  onPlayAgain,
}: SudokuVictoryModalProps) {
  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 rounded-lg animate-in fade-in duration-300">
      <div className="bg-background border border-purple-500/30 rounded-lg p-6 max-w-xs w-full mx-4 text-center">
        <div className="mb-4">
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-purple-500/20 flex items-center justify-center">
            <Trophy className="w-8 h-8 text-yellow-500" />
          </div>
          <h3 className="text-lg font-bold mb-2">Congratulations!</h3>
          <p className="text-sm text-muted-foreground mb-1">
            You completed the {difficulties[gameState.difficulty].label} puzzle!
          </p>
          <p className="text-2xl font-bold text-purple-400">
            {formatTime(gameState.timer)}
          </p>
          {bestTimes[gameState.difficulty] === gameState.timer && (
            <p className="text-xs text-yellow-500 mt-2 flex items-center justify-center gap-1">
              <Sparkles className="w-3 h-3" />
              New Best Time!
            </p>
          )}
        </div>
        <button
          onClick={onPlayAgain}
          className="w-full px-4 py-2 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 font-medium transition-colors"
        >
          Play Again
        </button>
      </div>
    </div>
  )
}
