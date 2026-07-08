import { describe, it, expect } from 'vitest'
import {
  ROWS,
  COLS,
  createBoard,
  rotateShape,
  isValidPosition,
  placePiece,
  clearLines,
  calculateScore,
} from '../containerTetrisHelpers'
import type { Board } from '../containerTetrisHelpers'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('ROWS is 20', () => {
    expect(ROWS).toBe(20)
  })

  it('COLS is 10', () => {
    expect(COLS).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// createBoard
// ---------------------------------------------------------------------------

describe('createBoard', () => {
  it('creates a board with correct dimensions', () => {
    const board = createBoard(5, 3)
    expect(board).toHaveLength(5)
    expect(board[0]).toHaveLength(3)
  })

  it('fills all cells with null', () => {
    const board = createBoard(3, 4)
    for (const row of board) {
      for (const cell of row) {
        expect(cell).toBeNull()
      }
    }
  })

  it('returns empty array when rows is 0', () => {
    expect(createBoard(0, 5)).toEqual([])
  })

  it('returns empty array when cols is 0', () => {
    expect(createBoard(5, 0)).toEqual([])
  })

  it('returns empty array for negative rows', () => {
    expect(createBoard(-1, 5)).toEqual([])
  })

  it('returns empty array for negative cols', () => {
    expect(createBoard(5, -1)).toEqual([])
  })

  it('creates a 1x1 board', () => {
    const board = createBoard(1, 1)
    expect(board).toEqual([[null]])
  })

  it('rows are independent (not shared references)', () => {
    const board = createBoard(3, 3)
    board[0][0] = 'X'
    expect(board[1][0]).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// rotateShape
// ---------------------------------------------------------------------------

describe('rotateShape', () => {
  it('rotates a 2x2 square (no visible change)', () => {
    const square = [
      [1, 1],
      [1, 1],
    ]
    expect(rotateShape(square)).toEqual([
      [1, 1],
      [1, 1],
    ])
  })

  it('rotates an I-piece (horizontal to vertical)', () => {
    const horizontal = [[1, 1, 1, 1]]
    const rotated = rotateShape(horizontal)
    expect(rotated).toEqual([[1], [1], [1], [1]])
  })

  it('rotates an I-piece (vertical to horizontal)', () => {
    const vertical = [[1], [1], [1], [1]]
    const rotated = rotateShape(vertical)
    expect(rotated).toEqual([[1, 1, 1, 1]])
  })

  it('rotates an L-piece clockwise', () => {
    const lShape = [
      [1, 0],
      [1, 0],
      [1, 1],
    ]
    const rotated = rotateShape(lShape)
    expect(rotated).toEqual([
      [1, 1, 1],
      [1, 0, 0],
    ])
  })

  it('rotates a T-piece clockwise', () => {
    const tShape = [
      [0, 1, 0],
      [1, 1, 1],
    ]
    const rotated = rotateShape(tShape)
    expect(rotated).toEqual([
      [1, 0],
      [1, 1],
      [1, 0],
    ])
  })

  it('four rotations return to original shape', () => {
    const shape = [
      [1, 0],
      [1, 1],
      [0, 1],
    ]
    let current = shape
    for (let i = 0; i < 4; i++) {
      current = rotateShape(current)
    }
    expect(current).toEqual(shape)
  })

  it('rotates a 1x1 shape', () => {
    expect(rotateShape([[1]])).toEqual([[1]])
  })
})

// ---------------------------------------------------------------------------
// isValidPosition
// ---------------------------------------------------------------------------

describe('isValidPosition', () => {
  const emptyBoard: Board = createBoard(5, 5)

  it('returns true for a valid position in empty board', () => {
    const shape = [[1, 1]]
    expect(isValidPosition(emptyBoard, shape, 0, 0)).toBe(true)
  })

  it('returns false when piece extends past right edge', () => {
    const shape = [[1, 1, 1]]
    expect(isValidPosition(emptyBoard, shape, 4, 0)).toBe(false)
  })

  it('returns false when piece extends past left edge', () => {
    const shape = [[1, 1]]
    expect(isValidPosition(emptyBoard, shape, -1, 0)).toBe(false)
  })

  it('returns false when piece extends past bottom edge', () => {
    const shape = [[1], [1]]
    expect(isValidPosition(emptyBoard, shape, 0, 4)).toBe(false)
  })

  it('allows piece above the board (negative y)', () => {
    const shape = [[1], [1]]
    expect(isValidPosition(emptyBoard, shape, 0, -1)).toBe(true)
  })

  it('returns false when colliding with existing piece', () => {
    const board = createBoard(5, 5)
    board[2][2] = 'X'
    const shape = [[1]]
    expect(isValidPosition(board, shape, 2, 2)).toBe(false)
  })

  it('returns true when shape zeros overlap occupied cells', () => {
    const board = createBoard(5, 5)
    board[0][1] = 'X'
    const shape = [[1, 0]]
    expect(isValidPosition(board, shape, 0, 0)).toBe(true)
  })

  it('handles T-piece with gaps next to occupied cells', () => {
    const board = createBoard(5, 5)
    board[1][0] = 'X'
    const tShape = [
      [0, 1, 0],
      [1, 1, 1],
    ]
    // Placing at (0,0) — the [1][0] position of shape is (0,1) on board which is 'X'
    expect(isValidPosition(board, tShape, 0, 0)).toBe(false)
  })

  it('returns true at exact bottom-right corner fit', () => {
    const board = createBoard(5, 5)
    const shape = [[1]]
    expect(isValidPosition(board, shape, 4, 4)).toBe(true)
  })

  it('returns false one past bottom-right', () => {
    const board = createBoard(5, 5)
    const shape = [[1]]
    expect(isValidPosition(board, shape, 5, 4)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// placePiece
// ---------------------------------------------------------------------------

describe('placePiece', () => {
  it('places a single cell piece on the board', () => {
    const board = createBoard(5, 5)
    const result = placePiece(board, [[1]], 2, 3, 'A')
    expect(result[3][2]).toBe('A')
  })

  it('does not mutate the original board', () => {
    const board = createBoard(5, 5)
    placePiece(board, [[1]], 0, 0, 'B')
    expect(board[0][0]).toBeNull()
  })

  it('places a 2x2 piece correctly', () => {
    const board = createBoard(5, 5)
    const shape = [
      [1, 1],
      [1, 1],
    ]
    const result = placePiece(board, shape, 1, 1, 'O')
    expect(result[1][1]).toBe('O')
    expect(result[1][2]).toBe('O')
    expect(result[2][1]).toBe('O')
    expect(result[2][2]).toBe('O')
  })

  it('only places cells where shape has 1', () => {
    const board = createBoard(5, 5)
    const shape = [
      [1, 0],
      [1, 1],
    ]
    const result = placePiece(board, shape, 0, 0, 'L')
    expect(result[0][0]).toBe('L')
    expect(result[0][1]).toBeNull()
    expect(result[1][0]).toBe('L')
    expect(result[1][1]).toBe('L')
  })

  it('ignores cells placed above the board (negative y)', () => {
    const board = createBoard(5, 5)
    const shape = [[1], [1]]
    const result = placePiece(board, shape, 0, -1, 'I')
    // y=-1 + r=0 => row -1, out of bounds, skipped
    expect(result[0][0]).toBe('I') // y=-1 + r=1 => row 0
  })

  it('ignores cells placed out of bounds horizontally', () => {
    const board = createBoard(3, 3)
    const shape = [[1, 1, 1, 1]]
    const result = placePiece(board, shape, 1, 0, 'W')
    expect(result[0][1]).toBe('W')
    expect(result[0][2]).toBe('W')
    // Cols 3 and 4 are out of bounds — should not crash
  })

  it('preserves existing pieces on the board', () => {
    const board = createBoard(5, 5)
    board[4][4] = 'Z'
    const result = placePiece(board, [[1]], 0, 0, 'A')
    expect(result[4][4]).toBe('Z')
    expect(result[0][0]).toBe('A')
  })
})

// ---------------------------------------------------------------------------
// clearLines
// ---------------------------------------------------------------------------

describe('clearLines', () => {
  it('returns 0 lines cleared when no rows are full', () => {
    const board = createBoard(4, 3)
    board[3][0] = 'X'
    const result = clearLines(board)
    expect(result.linesCleared).toBe(0)
    expect(result.board).toHaveLength(4)
  })

  it('clears a single full row', () => {
    const board = createBoard(4, 3)
    board[3] = ['X', 'X', 'X']
    const result = clearLines(board)
    expect(result.linesCleared).toBe(1)
    // New top row should be empty
    expect(result.board[0]).toEqual([null, null, null])
  })

  it('clears multiple full rows', () => {
    const board = createBoard(4, 3)
    board[2] = ['A', 'B', 'C']
    board[3] = ['D', 'E', 'F']
    const result = clearLines(board)
    expect(result.linesCleared).toBe(2)
    expect(result.board[0]).toEqual([null, null, null])
    expect(result.board[1]).toEqual([null, null, null])
  })

  it('preserves non-full rows above cleared rows', () => {
    const board = createBoard(4, 3)
    board[0][1] = 'P'
    board[3] = ['X', 'X', 'X']
    const result = clearLines(board)
    // Row with 'P' should shift down by 1
    expect(result.linesCleared).toBe(1)
    expect(result.board[1][1]).toBe('P')
  })

  it('preserves board dimensions after clearing', () => {
    const board = createBoard(6, 4)
    board[5] = ['A', 'B', 'C', 'D']
    const result = clearLines(board)
    expect(result.board).toHaveLength(6)
    expect(result.board[0]).toHaveLength(4)
  })

  it('returns empty board when all rows are full', () => {
    const board: Board = Array(3).fill(null).map(() => ['X', 'Y', 'Z'])
    const result = clearLines(board)
    expect(result.linesCleared).toBe(3)
    for (const row of result.board) {
      for (const cell of row) {
        expect(cell).toBeNull()
      }
    }
  })

  it('a row with any null cell is not cleared', () => {
    const board = createBoard(3, 3)
    board[2] = ['X', null, 'X']
    const result = clearLines(board)
    expect(result.linesCleared).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// calculateScore
// ---------------------------------------------------------------------------

describe('calculateScore', () => {
  it('returns 0 for 0 lines', () => {
    expect(calculateScore(0, 1)).toBe(0)
  })

  it('returns 100 * level for 1 line', () => {
    expect(calculateScore(1, 1)).toBe(100)
    expect(calculateScore(1, 5)).toBe(500)
  })

  it('returns 300 * level for 2 lines', () => {
    expect(calculateScore(2, 1)).toBe(300)
    expect(calculateScore(2, 3)).toBe(900)
  })

  it('returns 500 * level for 3 lines', () => {
    expect(calculateScore(3, 1)).toBe(500)
    expect(calculateScore(3, 2)).toBe(1000)
  })

  it('returns 800 * level for 4 lines (tetris)', () => {
    expect(calculateScore(4, 1)).toBe(800)
    expect(calculateScore(4, 10)).toBe(8000)
  })

  it('returns 0 for lines > 4 (no defined score)', () => {
    expect(calculateScore(5, 1)).toBe(0)
    expect(calculateScore(10, 1)).toBe(0)
  })

  it('returns 0 for negative lines', () => {
    expect(calculateScore(-1, 1)).toBe(0)
  })
})
