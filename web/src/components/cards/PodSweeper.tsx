import { useState, useCallback, useEffect } from 'react'
import { RotateCcw, Flag, Skull, Trophy, Timer, Bomb } from 'lucide-react'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'

type Difficulty = 'easy' | 'medium' | 'hard'

interface CellState {
  isMine: boolean
  isRevealed: boolean
  isFlagged: boolean
  adjacentMines: number
}

interface GameConfig {
  rows: number
  cols: number
  mines: number
}

const CONFIGS: Record<Difficulty, GameConfig> = {
  easy: { rows: 8, cols: 8, mines: 10 },
  medium: { rows: 12, cols: 12, mines: 25 },
  hard: { rows: 16, cols: 16, mines: 50 },
}

// Initialize empty grid
function createEmptyGrid(rows: number, cols: number): CellState[][] {
  return Array(rows).fill(null).map(() =>
    Array(cols).fill(null).map(() => ({
      isMine: false,
      isRevealed: false,
      isFlagged: false,
      adjacentMines: 0,
    }))
  )
}

// Place mines and calculate adjacent counts
function initializeGrid(rows: number, cols: number, mines: number, excludeRow: number, excludeCol: number): CellState[][] {
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
function cloneGrid(grid: CellState[][]): CellState[][] {
  return grid.map(row => row.map(cell => ({ ...cell })))
}

// Reveal cell and flood fill if empty
function revealCell(grid: CellState[][], row: number, col: number): CellState[][] {
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
function checkWin(grid: CellState[][]): boolean {
  for (const row of grid) {
    for (const cell of row) {
      // All non-mine cells must be revealed
      if (!cell.isMine && !cell.isRevealed) return false
    }
  }
  return true
}

// Count remaining flags
function countFlags(grid: CellState[][]): number {
  let count = 0
  for (const row of grid) {
    for (const cell of row) {
      if (cell.isFlagged) count++
    }
  }
  return count
}

// Number colors
const NUMBER_COLORS = [
  '', // 0 (not shown)
  'text-blue-400',
  'text-green-400',
  'text-red-400',
  'text-purple-400',
  'text-yellow-400',
  'text-pink-400',
  'text-cyan-400',
  'text-white',
]

export function PodSweeper(_props: CardComponentProps) {
  const { isExpanded } = useCardExpanded()

  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [grid, setGrid] = useState<CellState[][]>(() =>
    createEmptyGrid(CONFIGS.easy.rows, CONFIGS.easy.cols)
  )
  const [gameStarted, setGameStarted] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const config = CONFIGS[difficulty]

  // Timer effect
  useEffect(() => {
    if (!gameStarted || gameOver) return

    const timer = setInterval(() => {
      if (startTime) {
        setElapsed(Math.floor((Date.now() - startTime) / 1000))
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [gameStarted, gameOver, startTime])

  // Start a new game
  const newGame = useCallback((diff: Difficulty = difficulty) => {
    const cfg = CONFIGS[diff]
    setDifficulty(diff)
    setGrid(createEmptyGrid(cfg.rows, cfg.cols))
    setGameStarted(false)
    setGameOver(false)
    setWon(false)
    setStartTime(null)
    setElapsed(0)
  }, [difficulty])

  // Handle cell click
  const handleClick = useCallback((row: number, col: number) => {
    if (gameOver) return
    if (grid[row][col].isFlagged) return
    if (grid[row][col].isRevealed) return

    let newGrid: CellState[][]

    if (!gameStarted) {
      // First click - initialize grid
      newGrid = initializeGrid(config.rows, config.cols, config.mines, row, col)
      setGameStarted(true)
      setStartTime(Date.now())
    } else {
      newGrid = cloneGrid(grid)
    }

    // Reveal the cell
    if (newGrid[row][col].isMine) {
      // Hit a mine - game over
      newGrid[row][col].isRevealed = true
      // Reveal all mines
      for (const r of newGrid) {
        for (const c of r) {
          if (c.isMine) c.isRevealed = true
        }
      }
      setGrid(newGrid)
      setGameOver(true)
      setWon(false)
      return
    }

    newGrid = revealCell(newGrid, row, col)
    setGrid(newGrid)

    // Check for win
    if (checkWin(newGrid)) {
      setGameOver(true)
      setWon(true)
    }
  }, [grid, gameStarted, gameOver, config])

  // Handle right-click (flag)
  const handleRightClick = useCallback((e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault()
    if (gameOver) return
    if (grid[row][col].isRevealed) return

    const newGrid = cloneGrid(grid)
    newGrid[row][col].isFlagged = !newGrid[row][col].isFlagged
    setGrid(newGrid)
  }, [grid, gameOver])

  // Timer effect
  const flagsRemaining = config.mines - countFlags(grid)
  const cellSize = isExpanded ? 'w-7 h-7 text-sm' : 'w-5 h-5 text-xs'

  return (
    <div className="h-full flex flex-col p-2 select-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Bomb className="w-4 h-4 text-red-400" />
          <span className="text-sm font-semibold">Pod Sweeper</span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1 text-red-400">
            <Flag className="w-3 h-3" />
            <span>{flagsRemaining}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Timer className="w-3 h-3" />
            <span>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <select
            value={difficulty}
            onChange={(e) => newGame(e.target.value as Difficulty)}
            className="text-xs bg-secondary border border-border rounded px-1.5 py-1"
          >
            <option value="easy">Easy (8x8)</option>
            <option value="medium">Medium (12x12)</option>
            <option value="hard">Hard (16x16)</option>
          </select>
          <button
            onClick={() => newGame()}
            className="p-1.5 rounded hover:bg-secondary"
            title="New Game"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status message */}
      {gameOver && (
        <div className={`text-center text-sm font-medium mb-2 ${won ? 'text-green-400' : 'text-red-400'}`}>
          {won ? (
            <span className="flex items-center justify-center gap-1">
              <Trophy className="w-4 h-4" />
              You cleared all pods!
            </span>
          ) : (
            <span className="flex items-center justify-center gap-1">
              <Skull className="w-4 h-4" />
              Hit a corrupted pod!
            </span>
          )}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 flex items-center justify-center overflow-auto">
        <div
          className="inline-block border border-border rounded overflow-hidden"
          style={{ lineHeight: 0 }}
        >
          {grid.map((row, rowIdx) => (
            <div key={rowIdx} className="flex">
              {row.map((cell, colIdx) => {
                let content: React.ReactNode = null
                let bgClass = 'bg-secondary hover:bg-secondary/80'

                if (cell.isRevealed) {
                  if (cell.isMine) {
                    bgClass = 'bg-red-900'
                    content = <Bomb className="w-3 h-3 text-red-400" />
                  } else {
                    bgClass = 'bg-zinc-800'
                    if (cell.adjacentMines > 0) {
                      content = (
                        <span className={`font-bold ${NUMBER_COLORS[cell.adjacentMines]}`}>
                          {cell.adjacentMines}
                        </span>
                      )
                    }
                  }
                } else if (cell.isFlagged) {
                  content = <Flag className="w-3 h-3 text-red-400" />
                }

                return (
                  <div
                    key={colIdx}
                    onClick={() => handleClick(rowIdx, colIdx)}
                    onContextMenu={(e) => handleRightClick(e, rowIdx, colIdx)}
                    className={`${cellSize} flex items-center justify-center border border-border/50 cursor-pointer transition-colors ${bgClass}`}
                  >
                    {content}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div className="text-center text-xs text-muted-foreground mt-2">
        Click to reveal • Right-click to flag corrupted pods
      </div>
    </div>
  )
}
