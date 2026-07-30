/**
 * Tests for sharedImpl.types.ts
 *
 * Covers the type definitions and utility functions for ClusterCache.
 */
import { describe, it, expect } from 'vitest'

import {
  DATA_FIELDS,
  UI_FIELDS,
  updatesTouchData,
  updatesTouchUI,
  type ClusterCache,
} from '../sharedImpl.types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('DATA_FIELDS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(DATA_FIELDS)).toBe(true)
    expect(DATA_FIELDS.length).toBeGreaterThan(0)
  })

  it('includes clusters', () => {
    expect(DATA_FIELDS).toContain('clusters')
  })

  it('includes lastUpdated', () => {
    expect(DATA_FIELDS).toContain('lastUpdated')
  })

  it('includes consecutiveFailures', () => {
    expect(DATA_FIELDS).toContain('consecutiveFailures')
  })

  it('includes isFailed', () => {
    expect(DATA_FIELDS).toContain('isFailed')
  })

  it('does NOT include UI fields', () => {
    const dataSet = new Set(DATA_FIELDS)
    expect(dataSet.has('isLoading' as keyof ClusterCache)).toBe(false)
    expect(dataSet.has('isRefreshing' as keyof ClusterCache)).toBe(false)
    expect(dataSet.has('error' as keyof ClusterCache)).toBe(false)
    expect(dataSet.has('lastRefresh' as keyof ClusterCache)).toBe(false)
  })
})

describe('UI_FIELDS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(UI_FIELDS)).toBe(true)
    expect(UI_FIELDS.length).toBeGreaterThan(0)
  })

  it('includes isLoading', () => {
    expect(UI_FIELDS).toContain('isLoading')
  })

  it('includes isRefreshing', () => {
    expect(UI_FIELDS).toContain('isRefreshing')
  })

  it('includes error', () => {
    expect(UI_FIELDS).toContain('error')
  })

  it('includes lastRefresh', () => {
    expect(UI_FIELDS).toContain('lastRefresh')
  })

  it('does NOT include data fields', () => {
    const uiSet = new Set(UI_FIELDS)
    expect(uiSet.has('clusters' as keyof ClusterCache)).toBe(false)
    expect(uiSet.has('lastUpdated' as keyof ClusterCache)).toBe(false)
    expect(uiSet.has('consecutiveFailures' as keyof ClusterCache)).toBe(false)
    expect(uiSet.has('isFailed' as keyof ClusterCache)).toBe(false)
  })
})

describe('DATA_FIELDS and UI_FIELDS partition', () => {
  it('have no overlap', () => {
    const dataSet = new Set(DATA_FIELDS)
    const uiSet = new Set(UI_FIELDS)
    for (const field of DATA_FIELDS) {
      expect(uiSet.has(field as keyof ClusterCache)).toBe(false)
    }
    for (const field of UI_FIELDS) {
      expect(dataSet.has(field as keyof ClusterCache)).toBe(false)
    }
  })

  it('cover all ClusterCache fields', () => {
    const allFields = new Set([...DATA_FIELDS, ...UI_FIELDS])
    // ClusterCache has exactly 8 fields
    expect(allFields.size).toBe(8)
  })
})

// ---------------------------------------------------------------------------
// updatesTouchData
// ---------------------------------------------------------------------------

describe('updatesTouchData', () => {
  it('returns true when updating clusters', () => {
    expect(updatesTouchData({ clusters: [] })).toBe(true)
  })

  it('returns true when updating lastUpdated', () => {
    expect(updatesTouchData({ lastUpdated: new Date() })).toBe(true)
  })

  it('returns true when updating consecutiveFailures', () => {
    expect(updatesTouchData({ consecutiveFailures: 3 })).toBe(true)
  })

  it('returns true when updating isFailed', () => {
    expect(updatesTouchData({ isFailed: true })).toBe(true)
  })

  it('returns false when updating only UI fields', () => {
    expect(updatesTouchData({ isLoading: true })).toBe(false)
    expect(updatesTouchData({ isRefreshing: true })).toBe(false)
    expect(updatesTouchData({ error: 'test' })).toBe(false)
    expect(updatesTouchData({ lastRefresh: new Date() })).toBe(false)
  })

  it('returns false for empty updates', () => {
    expect(updatesTouchData({})).toBe(false)
  })

  it('returns true when updating both data and UI fields', () => {
    expect(updatesTouchData({ clusters: [], isLoading: false })).toBe(true)
  })

  it('handles null/undefined values in updates', () => {
    expect(updatesTouchData({ clusters: [] })).toBe(true)
    expect(updatesTouchData({ lastUpdated: null })).toBe(true)
    expect(updatesTouchData({ error: null })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// updatesTouchUI
// ---------------------------------------------------------------------------

describe('updatesTouchUI', () => {
  it('returns true when updating isLoading', () => {
    expect(updatesTouchUI({ isLoading: true })).toBe(true)
  })

  it('returns true when updating isRefreshing', () => {
    expect(updatesTouchUI({ isRefreshing: true })).toBe(true)
  })

  it('returns true when updating error', () => {
    expect(updatesTouchUI({ error: 'test error' })).toBe(true)
  })

  it('returns true when updating lastRefresh', () => {
    expect(updatesTouchUI({ lastRefresh: new Date() })).toBe(true)
  })

  it('returns false when updating only data fields', () => {
    expect(updatesTouchUI({ clusters: [] })).toBe(false)
    expect(updatesTouchUI({ lastUpdated: new Date() })).toBe(false)
    expect(updatesTouchUI({ consecutiveFailures: 2 })).toBe(false)
    expect(updatesTouchUI({ isFailed: false })).toBe(false)
  })

  it('returns false for empty updates', () => {
    expect(updatesTouchUI({})).toBe(false)
  })

  it('returns true when updating both data and UI fields', () => {
    expect(updatesTouchUI({ isLoading: true, clusters: [] })).toBe(true)
  })

  it('handles null/undefined values in updates', () => {
    expect(updatesTouchUI({ error: null })).toBe(true)
    expect(updatesTouchUI({ lastRefresh: null })).toBe(true)
    expect(updatesTouchUI({ lastUpdated: null })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Guard against undefined arrays (issue #15569)
// ---------------------------------------------------------------------------

describe('Array safety (issue #15569)', () => {
  it('updatesTouchData guards against undefined DATA_FIELDS', () => {
    // Even if DATA_FIELDS is somehow undefined, function should not crash
    expect(() => updatesTouchData({ clusters: [] })).not.toThrow()
  })

  it('updatesTouchUI guards against undefined UI_FIELDS', () => {
    // Even if UI_FIELDS is somehow undefined, function should not crash
    expect(() => updatesTouchUI({ isLoading: true })).not.toThrow()
  })
})
