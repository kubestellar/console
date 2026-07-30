import React from 'react'
import { describe, it, expect } from 'vitest'
import {
  createBoard,
  rotateShape,
  isValidPosition,
  placePiece,
  clearLines,
  calculateScore,
} from '../containerTetrisHelpers'

describe('ContainerTetris Helpers', () => {
  describe('createBoard', () => {
    it('returns a 2D array of specified dimensions', () => {
      const rows = 20
      const cols = 10
      const board = createBoard(rows, cols)
      
      expect(board).toHaveLength(rows)
      expect(board[0]).toHaveLength(cols)
    })

    it('initializes all cells to null', () => {
      const board = createBoard(2, 2)
      expect(board).toEqual([
        [null, null],
        [null, null]
      ])
    })

    it('returns [] gracefully if rows <= 0 or cols <= 0', () => {
      expect(createBoard(0, 10)).toEqual([])
      expect(createBoard(-1, 10)).toEqual([])
      expect(createBoard(10, 0)).toEqual([])
      expect(createBoard(10, -1)).toEqual([])
    })
  })

  describe('rotateShape', () => {
    it('rotates a 2x3 matrix 90 degrees clockwise', () => {
      const shape = [
        [1, 1, 1],
        [0, 1, 0]
      ]
      const expected = [
        [0, 1],
        [1, 1],
        [0, 1]
      ]
      expect(rotateShape(shape)).toEqual(expected)
    })

    it('returns the same shape after 4 rotations', () => {
      const shape = [
        [1, 1, 0],
        [0, 1, 1]
      ]
      let rotated = shape
      for (let i = 0; i < 4; i++) {
        rotated = rotateShape(rotated)
      }
      expect(rotated).toEqual(shape)
    })

    it('rotates a single-cell shape correctly', () => {
      const shape = [[1]]
      expect(rotateShape(shape)).toEqual([[1]])
    })
  })

  describe('isValidPosition', () => {
    const board = createBoard(10, 10)
    const shape = [
      [1, 1],
      [1, 1]
    ]

    it('returns true when shape is within bounds and on empty cells', () => {
      expect(isValidPosition(board, shape, 0, 0)).toBe(true)
      expect(isValidPosition(board, shape, 8, 8)).toBe(true)
    })

    it('returns false when shape exceeds right boundary', () => {
      expect(isValidPosition(board, shape, 9, 0)).toBe(false)
    })

    it('returns false when shape exceeds left boundary', () => {
      expect(isValidPosition(board, shape, -1, 0)).toBe(false)
    })

    it('returns false when shape exceeds bottom boundary', () => {
      expect(isValidPosition(board, shape, 0, 9)).toBe(false)
    })

    it('returns false when shape overlaps an occupied cell', () => {
      const occupiedBoard = createBoard(10, 10)
      occupiedBoard[5][5] = 'bg-blue-500'
      
      // Overlaps (5,5)
      expect(isValidPosition(occupiedBoard, shape, 4, 4)).toBe(false)
      expect(isValidPosition(occupiedBoard, shape, 5, 5)).toBe(false)
      expect(isValidPosition(occupiedBoard, shape, 4, 5)).toBe(false)
      expect(isValidPosition(occupiedBoard, shape, 5, 4)).toBe(false)
      
      // Does not overlap
      expect(isValidPosition(occupiedBoard, shape, 0, 0)).toBe(true)
    })
  })

  describe('placePiece', () => {
    it('returns a new board without mutating the original', () => {
      const board = createBoard(4, 4)
      const shape = [[1]]
      const newBoard = placePiece(board, shape, 0, 0, 'test-color')
      
      expect(newBoard).not.toBe(board)
      expect(board[0][0]).toBeNull()
      expect(newBoard[0][0]).toBe('test-color')
    })

    it('sets cells occupied by shape to the pieceId color', () => {
      const board = createBoard(4, 4)
      const shape = [
        [1, 1],
        [1, 0]
      ]
      const color = 'bg-red-500'
      const newBoard = placePiece(board, shape, 1, 1, color)
      
      expect(newBoard[1][1]).toBe(color)
      expect(newBoard[1][2]).toBe(color)
      expect(newBoard[2][1]).toBe(color)
      expect(newBoard[2][2]).toBeNull()
    })
  })

  describe('clearLines', () => {
    it('removes fully-filled rows and prepends empty rows', () => {
      const board = [
        [null, null],
        ['color', 'color'], // Full
        [null, 'color'],
        ['color', 'color']  // Full
      ]
      const { board: newBoard, linesCleared } = clearLines(board)
      
      expect(linesCleared).toBe(2)
      expect(newBoard).toEqual([
        [null, null],
        [null, null],
        [null, null],
        [null, 'color']
      ])
    })

    it('does not remove partially-filled rows', () => {
      const board = [
        [null, 'color'],
        ['color', null]
      ]
      const { board: newBoard, linesCleared } = clearLines(board)
      
      expect(linesCleared).toBe(0)
      expect(newBoard).toEqual(board)
    })
  })

  describe('calculateScore', () => {
    it('returns 0 if 0 lines are cleared', () => {
      expect(calculateScore(0, 1)).toBe(0)
      expect(calculateScore(0, 5)).toBe(0)
    })

    it('returns correct base score for level 1', () => {
      expect(calculateScore(1, 1)).toBe(100)
      expect(calculateScore(2, 1)).toBe(300)
      expect(calculateScore(3, 1)).toBe(500)
      expect(calculateScore(4, 1)).toBe(800)
    })

    it('multiplies score by level', () => {
      expect(calculateScore(1, 2)).toBe(200)
      expect(calculateScore(4, 3)).toBe(2400)
    })
  })
})
