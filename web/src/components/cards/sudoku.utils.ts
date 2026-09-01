import type { Cell, Difficulty } from './sudoku.types'
import { DIFFICULTIES, GRID_SIZE, BOX_SIZE } from './sudoku.constants'

export function createEmptyBoard(): Cell[][] {
  return Array(GRID_SIZE).fill(null).map(() =>
    Array(GRID_SIZE).fill(null).map(() => ({
      value: null,
      isOriginal: false,
      notes: new Set<number>(),
      isConflict: false,
    }))
  )
}

export function isValid(board: number[][], row: number, col: number, num: number): boolean {
  for (let x = 0; x < GRID_SIZE; x++) {
    if (board[row][x] === num) return false
  }
  for (let x = 0; x < GRID_SIZE; x++) {
    if (board[x][col] === num) return false
  }
  const boxRow = Math.floor(row / BOX_SIZE) * BOX_SIZE
  const boxCol = Math.floor(col / BOX_SIZE) * BOX_SIZE
  for (let i = 0; i < BOX_SIZE; i++) {
    for (let j = 0; j < BOX_SIZE; j++) {
      if (board[boxRow + i][boxCol + j] === num) return false
    }
  }
  return true
}

export function solveSudoku(board: number[][]): boolean {
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (board[row][col] === 0) {
        for (let num = 1; num <= GRID_SIZE; num++) {
          if (isValid(board, row, col, num)) {
            board[row][col] = num
            if (solveSudoku(board)) return true
            board[row][col] = 0
          }
        }
        return false
      }
    }
  }
  return true
}

export function generateSolvedBoard(): number[][] {
  const board: number[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(0))

  for (let box = 0; box < GRID_SIZE; box += BOX_SIZE) {
    const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    for (let i = 0; i < BOX_SIZE; i++) {
      for (let j = 0; j < BOX_SIZE; j++) {
        const idx = Math.floor(Math.random() * nums.length)
        board[box + i][box + j] = nums[idx]
        nums.splice(idx, 1)
      }
    }
  }

  solveSudoku(board)
  return board
}

export function generatePuzzle(difficulty: Difficulty): { puzzle: Cell[][]; solution: number[][] } {
  const solution = generateSolvedBoard()
  const puzzle = createEmptyBoard()

  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE; j++) {
      puzzle[i][j].value = solution[i][j]
      puzzle[i][j].isOriginal = true
    }
  }

  const cellsToRemove = DIFFICULTIES[difficulty].cellsToRemove
  let removed = 0
  while (removed < cellsToRemove) {
    const row = Math.floor(Math.random() * GRID_SIZE)
    const col = Math.floor(Math.random() * GRID_SIZE)
    if (puzzle[row][col].value !== null) {
      puzzle[row][col].value = null
      puzzle[row][col].isOriginal = false
      removed++
    }
  }

  return { puzzle, solution }
}

export function checkConflicts(board: Cell[][], row: number, col: number): boolean {
  const value = board[row][col].value
  if (!value) return false

  for (let x = 0; x < GRID_SIZE; x++) {
    if (x !== col && board[row][x].value === value) return true
  }
  for (let x = 0; x < GRID_SIZE; x++) {
    if (x !== row && board[x][col].value === value) return true
  }

  const boxRow = Math.floor(row / BOX_SIZE) * BOX_SIZE
  const boxCol = Math.floor(col / BOX_SIZE) * BOX_SIZE
  for (let i = 0; i < BOX_SIZE; i++) {
    for (let j = 0; j < BOX_SIZE; j++) {
      const r = boxRow + i
      const c = boxCol + j
      if ((r !== row || c !== col) && board[r][c].value === value) return true
    }
  }

  return false
}

export function updateConflicts(board: Cell[][]): Cell[][] {
  const newBoard = board.map(row => row.map(cell => ({ ...cell, isConflict: false })))
  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE; j++) {
      if (newBoard[i][j].value) {
        newBoard[i][j].isConflict = checkConflicts(newBoard, i, j)
      }
    }
  }
  return newBoard
}

export function isBoardComplete(board: Cell[][], solution: number[][]): boolean {
  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE; j++) {
      if (board[i][j].value !== solution[i][j]) return false
    }
  }
  return true
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
