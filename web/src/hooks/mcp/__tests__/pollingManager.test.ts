import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  POLL_INTERVAL_MS: 30000,
  POLL_INTERVAL_SLOW_MS: 60000,
} })

import { subscribePolling } from '../pollingManager'

describe('pollingManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('exports subscribePolling', () => {
    expect(subscribePolling).toBeDefined()
    expect(typeof subscribePolling).toBe('function')
  })
})
