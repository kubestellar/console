import { useState, useRef } from 'react'
import { RotateCcw, Trophy, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react'
import { CardComponentProps } from './cardRegistry'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { useGameKeys } from '../../hooks/useGameKeys'
import { safeSetItem } from '@/lib/utils/localStorage'
import {
  BEST_SCORE_STORAGE_KEY,
  getStoredBestScore,
  TILE_COLORS,
  addRandomTile,
  initGame,
  moveGrid,
  canMove,
  hasWon,
} from './Game2048.logic'
import type { Grid } from './Game2048.logic'

export function Game2048(_props: CardComponentProps) {
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: false })
  const { isExpanded, containerSize } = useCardExpanded()
  const gameContainerRef = useRef<HTMLDivElement>(null)
  const [grid, setGrid] = useState<Grid>(initGame)
  const [score, setScore] = useState(0)
  const [bestScore, setBestScore] = useState(getStoredBestScore)
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  const [keepPlaying, setKeepPlaying] = useState(false)

  // Handle move
  const handleMove = (direction: 'up' | 'down' | 'left' | 'right') => {
    if (gameOver) return

    const result = moveGrid(grid, direction)

    if (result.moved) {
      const newGrid = addRandomTile(result.grid)
      setGrid(newGrid)
      const newScore = score + result.score
      setScore(newScore)

      if (newScore > bestScore) {
        setBestScore(newScore)
        safeSetItem(BEST_SCORE_STORAGE_KEY, String(newScore))
      }

      // Check win
      if (!won && !keepPlaying && hasWon(newGrid)) {
        setWon(true)
        emitGameEnded('2048', 'win', newScore)
      }

      // Check game over
      if (!canMove(newGrid)) {
        setGameOver(true)
        emitGameEnded('2048', 'loss', newScore)
      }
    }
  }

  // Keyboard controls — scoped to visible game container (KeepAlive-safe)
  const handle2048KeyDown = (e: KeyboardEvent) => {
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
  useGameKeys(gameContainerRef, { onKeyDown: handle2048KeyDown })

  // New game
  const newGame = () => {
    setGrid(initGame())
    setScore(0)
    setGameOver(false)
    setWon(false)
    setKeepPlaying(false)
    emitGameStarted('2048')
  }

  // Continue after winning
  const continueGame = () => {
    setWon(false)
    setKeepPlaying(true)
  }

  /** Grid columns in 2048 */
  const GRID_COLS = 4
  /** Default cell size (px) when card is collapsed */
  const DEFAULT_CELL_SIZE = 48
  /** Gap between cells (px) when card is collapsed */
  const DEFAULT_GAP = 4
  /** Padding around the grid (px) */
  const GRID_PADDING = 8
  /** Vertical space reserved for header and controls hint (px) */
  const CHROME_HEIGHT = 80

  // When expanded, compute cell size from container dimensions to fill available space
  const computedCellSize = (() => {
    if (!isExpanded || containerSize.width === 0 || containerSize.height === 0) {
      return DEFAULT_CELL_SIZE
    }
    const expandedGap = 8
    const availW = containerSize.width - GRID_PADDING * 2 - expandedGap * (GRID_COLS - 1)
    const availH = containerSize.height - CHROME_HEIGHT - GRID_PADDING * 2 - expandedGap * (GRID_COLS - 1)
    const maxCell = Math.floor(Math.min(availW, availH) / GRID_COLS)
    if (!Number.isFinite(maxCell) || maxCell <= 0) {
      return DEFAULT_CELL_SIZE
    }
    return maxCell
  })()
  const cellSize = computedCellSize
  const gap = isExpanded ? 8 : DEFAULT_GAP
  const fontSize = cellSize >= 64 ? 'text-2xl' : cellSize >= 48 ? 'text-lg' : 'text-sm'

  return (
    <div ref={gameContainerRef} className="h-full flex flex-col p-2 select-none">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
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
          aria-label="New Game"
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
              gap }}
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

          {/* Win overlay — buttons sit on yellow so we use semantic foreground/muted. */}
          {won && !keepPlaying && (
            <div className="absolute inset-0 bg-yellow-500/80 rounded-lg flex flex-col items-center justify-center">
              <Trophy className="w-12 h-12 text-foreground mb-2" />
              <div className="text-2xl font-bold text-foreground mb-4">You Win!</div>
              <div className="flex gap-2">
                 <span
                   role="button"
                   tabIndex={0}
                   aria-label="Keep playing 2048 game"
                   onClick={continueGame}
                   onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); continueGame() } }}
                   className="px-4 py-2 bg-muted/30 text-foreground rounded-lg hover:bg-muted/50 cursor-pointer"
                 >
                  Keep Playing
                </span>
                 <span
                   role="button"
                   tabIndex={0}
                   aria-label="Start new 2048 game"
                   onClick={newGame}
                   onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); newGame() } }}
                   className="px-4 py-2 bg-muted/30 text-foreground rounded-lg hover:bg-muted/50 cursor-pointer"
                 >
                  New Game
                </span>
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
