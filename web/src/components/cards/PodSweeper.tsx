import { useEffect, useReducer } from 'react'
import { RotateCcw, Flag, Skull, Trophy, Timer, Bomb } from 'lucide-react'
import { CardComponentProps } from './cardRegistry.types'
import { useCardExpanded } from './CardWrapper'
import { useReportCardDataState } from './CardDataContext'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { useTranslation } from 'react-i18next'
import { emitGameStarted, emitGameEnded } from '../../lib/analytics'
import { Button } from '../ui/Button'
import { MS_PER_SECOND } from '../../lib/constants/time'
import {
  NO_LINE_HEIGHT_STYLE,
  CONFIGS,
  initializeGrid,
  cloneGrid,
  revealCell,
  checkWin,
  countFlags,
  NUMBER_COLORS,
  createInitialState,
  gameReducer,
} from './PodSweeper.logic'
import type { Difficulty, CellState } from './PodSweeper.logic'

// #6216: wrapped in DynamicCardErrorBoundary so a runtime error in the
// 350-line game loop doesn't crash the whole dashboard.
function PodSweeperInternal(_props: CardComponentProps) {
  const { t } = useTranslation('cards')
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: false })
  const { isExpanded } = useCardExpanded()

  const [state, dispatch] = useReducer(gameReducer, 'easy', createInitialState)
  const { difficulty, grid, gameStarted, gameOver, won, startTime, elapsed } = state

  const config = CONFIGS[difficulty]

  // Timer effect
  useEffect(() => {
    if (!gameStarted || gameOver) return

    const timer = setInterval(() => {
      if (startTime) {
        dispatch({ type: 'TICK', elapsed: Math.floor((Date.now() - startTime) / MS_PER_SECOND) })
      }
    }, MS_PER_SECOND)

    return () => clearInterval(timer)
  }, [gameStarted, gameOver, startTime])

  // Start a new game
  const newGame = (diff: Difficulty = difficulty) => {
    dispatch({ type: 'NEW_GAME', difficulty: diff })
  }

  // Handle cell click
  const handleClick = (row: number, col: number) => {
    if (gameOver) return
    if (grid[row][col].isFlagged) return
    if (grid[row][col].isRevealed) return

    let newGrid: CellState[][]

    if (!gameStarted) {
      // First click - initialize grid
      newGrid = initializeGrid(config.rows, config.cols, config.mines, row, col)
      emitGameStarted('pod_sweeper')
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
      dispatch({ type: 'MINE_HIT', grid: newGrid })
      emitGameEnded('pod_sweeper', 'loss', elapsed)
      return
    }

    if (!gameStarted) {
      // Batch first-click initialization with reveal
      newGrid = revealCell(newGrid, row, col)
      const isWin = checkWin(newGrid)
      if (isWin) {
        dispatch({ type: 'FIRST_CLICK', grid: newGrid, startTime: Date.now() })
        dispatch({ type: 'WIN', grid: newGrid })
        emitGameEnded('pod_sweeper', 'win', elapsed)
      } else {
        dispatch({ type: 'FIRST_CLICK', grid: newGrid, startTime: Date.now() })
      }
      return
    }

    newGrid = revealCell(newGrid, row, col)

    // Check for win
    if (checkWin(newGrid)) {
      dispatch({ type: 'WIN', grid: newGrid })
      emitGameEnded('pod_sweeper', 'win', elapsed)
    } else {
      dispatch({ type: 'REVEAL', grid: newGrid })
    }
  }

  // Handle right-click (flag)
  const handleRightClick = (e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault()
    if (gameOver) return
    if (grid[row][col].isRevealed) return

    const newGrid = cloneGrid(grid)
    newGrid[row][col].isFlagged = !newGrid[row][col].isFlagged
    dispatch({ type: 'FLAG', grid: newGrid })
  }

  // Timer effect
  const flagsRemaining = config.mines - countFlags(grid)
  const cellSize = isExpanded ? 'w-7 h-7 text-sm' : 'w-5 h-5 text-xs'

  return (
    <div className="h-full flex flex-col p-2 select-none">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
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
            <option value="easy">{t('podSweeper.easyMode')}</option>
            <option value="medium">{t('podSweeper.mediumMode')}</option>
            <option value="hard">{t('podSweeper.hardMode')}</option>
          </select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => newGame()}
            className="p-1.5"
            title="New Game"
            icon={<RotateCcw className="w-4 h-4" />}
          />
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
          style={NO_LINE_HEIGHT_STYLE}
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
                    bgClass = 'bg-gray-800'
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
                    role="button"
                    tabIndex={0}
                    aria-label={`Cell row ${rowIdx + 1} column ${colIdx + 1}`}
                    onClick={() => handleClick(rowIdx, colIdx)}
                    onContextMenu={(e) => handleRightClick(e, rowIdx, colIdx)}
                    onKeyDown={(e) => {
                      // Issue #8837: Enter/Space reveal, F to toggle flag (matches right-click)
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        handleClick(rowIdx, colIdx)
                      } else if (e.key === "f" || e.key === "F") {
                        e.preventDefault()
                        handleRightClick(e as unknown as React.MouseEvent, rowIdx, colIdx)
                      }
                    }}
                    className={`${cellSize} flex items-center justify-center border border-border/50 cursor-pointer transition-colors ${bgClass} focus:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-400`}
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

export function PodSweeper(props: CardComponentProps) {
  return (
    <DynamicCardErrorBoundary cardId="PodSweeper">
      <PodSweeperInternal {...props} />
    </DynamicCardErrorBoundary>
  )
}
