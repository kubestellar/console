import { useState, useEffect, useCallback } from 'react'
import { RotateCcw, Trophy, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'

type Grid = (number | null)[][]

// Tile colors based on value - Kubernetes themed
const TILE_COLORS: Record<number, { bg: string; text: string }> = {
  2: { bg: 'bg-blue-500/80', text: 'text-white' },
  4: { bg: 'bg-blue-600/80', text: 'text-white' },
  8: { bg: 'bg-cyan-500/80', text: 'text-white' },
  16: { bg: 'bg-cyan-600/80', text: 'text-white' },
  32: { bg: 'bg-teal-500/80', text: 'text-white' },
  64: { bg: 'bg-teal-600/80', text: 'text-white' },
  128: { bg: 'bg-green-500/80', text: 'text-white' },
  256: { bg: 'bg-green-600/80', text: 'text-white' },
  512: { bg: 'bg-yellow-500/80', text: 'text-black' },
  1024: { bg: 'bg-orange-500/80', text: 'text-white' },
  2048: { bg: 'bg-purple-500/80', text: 'text-white' },
  4096: { bg: 'bg-pink-500/80', text: 'text-white' },
  8192: { bg: 'bg-red-500/80', text: 'text-white' },
}

// Create empty 4x4 grid
function createEmptyGrid(): Grid {
  return Array(4).fill(null).map(() => Array(4).fill(null))
}

// Add random tile (2 or 4) to empty cell
function addRandomTile(grid: Grid): Grid {
  const newGrid = grid.map(row => [...row])
  const emptyCells: [number, number][] = []

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
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
function initGame(): Grid {
  let grid = createEmptyGrid()
  grid = addRandomTile(grid)
  grid = addRandomTile(grid)
  return grid
}

// Slide tiles in a row/column, return [newLine, score, moved]
function slideLine(line: (number | null)[]): [(number | null)[], number, boolean] {
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
  while (newLine.length < 4) {
    newLine.push(null)
  }

  // Check if moved
  for (let j = 0; j < 4; j++) {
    if (line[j] !== newLine[j]) {
      moved = true
      break
    }
  }

  return [newLine, score, moved]
}

// Move grid in direction
function moveGrid(grid: Grid, direction: 'up' | 'down' | 'left' | 'right'): { grid: Grid; score: number; moved: boolean } {
  let newGrid = grid.map(row => [...row])
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
function canMove(grid: Grid): boolean {
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
function hasWon(grid: Grid): boolean {
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (grid[r][c] === 2048) return true
    }
  }
  return false
}

export function Game2048(_props: CardComponentProps) {
  const { isExpanded } = useCardExpanded()
  const [grid, setGrid] = useState<Grid>(initGame)
  const [score, setScore] = useState(0)
  const [bestScore, setBestScore] = useState(() => {
    try {
      return parseInt(localStorage.getItem('kube2048-best') || '0')
    } catch {
      return 0
    }
  })
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  const [keepPlaying, setKeepPlaying] = useState(false)

  // Handle move
  const handleMove = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    if (gameOver) return

    const result = moveGrid(grid, direction)

    if (result.moved) {
      let newGrid = addRandomTile(result.grid)
      setGrid(newGrid)
      const newScore = score + result.score
      setScore(newScore)

      if (newScore > bestScore) {
        setBestScore(newScore)
        localStorage.setItem('kube2048-best', String(newScore))
      }

      // Check win
      if (!won && !keepPlaying && hasWon(newGrid)) {
        setWon(true)
      }

      // Check game over
      if (!canMove(newGrid)) {
        setGameOver(true)
      }
    }
  }, [grid, score, bestScore, gameOver, won, keepPlaying])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameOver && !won) return

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault()
          handleMove('up')
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault()
          handleMove('down')
          break
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault()
          handleMove('left')
          break
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault()
          handleMove('right')
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleMove, gameOver, won])

  // New game
  const newGame = useCallback(() => {
    setGrid(initGame())
    setScore(0)
    setGameOver(false)
    setWon(false)
    setKeepPlaying(false)
  }, [])

  // Continue after winning
  const continueGame = useCallback(() => {
    setWon(false)
    setKeepPlaying(true)
  }, [])

  const cellSize = isExpanded ? 80 : 48
  const gap = isExpanded ? 8 : 4
  const fontSize = isExpanded ? 'text-2xl' : 'text-sm'

  return (
    <div className="h-full flex flex-col p-2 select-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-semibold">Kube 2048</span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="text-center">
            <div className="text-muted-foreground">Score</div>
            <div className="font-bold text-foreground">{score}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Best</div>
            <div className="font-bold text-yellow-400">{bestScore}</div>
          </div>
        </div>

        <button
          onClick={newGame}
          className="p-1.5 rounded hover:bg-secondary"
          title="New Game"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Game area - centered */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Grid */}
        <div
          className="bg-secondary/50 rounded-lg p-2 relative"
          style={{ padding: gap }}
        >
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(4, ${cellSize}px)`,
              gap,
            }}
          >
            {grid.map((row, r) =>
              row.map((value, c) => {
                const colors = value ? TILE_COLORS[value] || { bg: 'bg-red-600', text: 'text-white' } : null

                return (
                  <div
                    key={`${r}-${c}`}
                    className={`rounded flex items-center justify-center font-bold transition-all ${
                      colors ? `${colors.bg} ${colors.text}` : 'bg-secondary/30'
                    } ${fontSize}`}
                    style={{ width: cellSize, height: cellSize }}
                  >
                    {value}
                  </div>
                )
              })
            )}
          </div>

          {/* Win overlay */}
          {won && !keepPlaying && (
            <div className="absolute inset-0 bg-yellow-500/80 rounded-lg flex flex-col items-center justify-center">
              <Trophy className="w-12 h-12 text-white mb-2" />
              <div className="text-2xl font-bold text-white mb-4">You Win!</div>
              <div className="flex gap-2">
                <button
                  onClick={continueGame}
                  className="px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30"
                >
                  Keep Playing
                </button>
                <button
                  onClick={newGame}
                  className="px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30"
                >
                  New Game
                </button>
              </div>
            </div>
          )}

          {/* Game over overlay */}
          {gameOver && (
            <div className="absolute inset-0 bg-background/80 rounded-lg flex flex-col items-center justify-center">
              <div className="text-xl font-bold text-foreground mb-2">Game Over!</div>
              <div className="text-muted-foreground mb-4">Score: {score}</div>
              <button
                onClick={newGame}
                className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Controls hint */}
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <ArrowUp className="w-3 h-3" />
          <ArrowDown className="w-3 h-3" />
          <ArrowLeft className="w-3 h-3" />
          <ArrowRight className="w-3 h-3" />
          <span>or WASD to move</span>
        </div>
      </div>
    </div>
  )
}
