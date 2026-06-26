import { describe, expect, it } from 'vitest'
import {
  computeAvgDurationMin,
  formatDuration,
  getGuideMeta,
  MIN_RUNS_FOR_RATE,
  PLATFORM_COLORS,
  PLATFORM_ORDER,
  TREND_CHART_HEIGHT,
  TREND_CHART_WIDTH,
} from '../nightlyE2E.constants'
import type { NightlyGuideStatus, NightlyRun } from '../../../../lib/llmd/nightlyE2EDemoData'

describe('nightlyE2E.constants', () => {
  describe('PLATFORM_ORDER', () => {
    it('contains expected platforms in order', () => {
      expect(PLATFORM_ORDER).toEqual(['OCP', 'GKE', 'CKS'])
    })
  })

  describe('PLATFORM_COLORS', () => {
    it('has colors for all platforms', () => {
      expect(PLATFORM_COLORS.OCP).toBeDefined()
      expect(PLATFORM_COLORS.GKE).toBeDefined()
      expect(PLATFORM_COLORS.CKS).toBeDefined()
    })
  })

  describe('chart dimension constants', () => {
    it('has positive chart dimensions', () => {
      expect(TREND_CHART_WIDTH).toBeGreaterThan(0)
      expect(TREND_CHART_HEIGHT).toBeGreaterThan(0)
    })

    it('MIN_RUNS_FOR_RATE is 3', () => {
      expect(MIN_RUNS_FOR_RATE).toBe(3)
    })
  })

  describe('getGuideMeta', () => {
    it('extracts model, gpuType, gpuCount from guide', () => {
      const guide = {
        model: 'llama-3-70b',
        gpuType: 'H100',
        gpuCount: 4,
      } as unknown as NightlyGuideStatus

      const meta = getGuideMeta(guide)
      expect(meta.model).toBe('llama-3-70b')
      expect(meta.gpuType).toBe('H100')
      expect(meta.gpuCount).toBe(4)
    })

    it('returns defaults for missing fields', () => {
      const guide = {} as unknown as NightlyGuideStatus

      const meta = getGuideMeta(guide)
      expect(meta.model).toBe('Unknown')
      expect(meta.gpuType).toBe('Unknown')
      expect(meta.gpuCount).toBe(0)
    })

    it('handles partial data', () => {
      const guide = { model: 'mistral-7b' } as unknown as NightlyGuideStatus

      const meta = getGuideMeta(guide)
      expect(meta.model).toBe('mistral-7b')
      expect(meta.gpuType).toBe('Unknown')
      expect(meta.gpuCount).toBe(0)
    })
  })

  describe('computeAvgDurationMin', () => {
    it('returns null for empty array', () => {
      expect(computeAvgDurationMin([])).toBeNull()
    })

    it('returns null when no completed runs', () => {
      const runs: NightlyRun[] = [
        { status: 'failed', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:30:00Z' },
      ] as unknown as NightlyRun[]
      expect(computeAvgDurationMin(runs)).toBeNull()
    })

    it('calculates average duration in minutes for completed runs', () => {
      const runs: NightlyRun[] = [
        {
          status: 'completed',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T01:00:00Z',
        },
        {
          status: 'completed',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:30:00Z',
        },
      ] as unknown as NightlyRun[]

      const result = computeAvgDurationMin(runs)
      expect(result).toBe(45) // (60 + 30) / 2 = 45 minutes
    })

    it('ignores non-completed runs', () => {
      const runs: NightlyRun[] = [
        {
          status: 'completed',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T01:00:00Z',
        },
        {
          status: 'failed',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T02:00:00Z',
        },
      ] as unknown as NightlyRun[]

      const result = computeAvgDurationMin(runs)
      expect(result).toBe(60) // only the completed run counts
    })

    it('ignores completed runs without timestamps', () => {
      const runs: NightlyRun[] = [
        { status: 'completed', createdAt: null, updatedAt: null },
        {
          status: 'completed',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:20:00Z',
        },
      ] as unknown as NightlyRun[]

      const result = computeAvgDurationMin(runs)
      expect(result).toBe(20)
    })
  })

  describe('formatDuration', () => {
    it('formats minutes-only durations', () => {
      expect(formatDuration(45)).toBe('45m')
      expect(formatDuration(1)).toBe('1m')
      expect(formatDuration(59)).toBe('59m')
    })

    it('formats hours-only durations', () => {
      expect(formatDuration(60)).toBe('1h')
      expect(formatDuration(120)).toBe('2h')
    })

    it('formats hours and minutes', () => {
      expect(formatDuration(90)).toBe('1h 30m')
      expect(formatDuration(150)).toBe('2h 30m')
      expect(formatDuration(61)).toBe('1h 1m')
    })
  })
})
