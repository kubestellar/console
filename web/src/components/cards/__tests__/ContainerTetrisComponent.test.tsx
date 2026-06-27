import React from 'react'
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { ContainerTetris } from '../ContainerTetris'
import { TetrominoType } from '../containerTetrisHelpers'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (key === 'containerTetris.scoreLabel') {
        return `containerTetris.scoreLabel ${options?.score}`
      }
      return key
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../CardWrapper', () => ({
  useCardExpanded: () => ({ isExpanded: true }),
}))

vi.mock('../CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
}))

vi.mock('../../lib/analytics', () => ({
  emitGameStarted: vi.fn(),
  emitGameEnded: vi.fn(),
}))

// Get mock store for localStorage
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value
  }),
  clear: vi.fn(() => {
    for (const key in store) {
      delete store[key]
    }
  }),
}
vi.stubGlobal('localStorage', localStorageMock)

// Deterministic random tetromino controller
const PIECE_TYPES: TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
let mockRandomSequence: number[] = []
let mockSequenceIndex = 0

/**
 * Clean helper that maps piece names (e.g. 'I', 'O') to matching Math.random floats.
 * This completely decouples tests from strict array indexing or hardcoded numeric values.
 */
function queueNextPieces(pieces: TetrominoType[]) {
  mockRandomSequence = pieces.map(p => {
    const idx = PIECE_TYPES.indexOf(p)
    return idx >= 0 ? idx / PIECE_TYPES.length : 0
  })
  mockSequenceIndex = 0
}

// Game state helpers mocking
let shouldSimulateLineClear = 0
let shouldSimulateGameOver = false

vi.mock('../containerTetrisHelpers', async () => {
  const actual = await vi.importActual<typeof import('../containerTetrisHelpers')>('../containerTetrisHelpers')
  return {
    ...actual,
    clearLines: (board: any) => {
      if (shouldSimulateLineClear > 0) {
        const lines = shouldSimulateLineClear
        shouldSimulateLineClear = 0 // reset
        return {
          board: actual.createBoard(20, 10),
          linesCleared: lines,
        }
      }
      return actual.clearLines(board)
    },
    isValidPosition: (board: any, shape: any, x: any, y: any) => {
      if (shouldSimulateGameOver) {
        return false
      }
      return actual.isValidPosition(board, shape, x, y)
    }
  }
})

// ---------------------------------------------------------------------------
// Setup / Helpers
// ---------------------------------------------------------------------------

function getBoardCells() {
  const boardDiv = screen.getByTestId('tetris-board')
  const rows = Array.from(boardDiv.children)
  return rows.map(row => Array.from(row.children))
}

/**
 * Dynamically advance game timers until a specific condition is met.
 * This decouples tests from strict timing assumptions.
 */
function advanceTimersUntil(condition: () => boolean, maxTicks = 35) {
  let ticks = 0
  while (!condition() && ticks < maxTicks) {
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    ticks++
  }
  if (ticks >= maxTicks) {
    throw new Error('advanceTimersUntil exceeded max ticks')
  }
}

