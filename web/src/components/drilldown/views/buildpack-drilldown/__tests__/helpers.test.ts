import { describe, expect, it } from 'vitest'

import {
  TABS,
  getBuildStatusLabel,
  getStatusStyle,
  mapConditionToBuildpackStatus,
  sortBuildsByNewest,
} from '../helpers'
import type { BuildpackStatus, KpackBuild, KpackCondition } from '../types'

describe('getStatusStyle', () => {
  it('returns green for succeeded', () => {
    expect(getStatusStyle('succeeded').bg).toContain('green')
  })
  it('returns blue for building', () => {
    expect(getStatusStyle('building').bg).toContain('blue')
  })
  it('returns red for failed', () => {
    expect(getStatusStyle('failed').bg).toContain('red')
  })
  it('returns orange for unknown', () => {
    expect(getStatusStyle('unknown').bg).toContain('orange')
  })
  it('falls back to orange for out-of-range values (default branch)', () => {
    expect(getStatusStyle('nonsense' as unknown as BuildpackStatus).bg).toContain('orange')
  })
})

describe('mapConditionToBuildpackStatus', () => {
  it('maps undefined condition → unknown', () => {
    expect(mapConditionToBuildpackStatus(undefined)).toBe('unknown')
  })
  it('maps True → succeeded', () => {
    expect(mapConditionToBuildpackStatus({ status: 'True' } as KpackCondition)).toBe('succeeded')
  })
  it('maps False → failed', () => {
    expect(mapConditionToBuildpackStatus({ status: 'False' } as KpackCondition)).toBe('failed')
  })
  it('maps Unknown → building', () => {
    expect(mapConditionToBuildpackStatus({ status: 'Unknown' } as KpackCondition)).toBe('building')
  })
  it('maps unrecognized status → building (default branch)', () => {
    expect(mapConditionToBuildpackStatus({ status: 'huh?' } as unknown as KpackCondition)).toBe('building')
  })
})

describe('sortBuildsByNewest', () => {
  const mk = (ts: string): KpackBuild => ({ metadata: { creationTimestamp: ts } } as KpackBuild)

  it('sorts newest first', () => {
    const oldest = mk('2026-01-01T00:00:00Z')
    const middle = mk('2026-01-02T00:00:00Z')
    const newest = mk('2026-01-03T00:00:00Z')
    expect(sortBuildsByNewest([oldest, newest, middle])).toEqual([newest, middle, oldest])
  })

  it('does not mutate the input array', () => {
    const a = mk('2026-01-01T00:00:00Z')
    const b = mk('2026-02-01T00:00:00Z')
    const input = [a, b]
    sortBuildsByNewest(input)
    expect(input).toEqual([a, b])
  })

  it('returns an empty array unchanged', () => {
    expect(sortBuildsByNewest([])).toEqual([])
  })

  it('preserves order for a single-element array', () => {
    const only = mk('2026-01-01T00:00:00Z')
    expect(sortBuildsByNewest([only])).toEqual([only])
  })
})

describe('getBuildStatusLabel', () => {
  it('returns Success for succeeded', () => {
    expect(getBuildStatusLabel('succeeded')).toBe('Success')
  })
  it('returns Failed for failed', () => {
    expect(getBuildStatusLabel('failed')).toBe('Failed')
  })
  it('returns Building for building', () => {
    expect(getBuildStatusLabel('building')).toBe('Building')
  })
  it('returns Building for unknown (default branch)', () => {
    expect(getBuildStatusLabel('unknown')).toBe('Building')
  })
})

describe('TABS', () => {
  it('exposes the five expected tabs in order', () => {
    expect(TABS.map((t) => t.id)).toEqual(['overview', 'yaml', 'builds', 'logs', 'ai'])
  })

  it('every tab has a label and an icon component', () => {
    for (const tab of TABS) {
      expect(typeof tab.label).toBe('string')
      expect(tab.label.length).toBeGreaterThan(0)
      // Lucide icons are forwardRef objects, not raw functions.
      expect(tab.icon).toBeDefined()
      expect(['object', 'function']).toContain(typeof tab.icon)
    }
  })
})
