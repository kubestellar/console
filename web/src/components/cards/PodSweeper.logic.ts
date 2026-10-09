export const NO_LINE_HEIGHT_STYLE = { lineHeight: 0 } as const

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface CellState {
  isMine: boolean
  isRevealed: boolean
  isFlagged: boolean
  adjacentMines: number
}

export interface GameConfig {
  rows: number
  cols: number
  mines: number
}

export const CONFIGS: Record<Difficulty, GameConfig> = {
  easy: { rows: 8, cols: 8, mines: 10 },
  medium: { rows: 12, cols: 12, mines: 25 },
  hard: { rows: 16, cols: 16, mines: 50 } }

// Initialize empty grid
export function createEmptyGrid(rows: number, cols: number): CellState[][] {
  return Array(rows).fill(null).map(() =>
    Array(cols).fill(null).map(() => ({
      isMine: false,
      isRevealed: false,
      isFlagged: false,
      adjacentMines: 0 }))
  )
}

// Place mines and calculate adjacent counts
export function initializeGrid(rows: number, cols: number, mines: number, excludeRow: number, excludeCol: number): CellState[][] {
  const grid = createEmptyGrid(rows, cols)

  // Place mines randomly, avoiding the clicked cell and its neighbors
  let placed = 0
  while (placed < mines) {
    const row = Math.floor(Math.random() * rows)
    const col = Math.floor(Math.random() * cols)

    // Skip if already a mine or too close to starting cell
    if (grid[row][col].isMine) continue
    if (Math.abs(row - excludeRow) <= 1 && Math.abs(col - excludeCol) <= 1) continue

    grid[row][col].isMine = true
    placed++
  }

  // Calculate adjacent mine counts
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].isMine) continue

      let count = 0
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr
          const nc = c + dc
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].isMine) {
            count++
          }
        }
      }
      grid[r][c].adjacentMines = count
    }
  }

  return grid
}

// Deep clone grid
export function cloneGrid(grid: CellState[][]): CellState[][] {
  return grid.map(row => row.map(cell => ({ ...cell })))
}

// Reveal cell and flood fill if empty
export function revealCell(grid: CellState[][], row: number, col: number): CellState[][] {
  const newGrid = cloneGrid(grid)
  const rows = grid.length
  const cols = grid[0].length

  const reveal = (r: number, c: number) => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return
    if (newGrid[r][c].isRevealed || newGrid[r][c].isFlagged) return

    newGrid[r][c].isRevealed = true

    // If empty cell, reveal neighbors
    if (!newGrid[r][c].isMine && newGrid[r][c].adjacentMines === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          reveal(r + dr, c + dc)
        }
      }
    }
  }

  reveal(row, col)
  return newGrid
}

// Check if game is won
export function checkWin(grid: CellState[][]): boolean {
  for (const row of grid) {
    for (const cell of row) {
      // All non-mine cells must be revealed
      if (!cell.isMine && !cell.isRevealed) return false
    }
  }
  return true
}

// Count remaining flags
export function countFlags(grid: CellState[][]): number {
  let count = 0
  for (const row of grid) {
    for (const cell of row) {
      if (cell.isFlagged) count++
    }
  }
  return count
}

// Number colors
export const NUMBER_COLORS = [
  '', // 0 (not shown)
  'text-blue-400',
  'text-green-400',
  'text-red-400',
  'text-purple-400',
  'text-yellow-400',
  'text-purple-400',
  'text-cyan-400',
  'text-white',
]

// Game state managed via useReducer to batch updates and prevent UI flicker
export interface GameState {
  difficulty: Difficulty
  grid: CellState[][]
  gameStarted: boolean
  gameOver: boolean
  won: boolean
  startTime: number | null
  elapsed: number
}

export type GameAction =
  | { type: 'NEW_GAME'; difficulty: Difficulty }
  | { type: 'FIRST_CLICK'; grid: CellState[][]; startTime: number }
  | { type: 'REVEAL'; grid: CellState[][] }
  | { type: 'MINE_HIT'; grid: CellState[][] }
  | { type: 'WIN'; grid: CellState[][] }
  | { type: 'FLAG'; grid: CellState[][] }
  | { type: 'TICK'; elapsed: number }

export function createInitialState(difficulty: Difficulty): GameState {
  const cfg = CONFIGS[difficulty]
  return {
    difficulty,
    grid: createEmptyGrid(cfg.rows, cfg.cols),
    gameStarted: false,
    gameOver: false,
    won: false,
    startTime: null,
    elapsed: 0,
  }
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'NEW_GAME':
      return createInitialState(action.difficulty)
    case 'FIRST_CLICK':
      return { ...state, grid: action.grid, gameStarted: true, startTime: action.startTime }
    case 'REVEAL':
      return { ...state, grid: action.grid }
    case 'MINE_HIT':
      return { ...state, grid: action.grid, gameOver: true, won: false }
    case 'WIN':
      return { ...state, grid: action.grid, gameOver: true, won: true }
    case 'FLAG':
      return { ...state, grid: action.grid }
    case 'TICK':
      return { ...state, elapsed: action.elapsed }
    default:
      return state
  }
}
