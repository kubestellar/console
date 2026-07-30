import { describe, it, expect } from 'vitest'
import { getResponsiveGridCols } from '../gridUtils'

describe('getResponsiveGridCols', () => {
  it('returns 4-col layout for up to 4 items', () => {
    expect(getResponsiveGridCols(1)).toBe('grid-cols-2 md:grid-cols-4')
    expect(getResponsiveGridCols(4)).toBe('grid-cols-2 md:grid-cols-4')
  })

  it('returns 5-col layout for 5 items', () => {
    expect(getResponsiveGridCols(5)).toBe('grid-cols-2 md:grid-cols-5')
  })

  it('returns 6-col layout for 6 items', () => {
    expect(getResponsiveGridCols(6)).toBe('grid-cols-2 md:grid-cols-3 lg:grid-cols-6')
  })

  it('returns 8-col layout for 7-8 items', () => {
    expect(getResponsiveGridCols(7)).toBe('grid-cols-2 md:grid-cols-4 lg:grid-cols-8')
    expect(getResponsiveGridCols(8)).toBe('grid-cols-2 md:grid-cols-4 lg:grid-cols-8')
  })

  it('returns 10-col layout for 9+ items', () => {
    expect(getResponsiveGridCols(9)).toBe('grid-cols-2 md:grid-cols-5 lg:grid-cols-10')
    expect(getResponsiveGridCols(20)).toBe('grid-cols-2 md:grid-cols-5 lg:grid-cols-10')
  })

  it('all layouts start with grid-cols-2 for mobile', () => {
    for (const count of [1, 3, 5, 7, 10]) {
      expect(getResponsiveGridCols(count)).toContain('grid-cols-2')
    }
  })
})
