// Board dimensions
export const ROWS = 20
export const COLS = 10

export type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'

export interface Piece {
  type: TetrominoType
  shape: number[][]
  x: number
  y: number
}

export type Board = (string | null)[][]

// Create empty board
export function createBoard(rows: number, cols: number): Board {
  if (rows <= 0 || cols <= 0) return []
  return Array(rows).fill(null).map(() => Array(cols).fill(null))
}

// Rotate a shape clockwise
export function rotateShape(shape: number[][]): number[][] {
  const rows = shape.length
  const cols = shape[0].length
  const rotated: number[][] = []

  for (let c = 0; c < cols; c++) {
    const newRow: number[] = []
    for (let r = rows - 1; r >= 0; r--) {
      newRow.push(shape[r][c])
    }
    rotated.push(newRow)
  }

  return rotated
}

// Check if position is valid
export function isValidPosition(board: Board, shape: number[][], x: number, y: number): boolean {
  const rows = board.length
  const cols = board[0]?.length || 0

  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        const newRow = y + r
        const newCol = x + c

        // Check bounds
        if (newCol < 0 || newCol >= cols || newRow >= rows) return false

        // Check collision with placed pieces (only if piece is on board)
        if (newRow >= 0 && board[newRow][newCol]) return false
      }
    }
  }
  return true
}

// Place piece on board
export function placePiece(board: Board, shape: number[][], x: number, y: number, pieceId: string): Board {
  const newBoard = board.map(row => [...row])
  const rows = board.length
  const cols = board[0]?.length || 0

  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        const boardRow = y + r
        const boardCol = x + c
        if (boardRow >= 0 && boardRow < rows && boardCol >= 0 && boardCol < cols) {
          newBoard[boardRow][boardCol] = pieceId
        }
      }
    }
  }

  return newBoard
}

// Clear completed lines and return new board + lines cleared
export function clearLines(board: Board): { board: Board; linesCleared: number } {
  const rows = board.length
  const cols = board[0]?.length || 0
  const newBoard = board.filter(row => row.some(cell => !cell))
  const linesCleared = rows - newBoard.length

  // Add empty rows at top
  while (newBoard.length < rows) {
    newBoard.unshift(Array(cols).fill(null))
  }

  return { board: newBoard, linesCleared }
}

// Calculate score based on lines cleared
export function calculateScore(lines: number, level: number): number {
  const basePoints = [0, 100, 300, 500, 800]
  return (basePoints[lines] || 0) * level
}
