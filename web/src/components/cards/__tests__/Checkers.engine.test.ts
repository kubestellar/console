import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock safeLocalStorage so tests never touch a real localStorage
const mockSafeGet = vi.fn<() => string | null>(() => null)
const mockSafeSetJSON = vi.fn<() => void>(() => undefined)

vi.mock('../../../lib/safeLocalStorage', () => ({
  safeGet: (...args: Parameters<typeof mockSafeGet>) => mockSafeGet(...args),
  safeSetJSON: (...args: Parameters<typeof mockSafeSetJSON>) => mockSafeSetJSON(...args),
  safeSet: vi.fn(),
  safeRemove: vi.fn(),
  safeGetJSON: vi.fn(() => null),
}))

import {
  createInitialBoard,
  cloneBoard,
  getValidMoves,
  getAllMoves,
  applyMove,
  getChainJumps,
  evaluateBoard,
  loadGameState,
  saveGameState,
  STORAGE_KEY,
  type SavedGameState,
} from '../Checkers.engine'
import { BOARD_SIZE, type Board } from '../Checkers.types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count all non-null cells owned by `player`. */
function countPlayer(board: Board, player: 'pods' | 'nodes') {
  let n = 0
  for (const row of board) for (const cell of row) if (cell?.player === player) n++
  return n
}

/** Build a blank 8×8 board. */
function emptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null))
}

// ---------------------------------------------------------------------------
// createInitialBoard
// ---------------------------------------------------------------------------

describe('createInitialBoard', () => {
  let board: Board

  beforeEach(() => {
    board = createInitialBoard()
  })

  it('returns an 8×8 grid', () => {
    expect(board).toHaveLength(BOARD_SIZE)
    for (const row of board) expect(row).toHaveLength(BOARD_SIZE)
  })

  it('places exactly 12 nodes pieces', () => {
    expect(countPlayer(board, 'nodes')).toBe(12)
  })

  it('places exactly 12 pods pieces', () => {
    expect(countPlayer(board, 'pods')).toBe(12)
  })

  it('places nodes only in rows 0–2', () => {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c]?.player === 'nodes') {
          expect(r).toBeLessThan(3)
        }
      }
    }
  })

  it('places pods only in rows 5–7', () => {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c]?.player === 'pods') {
          expect(r).toBeGreaterThanOrEqual(5)
        }
      }
    }
  })

  it('places pieces only on dark squares ((row+col)%2 === 1)', () => {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] !== null) {
          expect((r + c) % 2).toBe(1)
        }
      }
    }
  })

  it('rows 3 and 4 are entirely empty', () => {
    for (const c of [3, 4]) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        expect(board[c][col]).toBeNull()
      }
    }
  })

  it('every piece starts as normal type', () => {
    for (const row of board) {
      for (const cell of row) {
        if (cell) expect(cell.type).toBe('normal')
      }
    }
  })
})

// ---------------------------------------------------------------------------
// cloneBoard
// ---------------------------------------------------------------------------