describe('ContainerTetris Component Layer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    shouldSimulateLineClear = 0
    shouldSimulateGameOver = false
    mockRandomSequence = []
    mockSequenceIndex = 0
    vi.useFakeTimers()

    // Spy on Math.random to make random piece selection deterministic
    vi.spyOn(Math, 'random').mockImplementation(() => {
      const val = mockRandomSequence[mockSequenceIndex] ?? 0
      mockSequenceIndex++
      return val
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // Start overlay & scoreboard
  // -------------------------------------------------------------------------
  it('renders start overlay initially and transitions to game', () => {
    render(<ContainerTetris cardId="tetris" cardType="tetris" />)

    // Before game starts, start overlay button is visible
    const startBtn = screen.getByRole('button', { name: 'containerTetris.startGame' })
    expect(startBtn).toBeInTheDocument()

    // Scoreboard items display initial values
    const scoreLabel = screen.getByText('containerTetris.score')
    expect(scoreLabel.nextElementSibling?.textContent).toBe('0')

    const levelLabel = screen.getByText('containerTetris.level')
    expect(levelLabel.nextElementSibling?.textContent).toBe('1')

    const linesLabel = screen.getByText('containerTetris.lines')
    expect(linesLabel.nextElementSibling?.textContent).toBe('0')

    const bestLabel = screen.getByText('containerTetris.best')
    expect(bestLabel.nextElementSibling?.textContent).toBe('0')

    // Clicking it starts the game
    fireEvent.click(startBtn)

    // Start Game button should be gone
    expect(screen.queryByRole('button', { name: 'containerTetris.startGame' })).not.toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Pause overlay
  // -------------------------------------------------------------------------
  it('toggles pause overlay via header pause button and keyboard "p"', () => {
    render(<ContainerTetris cardId="tetris" cardType="tetris" />)

    // Start game
    fireEvent.click(screen.getByRole('button', { name: 'containerTetris.startGame' }))
    // Flush initial state
    act(() => {
      vi.advanceTimersByTime(50)
    })

    // Pause overlay should not be visible
    expect(screen.queryByText('containerTetris.pausedTitle')).not.toBeInTheDocument()

    // Click pause button in the header
    const pauseBtn = screen.getByTitle('containerTetris.pauseAction')
    fireEvent.click(pauseBtn)

    // Pause overlay is visible
    expect(screen.getByText('containerTetris.pausedTitle')).toBeInTheDocument()

    // Query resume button scoped directly inside the paused overlay container
    const pausedOverlay = screen.getByText('containerTetris.pausedTitle').parentElement!
    const resumeBtn = within(pausedOverlay).getByRole('button', { name: 'containerTetris.resume' })
    fireEvent.click(resumeBtn)

    // Pause overlay is hidden again
    expect(screen.queryByText('containerTetris.pausedTitle')).not.toBeInTheDocument()

    // Test pausing via keyboard 'p'
    fireEvent.keyDown(window, { key: 'p' })
    expect(screen.getByText('containerTetris.pausedTitle')).toBeInTheDocument()

    // Resume via keyboard 'P'
    fireEvent.keyDown(window, { key: 'P' })
    expect(screen.queryByText('containerTetris.pausedTitle')).not.toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Keyboard controls (ArrowLeft/ArrowRight)
  // -------------------------------------------------------------------------
  it('moves the active piece horizontally on keyboard controls', () => {
    // 1st element: mount nextPiece ('I')
    // 2nd element: start active piece ('I')
    // 3rd element: start next piece preview ('I')
    queueNextPieces(['I', 'I', 'I'])

    render(<ContainerTetris cardId="tetris" cardType="tetris" />)

    // Start game
    fireEvent.click(screen.getByRole('button', { name: 'containerTetris.startGame' }))
    act(() => {
      vi.advanceTimersByTime(50)
    })

    // Move piece down by 1 row so it enters the board (at y: 0)
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    const cellsBefore = getBoardCells()
    // Initial spawns shape at middle-ish 
    expect(cellsBefore[0][3].getAttribute('data-color')).toBe('bg-cyan-500')
    expect(cellsBefore[0][2].getAttribute('data-color')).not.toBe('bg-cyan-500')
    expect(cellsBefore[0][3].className).toContain('bg-cyan-500')
    expect(cellsBefore[0][2].className).not.toContain('bg-cyan-500')

    // Move left
    fireEvent.keyDown(window, { key: 'ArrowLeft' })

    const cellsLeft = getBoardCells()
    expect(cellsLeft[0][2].getAttribute('data-color')).toBe('bg-cyan-500')
    expect(cellsLeft[0][3].getAttribute('data-color')).toBe('bg-cyan-500')
    expect(cellsLeft[0][2].className).toContain('bg-cyan-500')
    expect(cellsLeft[0][3].className).toContain('bg-cyan-500')

    // Move right twice (left -> initial -> right)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })

    const cellsRight = getBoardCells()
    expect(cellsRight[0][4].getAttribute('data-color')).toBe('bg-cyan-500')
    expect(cellsRight[0][4].className).toContain('bg-cyan-500')
  })

  // -------------------------------------------------------------------------
  // Next piece preview & piece locking
  // -------------------------------------------------------------------------
  it('renders next piece preview panel and updates shape after landing', async () => {
    // 1st element: mount nextPiece ('I')
    // 2nd element: start active piece ('I')
    // 3rd element: start next piece preview ('O')
    // 4th element: next piece preview spawn after landing ('I')
    queueNextPieces(['I', 'I', 'O', 'I'])

    render(<ContainerTetris cardId="tetris" cardType="tetris" />)

    // Start game
    fireEvent.click(screen.getByRole('button', { name: 'containerTetris.startGame' }))
    act(() => {
      vi.advanceTimersByTime(50)
    })

    // Next piece preview header is visible
    expect(screen.getByText('containerTetris.next')).toBeInTheDocument()

    // Let the first piece fall and lock naturally
    // Condition: active piece becomes the 'O' tetromino (occupies top columns)
    advanceTimersUntil(() => {
      const cells = getBoardCells()
      return cells[0][4].getAttribute('data-color') === 'bg-yellow-500'
    })

    const cells = getBoardCells()
    expect(cells[0][4].getAttribute('data-color')).toBe('bg-yellow-500')
    expect(cells[0][4].className).toContain('bg-yellow-500')
  })

  // -------------------------------------------------------------------------
  // Score and level increments
  // -------------------------------------------------------------------------
  it('increments score and level when lines are cleared', () => {
    queueNextPieces(['I', 'I', 'I', 'I', 'I'])

    render(<ContainerTetris cardId="tetris" cardType="tetris" />)

    // Start game
    fireEvent.click(screen.getByRole('button', { name: 'containerTetris.startGame' }))
    act(() => {
      vi.advanceTimersByTime(50)
    })

    // Force line clear of 1 line on next landing
    shouldSimulateLineClear = 1

    // Let the piece fall and lock naturally until score is updated
    advanceTimersUntil(() => {
      const score = screen.getByText('containerTetris.score').nextElementSibling?.textContent
      return score === '100'
    })

    // Score increases to 100, lines increases to 1
    expect(screen.getByText('containerTetris.score').nextElementSibling?.textContent).toBe('100')
    expect(screen.getByText('containerTetris.lines').nextElementSibling?.textContent).toBe('1')
    expect(screen.getByText('containerTetris.level').nextElementSibling?.textContent).toBe('1')

    // Force line clear of 3 lines
    shouldSimulateLineClear = 3

    // Let the second piece fall and lock naturally until score updates again
    advanceTimersUntil(() => {
      const score = screen.getByText('containerTetris.score').nextElementSibling?.textContent
      return score === '600'
    })

    // Level updates to 1 (total lines 4, level up only every 10 lines)
    expect(screen.getByText('containerTetris.lines').nextElementSibling?.textContent).toBe('4')
    expect(screen.getByText('containerTetris.score').nextElementSibling?.textContent).toBe('600') // 100 + 500
  })

  // -------------------------------------------------------------------------
  // High score persistence & Game Over overlay
  // -------------------------------------------------------------------------
  it('reads high score on mount and persists new high score on game over', () => {
    queueNextPieces(['I', 'I', 'I', 'I', 'I'])
    // Seed high score in localStorage mock
    store['highscore-containerTetris'] = '450'

    render(<ContainerTetris cardId="tetris" cardType="tetris" />)

    // High score loaded on mount
    expect(screen.getByText('containerTetris.best').nextElementSibling?.textContent).toBe('450')

    // Start game
    fireEvent.click(screen.getByRole('button', { name: 'containerTetris.startGame' }))
    act(() => {
      vi.advanceTimersByTime(50)
    })

    // Clear 4 lines to set score to 800
    shouldSimulateLineClear = 4
    advanceTimersUntil(() => {
      const score = screen.getByText('containerTetris.score').nextElementSibling?.textContent
      return score === '800'
    })

    // Verify current score (800)
    expect(screen.getByText('containerTetris.score').nextElementSibling?.textContent).toBe('800')

    // Trigger game over on the next piece spawn/landing
    shouldSimulateGameOver = true
    advanceTimersUntil(() => {
      return screen.queryByText('containerTetris.gameOver') !== null
    })

    // Game over overlay displays with final score
    expect(screen.getByText('containerTetris.gameOver')).toBeInTheDocument()
    expect(screen.getByText('containerTetris.scoreLabel 800')).toBeInTheDocument()

    // Verify new high score is persisted to localStorage mock
    expect(localStorageMock.setItem).toHaveBeenCalledWith('highscore-containerTetris', '800')
    expect(screen.getByText('containerTetris.best').nextElementSibling?.textContent).toBe('800')

    // Click play again
    fireEvent.click(screen.getByRole('button', { name: 'containerTetris.playAgain' }))

    // Overlays are dismissed, score resets but best stays 800
    expect(screen.queryByText('containerTetris.gameOver')).not.toBeInTheDocument()
    expect(screen.getByText('containerTetris.score').nextElementSibling?.textContent).toBe('0')
    expect(screen.getByText('containerTetris.best').nextElementSibling?.textContent).toBe('800')
  })
})
