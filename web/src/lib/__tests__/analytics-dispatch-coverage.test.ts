/**
 * Direct coverage tests for analytics-dispatch.ts
 *
 * Targets:
 * - send(): initialized gate, opted-out gate, userHasInteracted gate,
 *   bypassOptOut option, successful dispatch
 * - emitUserEngagement(): engagement > 0 vs = 0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared state controlled by tests ──────────────────────────────

let mockInitialized = false
let mockUserHasInteracted = false
let mockIsOptedOut = false
let mockEngagementMs = 0

vi.mock('../analytics-core-state', () => ({
  get initialized() { return mockInitialized },
  get userHasInteracted() { return mockUserHasInteracted },
}))

vi.mock('../analytics-session', () => ({
  isOptedOut: () => mockIsOptedOut,
  peekEngagementMs: () => mockEngagementMs,
}))

const dispatchedEvents: Array<{ name: string; params: unknown }> = []

vi.mock('../analytics-providers', () => ({
  dispatchAnalyticsEvent: (name: string, params: unknown) => {
    dispatchedEvents.push({ name, params })
  },
}))

// ── Setup ──────────────────────────────────────────────────────────

type DispatchModule = typeof import('../analytics-dispatch')

async function freshImport(): Promise<DispatchModule> {
  vi.resetModules()
  return import('../analytics-dispatch') as Promise<DispatchModule>
}

beforeEach(() => {
  mockInitialized = false
  mockUserHasInteracted = false
  mockIsOptedOut = false
  mockEngagementMs = 0
  dispatchedEvents.length = 0
})

// ============================================================================
// send()
// ============================================================================

describe('send', () => {
  it('is a no-op when not initialized', async () => {
    const { send } = await freshImport()
    mockInitialized = false
    mockUserHasInteracted = true
    send('ksc_test_event', {})
    expect(dispatchedEvents.length).toBe(0)
  })

  it('is a no-op when opted out without bypass', async () => {
    const { send } = await freshImport()
    mockInitialized = true
    mockUserHasInteracted = true
    mockIsOptedOut = true
    send('ksc_test_event', {})
    expect(dispatchedEvents.length).toBe(0)
  })

  it('sends when bypassOptOut=true even when opted out', async () => {
    const { send } = await freshImport()
    mockInitialized = true
    mockUserHasInteracted = true
    mockIsOptedOut = true
    send('ksc_bypass_event', {}, { bypassOptOut: true })
    expect(dispatchedEvents.find(e => e.name === 'ksc_bypass_event')).toBeTruthy()
  })

  it('is a no-op when userHasInteracted is false', async () => {
    const { send } = await freshImport()
    mockInitialized = true
    mockUserHasInteracted = false
    mockIsOptedOut = false
    send('ksc_test_event', {})
    expect(dispatchedEvents.length).toBe(0)
  })

  it('dispatches event when all gates pass', async () => {
    const { send } = await freshImport()
    mockInitialized = true
    mockUserHasInteracted = true
    mockIsOptedOut = false
    send('ksc_page_view', { page: '/clusters' })
    const evt = dispatchedEvents.find(e => e.name === 'ksc_page_view')
    expect(evt).toBeTruthy()
    expect((evt!.params as Record<string, unknown>).page).toBe('/clusters')
  })

  it('accepts undefined params', async () => {
    const { send } = await freshImport()
    mockInitialized = true
    mockUserHasInteracted = true
    send('ksc_no_params')
    expect(dispatchedEvents.find(e => e.name === 'ksc_no_params')).toBeTruthy()
  })
})

// ============================================================================
// emitUserEngagement()
// ============================================================================

describe('emitUserEngagement', () => {
  it('sends user_engagement when engagementMs > 0', async () => {
    const { emitUserEngagement } = await freshImport()
    mockInitialized = true
    mockUserHasInteracted = true
    mockEngagementMs = 5000
    emitUserEngagement()
    expect(dispatchedEvents.find(e => e.name === 'user_engagement')).toBeTruthy()
  })

  it('does not send when engagementMs is 0', async () => {
    const { emitUserEngagement } = await freshImport()
    mockInitialized = true
    mockUserHasInteracted = true
    mockEngagementMs = 0
    emitUserEngagement()
    expect(dispatchedEvents.find(e => e.name === 'user_engagement')).toBeUndefined()
  })
})
