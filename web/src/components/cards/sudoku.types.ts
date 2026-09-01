export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'
export type CellValue = number | null
export type Notes = Set<number>

export interface Cell {
  value: CellValue
  isOriginal: boolean
  notes: Notes
  isConflict: boolean
}

export interface GameState {
  board: Cell[][]
  solution: number[][]
  difficulty: Difficulty
  timer: number
  isPaused: boolean
  hintsRemaining: number
  isComplete: boolean
}

export interface HistoryState {
  board: Cell[][]
  timer: number
}

export interface BestTimes {
  easy?: number
  medium?: number
  hard?: number
  expert?: number
}

export interface SudokuGameProps {
  config?: Record<string, unknown>
}
