import type { Board, Move, Position } from './gameLogic'
import { PieceComponent } from './PieceComponent'

interface CheckerBoardProps {
  board: Board
  selectedPos: Position | null
  validMoves: Move[]
  showCombat: boolean
  combatCell: Position | null
  isSmall: boolean
  cellSize: string
  handleCellClick: (row: number, col: number) => void
}

export function CheckerBoard({
  board,
  selectedPos,
  validMoves,
  showCombat,
  combatCell,
  isSmall,
  cellSize,
  handleCellClick,
}: CheckerBoardProps) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-0">
      <div className="inline-block border border-border rounded overflow-hidden">
        {board.map((row, rowIdx) => (
          <div key={rowIdx} className="flex shrink-0">
            {row.map((piece, colIdx) => {
              const isDark = (rowIdx + colIdx) % 2 === 1
              const isSelected = selectedPos?.row === rowIdx && selectedPos?.col === colIdx
              const isValidMove = validMoves.some(m => m.to.row === rowIdx && m.to.col === colIdx)
              const isCapture = validMoves.some(m => m.to.row === rowIdx && m.to.col === colIdx && m.isJump)
              const isCombatCell = showCombat && combatCell?.row === rowIdx && combatCell?.col === colIdx

              return (
                <div
                  key={colIdx}
                  onClick={() => handleCellClick(rowIdx, colIdx)}
                  className={`
                    ${cellSize} shrink-0 flex items-center justify-center cursor-pointer transition-colors relative
                    ${isDark ? 'bg-green-800' : 'bg-green-200'}
                    ${isValidMove && !isCapture ? 'ring-2 ring-inset ring-green-400' : ''}
                    ${isCapture ? 'ring-2 ring-inset ring-red-400 bg-red-500/30' : ''}
                    ${isSelected ? 'bg-yellow-500/30' : ''}
                    ${isCombatCell ? 'animate-pulse bg-red-600' : ''}
                  `}
                >
                  {isCombatCell && (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                      <span className="text-2xl animate-bounce">💥</span>
                    </div>
                  )}
                  {piece && <PieceComponent piece={piece} isSelected={isSelected} isSmall={isSmall} />}
                  {isValidMove && !piece && (
                    <div className={`${isSmall ? 'w-2 h-2' : 'w-3 h-3'} rounded-full ${isCapture ? 'bg-red-400' : 'bg-green-400'} opacity-60`} />
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