describe('cloneBoard', () => {
  it('produces a distinct array reference', () => {
    const board = createInitialBoard()
    const clone = cloneBoard(board)
    expect(clone).not.toBe(board)
  })

  it('mutating a piece in the clone does not affect the original', () => {
    const board = createInitialBoard()
    const clone = cloneBoard(board)

    // Find the first non-null cell and mutate it in the clone
    outer: for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (clone[r][c]) {
          clone[r][c]!.type = 'king'
          expect(board[r][c]!.type).toBe('normal')
          break outer
        }
      }
    }
  })

  it('preserves null cells as null', () => {
    const board = createInitialBoard()
    const clone = cloneBoard(board)
    // Row 3 should be all-null in both
    for (let c = 0; c < BOARD_SIZE; c++) {
      expect(clone[3][c]).toBeNull()
    }
  })

  it('cloned piece objects are distinct references', () => {
    const board = createInitialBoard()
    const clone = cloneBoard(board)
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] && clone[r][c]) {
          expect(clone[r][c]).not.toBe(board[r][c])
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// getValidMoves
// ---------------------------------------------------------------------------

describe('getValidMoves', () => {
  it('returns [] for an empty position', () => {
    const board = emptyBoard()
    expect(getValidMoves(board, { row: 3, col: 3 })).toEqual([])
  })

  it('normal pods piece moves only in row direction -1 (towards row 0)', () => {
    const board = emptyBoard()
    board[4][3] = { player: 'pods', type: 'normal' }
    const moves = getValidMoves(board, { row: 4, col: 3 })
    expect(moves.length).toBeGreaterThan(0)
    for (const m of moves) {
      expect(m.to.row).toBe(3) // row-1
    }
  })

  it('normal nodes piece moves only in row direction +1 (towards row 7)', () => {
    const board = emptyBoard()
    board[3][2] = { player: 'nodes', type: 'normal' }
    const moves = getValidMoves(board, { row: 3, col: 2 })
    expect(moves.length).toBeGreaterThan(0)
    for (const m of moves) {
      expect(m.to.row).toBe(4) // row+1
    }
  })

  it('king piece moves in both row directions', () => {
    const board = emptyBoard()
    board[4][4] = { player: 'pods', type: 'king' }
    const moves = getValidMoves(board, { row: 4, col: 4 })
    const rows = moves.map(m => m.to.row)
    expect(rows).toContain(3) // up
    expect(rows).toContain(5) // down
  })

  it('when a jump is available, simple moves are suppressed', () => {
    const board = emptyBoard()
    board[4][3] = { player: 'pods', type: 'normal' }
    board[3][4] = { player: 'nodes', type: 'normal' } // mid piece
    // row 2, col 5 is empty → jump available
    const moves = getValidMoves(board, { row: 4, col: 3 })
    expect(moves.every(m => m.isJump)).toBe(true)
    expect(moves.length).toBeGreaterThan(0)
  })

  it('mustJump=true with no jump available returns []', () => {
    const board = emptyBoard()
    board[4][3] = { player: 'pods', type: 'normal' }
    const moves = getValidMoves(board, { row: 4, col: 3 }, true)
    expect(moves).toEqual([])
  })

  it('jump requires opponent piece on mid square', () => {
    const board = emptyBoard()
    board[4][3] = { player: 'pods', type: 'normal' }
    // No mid piece → no jump
    const moves = getValidMoves(board, { row: 4, col: 3 })
    expect(moves.every(m => !m.isJump)).toBe(true)
  })

  it('jump blocked when mid piece is same player', () => {
    const board = emptyBoard()
    board[4][3] = { player: 'pods', type: 'normal' }
    board[3][4] = { player: 'pods', type: 'normal' } // friendly mid — no jump
    const moves = getValidMoves(board, { row: 4, col: 3 })
    expect(moves.every(m => !m.isJump)).toBe(true)
  })

  it('jump blocked when destination is occupied', () => {
    const board = emptyBoard()
    board[4][3] = { player: 'pods', type: 'normal' }
    board[3][4] = { player: 'nodes', type: 'normal' } // opponent mid
    board[2][5] = { player: 'pods', type: 'normal' } // destination blocked
    const moves = getValidMoves(board, { row: 4, col: 3 })
    const jumpTo25 = moves.filter(m => m.isJump && m.to.row === 2 && m.to.col === 5)
    expect(jumpTo25).toHaveLength(0)
  })

  it('friendly piece on diagonal suppresses that simple move', () => {
    const board = emptyBoard()
    board[4][3] = { player: 'pods', type: 'normal' }
    board[3][4] = { player: 'pods', type: 'normal' } // blocks right diagonal
    board[3][2] = { player: 'pods', type: 'normal' } // blocks left diagonal
    const moves = getValidMoves(board, { row: 4, col: 3 })
    expect(moves).toEqual([])
  })

  it('corner piece at row 0 produces no out-of-bounds moves', () => {
    const board = emptyBoard()
    board[0][1] = { player: 'nodes', type: 'king' }
    const moves = getValidMoves(board, { row: 0, col: 1 })
    for (const m of moves) {
      expect(m.to.row).toBeGreaterThanOrEqual(0)
      expect(m.to.row).toBeLessThan(BOARD_SIZE)
      expect(m.to.col).toBeGreaterThanOrEqual(0)
      expect(m.to.col).toBeLessThan(BOARD_SIZE)
    }
  })
})

// ---------------------------------------------------------------------------
// getAllMoves
// ---------------------------------------------------------------------------

describe('getAllMoves', () => {
  it('returns empty array when a player has no pieces', () => {
    const board = emptyBoard()
    expect(getAllMoves(board, 'pods')).toEqual([])
  })

  it('when any jump exists, only jumps are returned (mandatory capture)', () => {
    const board = emptyBoard()
    // Piece with a simple move available
    board[6][1] = { player: 'pods', type: 'normal' }
    // Piece with a jump available
    board[4][3] = { player: 'pods', type: 'normal' }
    board[3][4] = { player: 'nodes', type: 'normal' } // mid for jump
    // row 2 col 5 empty → jump exists
    const moves = getAllMoves(board, 'pods')
    expect(moves.every(m => m.isJump)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// applyMove
// ---------------------------------------------------------------------------

describe('applyMove', () => {
  it('moves a piece from source to destination', () => {
    const board = emptyBoard()
    board[4][3] = { player: 'pods', type: 'normal' }
    const newBoard = applyMove(board, {
      from: { row: 4, col: 3 },
      to: { row: 3, col: 4 },
      captures: [],
      isJump: false,
    })
    expect(newBoard[3][4]?.player).toBe('pods')
    expect(newBoard[4][3]).toBeNull()
  })

  it('removes captured pieces', () => {
    const board = emptyBoard()
    board[4][3] = { player: 'pods', type: 'normal' }
    board[3][4] = { player: 'nodes', type: 'normal' }
    const newBoard = applyMove(board, {
      from: { row: 4, col: 3 },
      to: { row: 2, col: 5 },
      captures: [{ row: 3, col: 4 }],
      isJump: true,
    })
    expect(newBoard[3][4]).toBeNull()
  })

  it('promotes pods piece to king on reaching row 0', () => {
    const board = emptyBoard()
    board[1][2] = { player: 'pods', type: 'normal' }
    const newBoard = applyMove(board, {
      from: { row: 1, col: 2 },
      to: { row: 0, col: 3 },
      captures: [],
      isJump: false,
    })
    expect(newBoard[0][3]?.type).toBe('king')
  })

  it('promotes nodes piece to king on reaching row 7', () => {
    const board = emptyBoard()
    board[6][3] = { player: 'nodes', type: 'normal' }
    const newBoard = applyMove(board, {
      from: { row: 6, col: 3 },
      to: { row: 7, col: 4 },
      captures: [],
      isJump: false,
    })
    expect(newBoard[7][4]?.type).toBe('king')
  })

  it('does not mutate the original board', () => {
    const board = emptyBoard()
    board[4][3] = { player: 'pods', type: 'normal' }
    applyMove(board, { from: { row: 4, col: 3 }, to: { row: 3, col: 4 }, captures: [], isJump: false })
    expect(board[4][3]).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getChainJumps
// ---------------------------------------------------------------------------

describe('getChainJumps', () => {
  it('returns [] when no further jumps are available', () => {
    const board = emptyBoard()
    board[2][5] = { player: 'pods', type: 'normal' }
    expect(getChainJumps(board, { row: 2, col: 5 })).toEqual([])
  })

  it('returns jump moves when a chain jump is available', () => {
    const board = emptyBoard()
    board[4][3] = { player: 'pods', type: 'normal' }
    board[3][4] = { player: 'nodes', type: 'normal' }
    // row 2 col 5 empty → chain jump exists
    const chains = getChainJumps(board, { row: 4, col: 3 })
    expect(chains.every(m => m.isJump)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// evaluateBoard
// ---------------------------------------------------------------------------

describe('evaluateBoard', () => {
  it('returns a large positive value when pods are wiped out (AI wins)', () => {
    const board = emptyBoard()
    // Only nodes pieces remain — AI wins
    board[0][1] = { player: 'nodes', type: 'normal' }
    expect(evaluateBoard(board)).toBeGreaterThan(900)
  })

  it('returns a large negative value when nodes are wiped out (player wins)', () => {
    const board = emptyBoard()
    // Only pods pieces remain — player wins
    board[7][0] = { player: 'pods', type: 'normal' }
    expect(evaluateBoard(board)).toBeLessThan(-900)
  })

  it('returns a higher score when nodes outnumber pods (material advantage)', () => {
    const boardAdvantage = emptyBoard()
    boardAdvantage[0][1] = { player: 'nodes', type: 'normal' }
    boardAdvantage[0][3] = { player: 'nodes', type: 'normal' }
    boardAdvantage[7][0] = { player: 'pods', type: 'normal' }

    const boardEven = emptyBoard()
    boardEven[0][1] = { player: 'nodes', type: 'normal' }
    boardEven[7][0] = { player: 'pods', type: 'normal' }

    expect(evaluateBoard(boardAdvantage)).toBeGreaterThan(evaluateBoard(boardEven))
  })
})

// ---------------------------------------------------------------------------
// loadGameState / saveGameState
// ---------------------------------------------------------------------------

describe('loadGameState', () => {
  beforeEach(() => {
    mockSafeGet.mockReset()
    mockSafeSetJSON.mockReset()
  })

  it('returns null when nothing is stored', () => {
    mockSafeGet.mockReturnValue(null)
    expect(loadGameState()).toBeNull()
  })

  it('returns null and does not throw on corrupt JSON', () => {
    mockSafeGet.mockReturnValue('not-valid-json!!!')
    expect(() => loadGameState()).not.toThrow()
    expect(loadGameState()).toBeNull()
  })

  it('reads from the correct storage key', () => {
    mockSafeGet.mockReturnValue(null)
    loadGameState()
    expect(mockSafeGet).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('parses and returns a valid saved state', () => {
    const state: SavedGameState = {
      board: createInitialBoard(),
      currentPlayer: 'pods',
      difficulty: 'medium',
      moveCount: 3,
      gameOver: null,
    }
    mockSafeGet.mockReturnValue(JSON.stringify(state))
    const loaded = loadGameState()
    expect(loaded).not.toBeNull()
    expect(loaded!.currentPlayer).toBe('pods')
    expect(loaded!.difficulty).toBe('medium')
    expect(loaded!.moveCount).toBe(3)
    expect(loaded!.gameOver).toBeNull()
  })
})

describe('saveGameState', () => {
  beforeEach(() => {
    mockSafeGet.mockReset()
    mockSafeSetJSON.mockReset()
  })

  it('calls safeSetJSON with the correct key', () => {
    const state: SavedGameState = {
      board: createInitialBoard(),
      currentPlayer: 'nodes',
      difficulty: 'hard',
      moveCount: 0,
      gameOver: null,
    }
    saveGameState(state)
    expect(mockSafeSetJSON).toHaveBeenCalledWith(STORAGE_KEY, state)
  })

  it('round-trips board and metadata through save → load', () => {
    const state: SavedGameState = {
      board: createInitialBoard(),
      currentPlayer: 'pods',
      difficulty: 'easy',
      moveCount: 7,
      gameOver: 'pods',
    }
    // Capture what saveGameState writes, then feed it to loadGameState
    mockSafeSetJSON.mockImplementation((_key: string, value: unknown) => {
      mockSafeGet.mockReturnValue(JSON.stringify(value))
    })
    saveGameState(state)
    const loaded = loadGameState()
    expect(loaded).not.toBeNull()
    expect(loaded!.moveCount).toBe(7)
    expect(loaded!.gameOver).toBe('pods')
  })
})
