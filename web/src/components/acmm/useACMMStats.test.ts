import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseACMM = vi.fn()

vi.mock('./ACMMProvider', () => ({
  useACMM: () => mockUseACMM(),
}))

vi.mock('../../lib/acmm/sources', () => ({
  ALL_CRITERIA: [
    { id: 'acmm-1', source: 'acmm' },
    { id: 'acmm-2', source: 'acmm' },
    { id: 'fullsend-1', source: 'fullsend' },
    { id: 'aef-1', source: 'agentic-engineering-framework' },
    { id: 'reflect-1', source: 'claude-reflect' },
  ],
}))

vi.mock('../../lib/acmm/computeLevel', () => ({
  MAX_LEVEL: 6,
}))

import { useACMMStats } from './useACMMStats'

function mockScan(overrides: Partial<{ level: Record<string, unknown>; detectedIds: string[] | Set<string> }> = {}) {
  mockUseACMM.mockReturnValue({
    scan: {
      level: {
        level: 2,
        levelName: 'L2',
        detectedByLevel: { 3: 4 },
        requiredByLevel: { 3: 10 },
        ...(overrides.level || {}),
      },
      data: {
        detectedIds: overrides.detectedIds ?? ['acmm-1', 'fullsend-1'],
      },
    },
  })
}

describe('useACMMStats', () => {
  it('returns acmm_level stat with the current level, name, and L-formatted value', () => {
    mockScan()
    const { result } = renderHook(() => useACMMStats())
    const stat = result.current.getStatValue('acmm_level')
    expect(stat.value).toBe(2)
    expect(stat.sublabel).toBe('L2')
    expect(stat.max).toBe(6)
    expect(stat.format?.(2)).toBe('L2')
  })

  it('returns acmm_detected stat counting detected criteria out of total', () => {
    mockScan({ detectedIds: ['acmm-1', 'fullsend-1'] })
    const { result } = renderHook(() => useACMMStats())
    const stat = result.current.getStatValue('acmm_detected')
    expect(stat.value).toBe(2)
    expect(stat.sublabel).toBe('2 of 5 criteria')
    expect(stat.max).toBe(5)
  })

  it('deduplicates a detectedIds array via a Set for acmm_detected', () => {
    mockScan({ detectedIds: ['acmm-1', 'acmm-1', 'fullsend-1'] })
    const { result } = renderHook(() => useACMMStats())
    const stat = result.current.getStatValue('acmm_detected')
    expect(stat.value).toBe(2)
  })

  it('accepts detectedIds already provided as a Set', () => {
    mockScan({ detectedIds: new Set(['acmm-1', 'aef-1', 'reflect-1']) })
    const { result } = renderHook(() => useACMMStats())
    const stat = result.current.getStatValue('acmm_detected')
    expect(stat.value).toBe(3)
  })

  it('returns acmm_next_level stat describing remaining criteria for the next level', () => {
    mockScan({ level: { level: 2, levelName: 'L2', detectedByLevel: { 3: 4 }, requiredByLevel: { 3: 10 } } })
    const { result } = renderHook(() => useACMMStats())
    const stat = result.current.getStatValue('acmm_next_level')
    expect(stat.value).toBe(4)
    expect(stat.sublabel).toBe('6 more for L3')
    expect(stat.max).toBe(10)
  })

  it('returns the max-level-reached stat when already at MAX_LEVEL', () => {
    mockScan({ level: { level: 6, levelName: 'L6', detectedByLevel: {}, requiredByLevel: {} } })
    const { result } = renderHook(() => useACMMStats())
    const stat = result.current.getStatValue('acmm_next_level')
    expect(stat.value).toBe(6)
    expect(stat.sublabel).toBe('L6 reached')
    expect(stat.format?.(6)).toBe('L6')
  })

  it('returns acmm_by_source stat picking the best-performing source', () => {
    // acmm: 2 criteria, 1 detected -> 50%; fullsend: 1 criterion, 1 detected -> 100%
    mockScan({ detectedIds: ['acmm-1', 'fullsend-1'] })
    const { result } = renderHook(() => useACMMStats())
    const stat = result.current.getStatValue('acmm_by_source')
    expect(stat.value).toBe('100%')
    expect(stat.sublabel).toBe('Fullsend (4 sources)')
  })

  it('returns a placeholder for an unknown blockId', () => {
    mockScan()
    const { result } = renderHook(() => useACMMStats())
    expect(result.current.getStatValue('unknown_block')).toEqual({ value: '-' })
  })
})
