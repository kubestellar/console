import { safeGetItem } from '@/lib/utils/localStorage'

export type Grid = (number | null)[][]

export const GRID_SIZE = 4
export const BEST_SCORE_STORAGE_KEY = 'kube2048-best'

export function getStoredBestScore(): number {
  try {
    const parsedBestScore = parseInt(safeGetItem(BEST_SCORE_STORAGE_KEY) || '0', 10)
    return Number.isFinite(parsedBestScore) && parsedBestScore >= 0 ? parsedBestScore : 0
  } catch {
    return 0
  }
}

// Tile colors based on value - Kubernetes themed
export const TILE_COLORS: Record<number, { bg: string; text: string }> = {
  2: { bg: 'bg-blue-500/80', text: 'text-white' },
  4: { bg: 'bg-blue-600/80', text: 'text-white' },
  8: { bg: 'bg-cyan-500/80', text: 'text-white' },
  16: { bg: 'bg-cyan-600/80', text: 'text-white' },
  32: { bg: 'bg-cyan-500/80', text: 'text-white' },
  64: { bg: 'bg-cyan-600/80', text: 'text-white' },
  128: { bg: 'bg-green-500/80', text: 'text-white' },
  256: { bg: 'bg-green-600/80', text: 'text-white' },
  512: { bg: 'bg-yellow-500/80', text: 'text-black dark:text-black' },
  1024: { bg: 'bg-orange-500/80', text: 'text-white' },
  2048: { bg: 'bg-purple-500/80', text: 'text-white' },
  4096: { bg: 'bg-purple-500/80', text: 'text-white' },
  8192: { bg: 'bg-red-500/80', text: 'text-white' } }

// Create empty 4x4 grid
export function createEmptyGrid(): Grid {
  return Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null))
}

// Add random tile (2 or 4) to empty cell
export function addRandomTile(grid: Grid): Grid {
  const newGrid = grid.map(row => [...row])
  const emptyCells: [number, number][] = []

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (newGrid[r][c] === null) {
        emptyCells.push([r, c])
      }
    }
  }

  if (emptyCells.length === 0) return newGrid

  const [row, col] = emptyCells[Math.floor(Math.random() * emptyCells.length)]
  newGrid[row][col] = Math.random() < 0.9 ? 2 : 4

  return newGrid
}

// Initialize new game
export function initGame(): Grid {
  let grid = createEmptyGrid()
  grid = addRandomTile(grid)
  grid = addRandomTile(grid)
  return grid
}

// Slide tiles in a row/column, return [newLine, score, moved]
export function slideLine(line: (number | null)[]): [(number | null)[], number, boolean] {
  // Remove nulls
  const tiles = line.filter(t => t !== null) as number[]
  const newLine: (number | null)[] = []
  let score = 0
  let moved = false

  let i = 0
  while (i < tiles.length) {
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      // Merge
      const merged = tiles[i] * 2
      newLine.push(merged)
      score += merged
      i += 2
    } else {
      newLine.push(tiles[i])
      i++
    }
  }

  // Pad with nulls
  while (newLine.length < GRID_SIZE) {
    newLine.push(null)
  }

  // Check if moved
  for (let j = 0; j < GRID_SIZE; j++) {
    if (line[j] !== newLine[j]) {
      moved = true
      break
    }
  }

  return [newLine, score, moved]
}

// Move grid in direction
export function moveGrid(grid: Grid, direction: 'up' | 'down' | 'left' | 'right'): { grid: Grid; score: number; moved: boolean } {
  const newGrid = grid.map(row => [...row])
  let totalScore = 0
  let anyMoved = false

  if (direction === 'left') {
    for (let r = 0; r < 4; r++) {
      const [newRow, score, moved] = slideLine(newGrid[r])
      newGrid[r] = newRow
      totalScore += score
      if (moved) anyMoved = true
    }
  } else if (direction === 'right') {
    for (let r = 0; r < 4; r++) {
      const [newRow, score, moved] = slideLine([...newGrid[r]].reverse())
      newGrid[r] = newRow.reverse()
      totalScore += score
      if (moved) anyMoved = true
    }
  } else if (direction === 'up') {
    for (let c = 0; c < 4; c++) {
      const col = [newGrid[0][c], newGrid[1][c], newGrid[2][c], newGrid[3][c]]
      const [newCol, score, moved] = slideLine(col)
      for (let r = 0; r < 4; r++) {
        newGrid[r][c] = newCol[r]
      }
      totalScore += score
      if (moved) anyMoved = true
    }
  } else if (direction === 'down') {
    for (let c = 0; c < 4; c++) {
      const col = [newGrid[3][c], newGrid[2][c], newGrid[1][c], newGrid[0][c]]
      const [newCol, score, moved] = slideLine(col)
      for (let r = 0; r < 4; r++) {
        newGrid[3 - r][c] = newCol[r]
      }
      totalScore += score
      if (moved) anyMoved = true
    }
  }

  return { grid: newGrid, score: totalScore, moved: anyMoved }
}

// Check if any moves possible
export function canMove(grid: Grid): boolean {
  // Check for empty cells
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (grid[r][c] === null) return true
    }
  }

  // Check for adjacent same values
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const val = grid[r][c]
      if (c < 3 && grid[r][c + 1] === val) return true
      if (r < 3 && grid[r + 1][c] === val) return true
    }
  }

  return false
}

// Check if won (has 2048 tile)
export function hasWon(grid: Grid): boolean {
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (grid[r][c] === 2048) return true
    }
  }
  return false
}
