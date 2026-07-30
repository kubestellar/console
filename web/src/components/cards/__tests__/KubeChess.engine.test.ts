/**
 * Unit tests for KubeChess.engine.ts — pure chess logic.
 *
 * Covers: board setup, move generation, check/checkmate detection,
 * castling, en passant, promotion, position evaluation, minimax AI,
 * threefold repetition, and game result classification.
 */
import { describe, it, expect } from 'vitest'
import {
  AI_THINK_DELAY_MS,
  PIECE_SYMBOLS,
  STORAGE_KEY,
  STORAGE_KEY_STATS,
  positionKey,
  createInitialBoard,
  createInitialState,
  isValidSquare,
  isSquareAttackedBy,
  getPieceMoves,
  findKing,
  isInCheck,
  makeMove,
  getAllLegalMoves,
  getGameResult,
  evaluateBoard,
  minimax,
  findBestMove,
} from '../KubeChess.engine'
import type { Board, GameState, Color } from '../KubeChess.engine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an empty 8x8 board */
function emptyBoard(): Board {
  return Array(8).fill(null).map(() => Array(8).fill(null))
}

/** Minimal game state for testing */
function minimalState(board: Board, turn: Color = 'white', overrides?: Partial<GameState>): GameState {
  return {
    board,
    turn,
    moveHistory: [],
    castlingRights: { white: { kingside: false, queenside: false }, black: { kingside: false, queenside: false } },
    enPassantTarget: null,
    halfMoveClock: 0,
    fullMoveNumber: 1,
    positionHistory: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('KubeChess.engine constants', () => {
  it('exports AI_THINK_DELAY_MS as a positive number', () => {
    expect(AI_THINK_DELAY_MS).toBeGreaterThan(0)
  })

  it('exports PIECE_SYMBOLS for all piece types', () => {
    const types = ['K', 'Q', 'R', 'B', 'N', 'P'] as const
    for (const t of types) {
      expect(PIECE_SYMBOLS.white[t]).toBeDefined()
      expect(PIECE_SYMBOLS.black[t]).toBeDefined()
    }
  })

  it('exports storage keys', () => {
    expect(STORAGE_KEY).toBe('kube_chess_state')
    expect(STORAGE_KEY_STATS).toBe('kube_chess_stats')
  })
})

// ---------------------------------------------------------------------------
// createInitialBoard / createInitialState
// ---------------------------------------------------------------------------

describe('createInitialBoard', () => {
  it('returns an 8x8 board', () => {
    const board = createInitialBoard()
    expect(board).toHaveLength(8)
    board.forEach(row => expect(row).toHaveLength(8))
  })

  it('places white pieces on rows 6-7 and black on rows 0-1', () => {
    const board = createInitialBoard()
    // Black pawns on row 1
    for (let c = 0; c < 8; c++) {
      expect(board[1][c]).toEqual({ type: 'P', color: 'black' })
    }
    // White pawns on row 6
    for (let c = 0; c < 8; c++) {
      expect(board[6][c]).toEqual({ type: 'P', color: 'white' })
    }
    // Kings
    expect(board[0][4]).toEqual({ type: 'K', color: 'black' })
    expect(board[7][4]).toEqual({ type: 'K', color: 'white' })
  })

  it('has empty squares in the middle', () => {
    const board = createInitialBoard()
    for (let r = 2; r < 6; r++) {
      for (let c = 0; c < 8; c++) {
        expect(board[r][c]).toBeNull()
      }
    }
  })
})

describe('createInitialState', () => {
  it('starts with white to move', () => {
    expect(createInitialState().turn).toBe('white')
  })

  it('grants full castling rights', () => {
    const state = createInitialState()
    expect(state.castlingRights.white).toEqual({ kingside: true, queenside: true })
    expect(state.castlingRights.black).toEqual({ kingside: true, queenside: true })
  })

  it('initializes positionHistory with one entry', () => {
    const state = createInitialState()
    expect(state.positionHistory).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// isValidSquare
// ---------------------------------------------------------------------------

describe('isValidSquare', () => {
  it('returns true for all valid squares', () => {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        expect(isValidSquare(r, c)).toBe(true)
      }
    }
  })

  it('returns false for out-of-bounds', () => {
    expect(isValidSquare(-1, 0)).toBe(false)
    expect(isValidSquare(8, 0)).toBe(false)
    expect(isValidSquare(0, -1)).toBe(false)
    expect(isValidSquare(0, 8)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// findKing
// ---------------------------------------------------------------------------

describe('findKing', () => {
  it('finds white king at starting position', () => {
    const board = createInitialBoard()
    expect(findKing(board, 'white')).toEqual({ row: 7, col: 4 })
  })

  it('finds black king at starting position', () => {
    const board = createInitialBoard()
    expect(findKing(board, 'black')).toEqual({ row: 0, col: 4 })
  })

  it('returns null when king is absent', () => {
    const board = emptyBoard()
    expect(findKing(board, 'white')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getPieceMoves — knight
// ---------------------------------------------------------------------------

describe('getPieceMoves — knight', () => {
  it('generates 8 moves from center', () => {
    const board = emptyBoard()
    board[4][4] = { type: 'N', color: 'white' }
    const state = minimalState(board)
    const moves = getPieceMoves(board, 4, 4, state)
    expect(moves).toHaveLength(8)
  })

  it('generates 2 moves from corner', () => {
    const board = emptyBoard()
    board[0][0] = { type: 'N', color: 'white' }
    const state = minimalState(board)
    const moves = getPieceMoves(board, 0, 0, state)
    expect(moves).toHaveLength(2)
  })

  it('cannot capture friendly pieces', () => {
    const board = emptyBoard()
    board[4][4] = { type: 'N', color: 'white' }
    board[2][3] = { type: 'P', color: 'white' } // block one landing square
    const state = minimalState(board)
    const moves = getPieceMoves(board, 4, 4, state)
    expect(moves).toHaveLength(7)
  })
})

// ---------------------------------------------------------------------------
// getPieceMoves — pawn
// ---------------------------------------------------------------------------

describe('getPieceMoves — pawn', () => {
  it('white pawn on starting row can move 1 or 2 squares', () => {
    const board = emptyBoard()
    board[6][3] = { type: 'P', color: 'white' }
    const state = minimalState(board)
    const moves = getPieceMoves(board, 6, 3, state)
    expect(moves).toHaveLength(2)
    expect(moves).toContainEqual({ row: 5, col: 3 })
    expect(moves).toContainEqual({ row: 4, col: 3 })
  })

  it('pawn blocked by piece in front has no forward moves', () => {
    const board = emptyBoard()
    board[6][3] = { type: 'P', color: 'white' }
    board[5][3] = { type: 'P', color: 'black' }
    const state = minimalState(board)
    const moves = getPieceMoves(board, 6, 3, state)
    expect(moves).toHaveLength(0)
  })

  it('pawn captures diagonally', () => {
    const board = emptyBoard()
    board[4][4] = { type: 'P', color: 'white' }
    board[3][3] = { type: 'P', color: 'black' }
    board[3][5] = { type: 'P', color: 'black' }
    const state = minimalState(board)
    const moves = getPieceMoves(board, 4, 4, state)
    // 1 forward + 2 captures
    expect(moves).toHaveLength(3)
  })

  it('en passant capture', () => {
    const board = emptyBoard()
    board[3][4] = { type: 'P', color: 'white' }
    board[3][5] = { type: 'P', color: 'black' }
    const state = minimalState(board, 'white', {
      enPassantTarget: { row: 2, col: 5 },
    })
    const moves = getPieceMoves(board, 3, 4, state)
    expect(moves).toContainEqual({ row: 2, col: 5 })
  })
})

// ---------------------------------------------------------------------------
// getPieceMoves — sliding pieces
// ---------------------------------------------------------------------------

describe('getPieceMoves — rook', () => {
  it('rook on empty board has 14 moves', () => {
    const board = emptyBoard()
    board[4][4] = { type: 'R', color: 'white' }
    const state = minimalState(board)
    const moves = getPieceMoves(board, 4, 4, state)
    expect(moves).toHaveLength(14)
  })

  it('rook is blocked by friendly pieces', () => {
    const board = emptyBoard()
    board[4][4] = { type: 'R', color: 'white' }
    board[4][6] = { type: 'P', color: 'white' } // blocks rightward
    const state = minimalState(board)
    const moves = getPieceMoves(board, 4, 4, state)
    // right: only col 5 (blocked at 6) = 1
    // left: cols 3,2,1,0 = 4
    // up: rows 3,2,1,0 = 4
    // down: rows 5,6,7 = 3
    expect(moves).toHaveLength(12)
  })
})

describe('getPieceMoves — bishop', () => {
  it('bishop on empty board center has 13 moves', () => {
    const board = emptyBoard()
    board[4][4] = { type: 'B', color: 'white' }
    const state = minimalState(board)
    const moves = getPieceMoves(board, 4, 4, state)
    expect(moves).toHaveLength(13)
  })
})

// ---------------------------------------------------------------------------
// isSquareAttackedBy
// ---------------------------------------------------------------------------

describe('isSquareAttackedBy', () => {
  it('detects pawn attack', () => {
    const board = emptyBoard()
    board[5][3] = { type: 'P', color: 'white' }
    board[7][7] = { type: 'K', color: 'white' }
    const state = minimalState(board)
    // White pawn on (5,3) attacks (4,2) and (4,4)
    expect(isSquareAttackedBy(board, 4, 2, 'white', state)).toBe(true)
    expect(isSquareAttackedBy(board, 4, 4, 'white', state)).toBe(true)
    // Does not attack forward
    expect(isSquareAttackedBy(board, 4, 3, 'white', state)).toBe(false)
  })

  it('detects knight attack', () => {
    const board = emptyBoard()
    board[4][4] = { type: 'N', color: 'black' }
    board[0][0] = { type: 'K', color: 'black' }
    const state = minimalState(board, 'white')
    expect(isSquareAttackedBy(board, 2, 3, 'black', state)).toBe(true)
    expect(isSquareAttackedBy(board, 3, 3, 'black', state)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isInCheck
// ---------------------------------------------------------------------------

describe('isInCheck', () => {
  it('initial position is not in check', () => {
    const state = createInitialState()
    expect(isInCheck(state.board, 'white', state)).toBe(false)
    expect(isInCheck(state.board, 'black', state)).toBe(false)
  })

  it('detects check from a rook', () => {
    const board = emptyBoard()
    board[0][0] = { type: 'K', color: 'black' }
    board[0][7] = { type: 'R', color: 'white' }
    board[7][7] = { type: 'K', color: 'white' }
    const state = minimalState(board, 'black')
    expect(isInCheck(board, 'black', state)).toBe(true)
  })

  it('no check when line is blocked', () => {
    const board = emptyBoard()
    board[0][0] = { type: 'K', color: 'black' }
    board[0][3] = { type: 'P', color: 'black' } // blocks rook
    board[0][7] = { type: 'R', color: 'white' }
    board[7][7] = { type: 'K', color: 'white' }
    const state = minimalState(board, 'black')
    expect(isInCheck(board, 'black', state)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// makeMove
// ---------------------------------------------------------------------------

describe('makeMove', () => {
  it('moves piece and switches turn', () => {
    const state = createInitialState()
    const newState = makeMove(state, { row: 6, col: 4 }, { row: 4, col: 4 }) // e2-e4
    expect(newState.board[4][4]).toEqual({ type: 'P', color: 'white' })
    expect(newState.board[6][4]).toBeNull()
    expect(newState.turn).toBe('black')
  })

  it('sets en passant target on double pawn push', () => {
    const state = createInitialState()
    const newState = makeMove(state, { row: 6, col: 4 }, { row: 4, col: 4 })
    expect(newState.enPassantTarget).toEqual({ row: 5, col: 4 })
  })

  it('handles castling kingside', () => {
    const board = emptyBoard()
    board[7][4] = { type: 'K', color: 'white' }
    board[7][7] = { type: 'R', color: 'white' }
    board[0][4] = { type: 'K', color: 'black' }
    const state = minimalState(board, 'white', {
      castlingRights: { white: { kingside: true, queenside: false }, black: { kingside: false, queenside: false } },
    })
    const newState = makeMove(state, { row: 7, col: 4 }, { row: 7, col: 6 })
    expect(newState.board[7][6]).toEqual({ type: 'K', color: 'white' })
    expect(newState.board[7][5]).toEqual({ type: 'R', color: 'white' })
    expect(newState.board[7][7]).toBeNull()
    expect(newState.castlingRights.white).toEqual({ kingside: false, queenside: false })
  })

  it('handles en passant capture', () => {
    const board = emptyBoard()
    board[3][4] = { type: 'P', color: 'white' }
    board[3][5] = { type: 'P', color: 'black' }
    board[7][4] = { type: 'K', color: 'white' }
    board[0][4] = { type: 'K', color: 'black' }
    const state = minimalState(board, 'white', {
      enPassantTarget: { row: 2, col: 5 },
    })
    const newState = makeMove(state, { row: 3, col: 4 }, { row: 2, col: 5 })
    expect(newState.board[2][5]).toEqual({ type: 'P', color: 'white' })
    expect(newState.board[3][5]).toBeNull() // captured pawn removed
  })

  it('promotes pawn to queen by default', () => {
    const board = emptyBoard()
    board[1][0] = { type: 'P', color: 'white' }
    board[7][4] = { type: 'K', color: 'white' }
    board[0][4] = { type: 'K', color: 'black' }
    const state = minimalState(board, 'white')
    const newState = makeMove(state, { row: 1, col: 0 }, { row: 0, col: 0 })
    expect(newState.board[0][0]).toEqual({ type: 'Q', color: 'white' })
  })

  it('promotes pawn to specified piece', () => {
    const board = emptyBoard()
    board[1][0] = { type: 'P', color: 'white' }
    board[7][4] = { type: 'K', color: 'white' }
    board[0][4] = { type: 'K', color: 'black' }
    const state = minimalState(board, 'white')
    const newState = makeMove(state, { row: 1, col: 0 }, { row: 0, col: 0 }, 'N')
    expect(newState.board[0][0]).toEqual({ type: 'N', color: 'white' })
  })

  it('resets halfMoveClock on capture', () => {
    const board = emptyBoard()
    board[4][4] = { type: 'R', color: 'white' }
    board[4][7] = { type: 'P', color: 'black' }
    board[7][4] = { type: 'K', color: 'white' }
    board[0][4] = { type: 'K', color: 'black' }
    const state = minimalState(board, 'white', { halfMoveClock: 10 })
    const newState = makeMove(state, { row: 4, col: 4 }, { row: 4, col: 7 })
    expect(newState.halfMoveClock).toBe(0)
  })

  it('increments halfMoveClock on quiet move', () => {
    const board = emptyBoard()
    board[4][4] = { type: 'R', color: 'white' }
    board[7][4] = { type: 'K', color: 'white' }
    board[0][4] = { type: 'K', color: 'black' }
    const state = minimalState(board, 'white', { halfMoveClock: 5 })
    const newState = makeMove(state, { row: 4, col: 4 }, { row: 4, col: 5 })
    expect(newState.halfMoveClock).toBe(6)
  })

  it('trackHistory appends to positionHistory', () => {
    const state = createInitialState()
    const newState = makeMove(state, { row: 6, col: 4 }, { row: 4, col: 4 }, undefined, true)
    expect(newState.positionHistory.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// getAllLegalMoves
// ---------------------------------------------------------------------------

describe('getAllLegalMoves', () => {
  it('white has 20 legal moves at start', () => {
    const state = createInitialState()
    const moves = getAllLegalMoves(state, 'white')
    expect(moves).toHaveLength(20)
  })

  it('filters out moves that leave king in check', () => {
    // King on e1, enemy rook on e8 — king cannot move to e-file squares
    const board = emptyBoard()
    board[7][4] = { type: 'K', color: 'white' }
    board[0][4] = { type: 'R', color: 'black' }
    board[0][0] = { type: 'K', color: 'black' }
    const state = minimalState(board, 'white')
    const moves = getAllLegalMoves(state, 'white')
    // King has 5 adjacent squares but e-file ones are attacked
    const kMoves = moves.filter(m => m.from.row === 7 && m.from.col === 4)
    expect(kMoves.every(m => m.to.col !== 4)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getGameResult
// ---------------------------------------------------------------------------

describe('getGameResult', () => {
  it('initial position is ongoing', () => {
    const state = createInitialState()
    expect(getGameResult(state)).toBe('ongoing')
  })

  it('detects checkmate (fool mate)', () => {
    // Fool's mate: 1.f3 e5 2.g4 Qh4#
    let state = createInitialState()
    state = makeMove(state, { row: 6, col: 5 }, { row: 5, col: 5 }) // f3
    state = makeMove(state, { row: 1, col: 4 }, { row: 3, col: 4 }) // e5
    state = makeMove(state, { row: 6, col: 6 }, { row: 4, col: 6 }) // g4
    state = makeMove(state, { row: 0, col: 3 }, { row: 4, col: 7 }) // Qh4#
    expect(getGameResult(state)).toBe('checkmate')
  })

  it('detects stalemate', () => {
    // Minimal stalemate: black king on a8, white queen on b6, white king on c8
    const board = emptyBoard()
    board[0][0] = { type: 'K', color: 'black' }
    board[2][1] = { type: 'Q', color: 'white' }
    board[1][2] = { type: 'K', color: 'white' }
    const state = minimalState(board, 'black')
    expect(getGameResult(state)).toBe('stalemate')
  })

  it('detects threefold repetition', () => {
    const board = emptyBoard()
    board[7][4] = { type: 'K', color: 'white' }
    board[0][4] = { type: 'K', color: 'black' }
    const key = positionKey({
      board,
      turn: 'white',
      castlingRights: { white: { kingside: false, queenside: false }, black: { kingside: false, queenside: false } },
      enPassantTarget: null,
    })
    const state = minimalState(board, 'white', {
      positionHistory: [key, key, key],
    })
    expect(getGameResult(state)).toBe('repetition')
  })
})

// ---------------------------------------------------------------------------
// positionKey
// ---------------------------------------------------------------------------

describe('positionKey', () => {
  it('same position produces same key', () => {
    const state = createInitialState()
    const key1 = positionKey(state)
    const key2 = positionKey(state)
    expect(key1).toBe(key2)
  })

  it('different turn produces different key', () => {
    const board = createInitialBoard()
    const cr = { white: { kingside: true, queenside: true }, black: { kingside: true, queenside: true } }
    const k1 = positionKey({ board, turn: 'white', castlingRights: cr, enPassantTarget: null })
    const k2 = positionKey({ board, turn: 'black', castlingRights: cr, enPassantTarget: null })
    expect(k1).not.toBe(k2)
  })

  it('different castling rights produce different key', () => {
    const board = createInitialBoard()
    const k1 = positionKey({ board, turn: 'white', castlingRights: { white: { kingside: true, queenside: true }, black: { kingside: true, queenside: true } }, enPassantTarget: null })
    const k2 = positionKey({ board, turn: 'white', castlingRights: { white: { kingside: false, queenside: true }, black: { kingside: true, queenside: true } }, enPassantTarget: null })
    expect(k1).not.toBe(k2)
  })
})

// ---------------------------------------------------------------------------
// evaluateBoard
// ---------------------------------------------------------------------------

describe('evaluateBoard', () => {
  it('initial position is roughly equal (close to 0)', () => {
    const state = createInitialState()
    const score = evaluateBoard(state.board, state)
    expect(Math.abs(score)).toBeLessThan(50)
  })

  it('white advantage when black queen is missing', () => {
    const board = createInitialBoard()
    board[0][3] = null // remove black queen
    const state = minimalState(board, 'white', {
      castlingRights: { white: { kingside: true, queenside: true }, black: { kingside: true, queenside: true } },
    })
    expect(evaluateBoard(board, state)).toBeGreaterThan(800)
  })
})

// ---------------------------------------------------------------------------
// minimax
// ---------------------------------------------------------------------------

describe('minimax', () => {
  it('returns a numeric score at depth 0', () => {
    const state = createInitialState()
    const counter = { count: 0, deadline: performance.now() + 5000 }
    const score = minimax(state, 0, -Infinity, Infinity, true, counter)
    expect(typeof score).toBe('number')
  })

  it('respects position count limit', () => {
    const state = createInitialState()
    const counter = { count: 49999, deadline: performance.now() + 5000 }
    // Should bail immediately since count >= limit
    minimax(state, 3, -Infinity, Infinity, true, counter)
    expect(counter.count).toBe(50000)
  })
})

// ---------------------------------------------------------------------------
// findBestMove
// ---------------------------------------------------------------------------

describe('findBestMove', () => {
  it('returns a legal move from the starting position', () => {
    const state = createInitialState()
    const move = findBestMove(state, 2)
    expect(move).not.toBeNull()
    expect(move!.from).toBeDefined()
    expect(move!.to).toBeDefined()
    // Verify it's actually a legal move
    const legalMoves = getAllLegalMoves(state, 'white')
    expect(legalMoves).toContainEqual(move)
  })

  it('returns null when no legal moves exist (stalemate)', () => {
    const board = emptyBoard()
    board[0][0] = { type: 'K', color: 'black' }
    board[2][1] = { type: 'Q', color: 'white' }
    board[1][2] = { type: 'K', color: 'white' }
    const state = minimalState(board, 'black')
    expect(findBestMove(state, 2)).toBeNull()
  })

  it('captures a free piece when obvious', () => {
    // White rook can capture undefended black queen
    const board = emptyBoard()
    board[4][0] = { type: 'R', color: 'white' }
    board[4][7] = { type: 'Q', color: 'black' }
    board[7][4] = { type: 'K', color: 'white' }
    board[0][4] = { type: 'K', color: 'black' }
    const state = minimalState(board, 'white')
    const move = findBestMove(state, 3)
    expect(move).not.toBeNull()
    // Should capture the queen
    expect(move!.to).toEqual({ row: 4, col: 7 })
  })
})

// ---------------------------------------------------------------------------
// Castling via getPieceMoves
// ---------------------------------------------------------------------------

describe('castling move generation', () => {
  it('generates kingside castling when available', () => {
    const board = emptyBoard()
    board[7][4] = { type: 'K', color: 'white' }
    board[7][7] = { type: 'R', color: 'white' }
    board[0][4] = { type: 'K', color: 'black' }
    const state = minimalState(board, 'white', {
      castlingRights: { white: { kingside: true, queenside: false }, black: { kingside: false, queenside: false } },
    })
    const moves = getPieceMoves(board, 7, 4, state)
    expect(moves).toContainEqual({ row: 7, col: 6 })
  })

  it('does not generate castling when path is attacked', () => {
    const board = emptyBoard()
    board[7][4] = { type: 'K', color: 'white' }
    board[7][7] = { type: 'R', color: 'white' }
    board[0][5] = { type: 'R', color: 'black' } // attacks f1
    board[0][4] = { type: 'K', color: 'black' }
    const state = minimalState(board, 'white', {
      castlingRights: { white: { kingside: true, queenside: false }, black: { kingside: false, queenside: false } },
    })
    const moves = getPieceMoves(board, 7, 4, state)
    expect(moves).not.toContainEqual({ row: 7, col: 6 })
  })

  it('does not generate castling when in check', () => {
    const board = emptyBoard()
    board[7][4] = { type: 'K', color: 'white' }
    board[7][7] = { type: 'R', color: 'white' }
    board[0][4] = { type: 'R', color: 'black' } // gives check on e-file
    board[0][0] = { type: 'K', color: 'black' }
    const state = minimalState(board, 'white', {
      castlingRights: { white: { kingside: true, queenside: false }, black: { kingside: false, queenside: false } },
    })
    const moves = getPieceMoves(board, 7, 4, state)
    expect(moves).not.toContainEqual({ row: 7, col: 6 })
  })
})
