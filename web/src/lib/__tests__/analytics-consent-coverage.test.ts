/**
 * Direct coverage tests for analytics-consent.ts
 *
 * Targets:
 * - setAnalyticsOptOut(true): sends opted_out event, sets localStorage,
 *   clears analytics identity keys, stops engagement, clears GA cookies
 * - setAnalyticsOptOut(false): sends opted_in event, sets localStorage
 * - isAnalyticsOptedOut(): delegates to isOptedOut()
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ──────────────────────────────────────────────────────────

let mockInitialized = true
let mockUserHasInteracted = true
let mockIsOptedOut = false

vi.mock('../analytics-core-state', () => ({
  get initialized() { return mockInitialized },
  get userHasInteracted() { return mockUserHasInteracted },
}))

const sentEvents: Array<{ name: string }> = []

vi.mock('../analytics-dispatch', () => ({
  send: (name: string) => { sentEvents.push({ name }) },
}))

vi.mock('../analytics-session', () => ({
  isOptedOut: () => mockIsOptedOut,
  stopEngagementTracking: vi.fn(),
  CID_KEY: 'kc-cid',
  SID_KEY: 'kc-sid',
  SC_KEY: 'kc-sc',
  LAST_KEY: 'kc-last',
}))

vi.mock('../constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_ANALYTICS_OPT_OUT: 'kc-analytics-opt-out' }
})

// ── Setup ──────────────────────────────────────────────────────────

type ConsentModule = typeof import('../analytics-consent')

async function freshImport(): Promise<ConsentModule> {
  vi.resetModules()
  return import('../analytics-consent') as Promise<ConsentModule>
}

beforeEach(() => {
  mockInitialized = true
  mockUserHasInteracted = true
  mockIsOptedOut = false
  sentEvents.length = 0
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// setAnalyticsOptOut
// ============================================================================

describe('setAnalyticsOptOut', () => {
  it('sends ksc_analytics_opted_out event when opting out', async () => {
    const { setAnalyticsOptOut } = await freshImport()
    setAnalyticsOptOut(true)
    expect(sentEvents.find(e => e.name === 'ksc_analytics_opted_out')).toBeTruthy()
  })

  it('writes true to localStorage when opting out', async () => {
    const { setAnalyticsOptOut } = await freshImport()
    setAnalyticsOptOut(true)
    expect(localStorage.getItem('kc-analytics-opt-out')).toBe('true')
  })

  it('dispatches kubestellar-settings-changed custom event on opt-out', async () => {
    const { setAnalyticsOptOut } = await freshImport()
    const spy = vi.fn()
    window.addEventListener('kubestellar-settings-changed', spy)
    setAnalyticsOptOut(true)
    window.removeEventListener('kubestellar-settings-changed', spy)
    expect(spy).toHaveBeenCalledOnce()
  })

  it('removes analytics identity keys from localStorage on opt-out', async () => {
    localStorage.setItem('kc-cid', 'abc')
    localStorage.setItem('kc-sid', 'def')
    localStorage.setItem('kc-sc', 'ghi')
    localStorage.setItem('kc-last', 'jkl')
    const { setAnalyticsOptOut } = await freshImport()
    setAnalyticsOptOut(true)
    expect(localStorage.getItem('kc-cid')).toBeNull()
    expect(localStorage.getItem('kc-sid')).toBeNull()
    expect(localStorage.getItem('kc-sc')).toBeNull()
    expect(localStorage.getItem('kc-last')).toBeNull()
  })

  it('sends ksc_analytics_opted_in event when opting in', async () => {
    const { setAnalyticsOptOut } = await freshImport()
    setAnalyticsOptOut(false)
    expect(sentEvents.find(e => e.name === 'ksc_analytics_opted_in')).toBeTruthy()
  })

  it('writes false to localStorage when opting in', async () => {
    const { setAnalyticsOptOut } = await freshImport()
    setAnalyticsOptOut(false)
    expect(localStorage.getItem('kc-analytics-opt-out')).toBe('false')
  })

  it('does NOT remove identity keys when opting in', async () => {
    localStorage.setItem('kc-cid', 'preserved')
    const { setAnalyticsOptOut } = await freshImport()
    setAnalyticsOptOut(false)
    expect(localStorage.getItem('kc-cid')).toBe('preserved')
  })
})

// ============================================================================
// isAnalyticsOptedOut
// ============================================================================

describe('isAnalyticsOptedOut', () => {
  it('returns false when not opted out', async () => {
    mockIsOptedOut = false
    const { isAnalyticsOptedOut } = await freshImport()
    expect(isAnalyticsOptedOut()).toBe(false)
  })

  it('returns true when opted out', async () => {
    mockIsOptedOut = true
    const { isAnalyticsOptedOut } = await freshImport()
    expect(isAnalyticsOptedOut()).toBe(true)
  })
})
