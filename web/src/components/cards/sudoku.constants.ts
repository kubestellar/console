import type { Difficulty } from './sudoku.types'

export const DIFFICULTIES: Record<Difficulty, { label: string; cellsToRemove: number; hints: number }> = {
  easy: { label: 'Easy', cellsToRemove: 35, hints: 5 },
  medium: { label: 'Medium', cellsToRemove: 45, hints: 3 },
  hard: { label: 'Hard', cellsToRemove: 52, hints: 2 },
  expert: { label: 'Expert', cellsToRemove: 58, hints: 1 },
}

export const STORAGE_KEY = 'sudoku-game-state'
export const BEST_TIMES_KEY = 'sudoku-best-times'
export const MAX_HISTORY_LENGTH = 50
export const GRID_SIZE = 9
export const BOX_SIZE = 3
