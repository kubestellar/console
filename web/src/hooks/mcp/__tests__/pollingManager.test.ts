import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../lib/constants/network', () => ({
  POLL_INTERVAL_MS: 30000,
  POLL_INTERVAL_SLOW_MS: 60000,
}))

import { PollingManager } from '../pollingManager'

describe('PollingManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is importable', () => {
    expect(PollingManager).toBeDefined()
  })
})
