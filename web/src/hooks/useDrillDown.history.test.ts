import { describe, it, expect, afterEach } from 'vitest'
import {
  DRILLDOWN_HISTORY_STATE_KEY,
  MAX_DRILLDOWN_HISTORY_ENTRIES,
  canUseBrowserHistory,
  getCurrentBrowserHistoryState,
  getDrillDownHistoryEntryId,
} from './useDrillDown.history'

describe('useDrillDown.history constants', () => {
  it('exports the expected history state key', () => {
    expect(DRILLDOWN_HISTORY_STATE_KEY).toBe('__kscDrillDownHistoryId')
  })

  it('exports the expected max entries cap', () => {
    expect(MAX_DRILLDOWN_HISTORY_ENTRIES).toBe(100)
  })
})

describe('canUseBrowserHistory', () => {
  it('returns true when window.history is available (jsdom)', () => {
    expect(canUseBrowserHistory()).toBe(true)
  })

  it('returns false when window is undefined', () => {
    const originalWindow = globalThis.window
    // @ts-expect-error - simulate SSR environment
    delete globalThis.window
    try {
      expect(canUseBrowserHistory()).toBe(false)
    } finally {
      globalThis.window = originalWindow
    }
  })
})

describe('getCurrentBrowserHistoryState', () => {
  afterEach(() => {
    // Reset history state between tests
    window.history.replaceState({}, '', window.location.href)
  })

  it('returns empty object when browser history is unavailable', () => {
    const originalWindow = globalThis.window
    // @ts-expect-error - simulate SSR environment
    delete globalThis.window
    try {
      expect(getCurrentBrowserHistoryState()).toEqual({})
    } finally {
      globalThis.window = originalWindow
    }
  })

  it('returns empty object when history.state is null', () => {
    window.history.replaceState(null, '', window.location.href)
    expect(getCurrentBrowserHistoryState()).toEqual({})
  })

  it('returns empty object when history.state is not an object', () => {
    // jsdom permits non-object values on history.state via replaceState
    window.history.replaceState('string-state' as unknown as object, '', window.location.href)
    expect(getCurrentBrowserHistoryState()).toEqual({})
  })

  it('returns the current history state object when present', () => {
    const state = { foo: 'bar', [DRILLDOWN_HISTORY_STATE_KEY]: 42 }
    window.history.replaceState(state, '', window.location.href)
    const result = getCurrentBrowserHistoryState()
    expect(result.foo).toBe('bar')
    expect(result[DRILLDOWN_HISTORY_STATE_KEY]).toBe(42)
  })
})

describe('getDrillDownHistoryEntryId', () => {
  it('returns null for null', () => {
    expect(getDrillDownHistoryEntryId(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(getDrillDownHistoryEntryId(undefined)).toBeNull()
  })

  it('returns null for non-object primitives', () => {
    expect(getDrillDownHistoryEntryId('str')).toBeNull()
    expect(getDrillDownHistoryEntryId(123)).toBeNull()
    expect(getDrillDownHistoryEntryId(true)).toBeNull()
  })

  it('returns null when the history key is missing', () => {
    expect(getDrillDownHistoryEntryId({ other: 'value' })).toBeNull()
  })

  it('returns null when the history key is not a number', () => {
    expect(getDrillDownHistoryEntryId({ [DRILLDOWN_HISTORY_STATE_KEY]: '5' })).toBeNull()
    expect(getDrillDownHistoryEntryId({ [DRILLDOWN_HISTORY_STATE_KEY]: null })).toBeNull()
  })

  it('returns the entry id when the history key is a number', () => {
    expect(getDrillDownHistoryEntryId({ [DRILLDOWN_HISTORY_STATE_KEY]: 0 })).toBe(0)
    expect(getDrillDownHistoryEntryId({ [DRILLDOWN_HISTORY_STATE_KEY]: 7 })).toBe(7)
    expect(getDrillDownHistoryEntryId({ [DRILLDOWN_HISTORY_STATE_KEY]: -3 })).toBe(-3)
  })
})
