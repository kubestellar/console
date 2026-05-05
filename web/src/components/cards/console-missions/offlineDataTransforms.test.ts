import { describe, expect, it } from 'vitest'
import { buildOfflineDetectionCardLoadState } from './offlineDataTransforms'

describe('buildOfflineDetectionCardLoadState', () => {
  it('suppresses card failure when partial node data exists', () => {
    const state = buildOfflineDetectionCardLoadState([
      { hasData: true, consecutiveFailures: 3, isFailed: true },
      { hasData: false, isFailed: true, consecutiveFailures: 3 },
      { hasData: false, isFailed: false, consecutiveFailures: 0 },
    ])

    expect(state.hasAnyData).toBe(true)
    expect(state.isFailed).toBe(false)
    expect(state.consecutiveFailures).toBe(0)
  })

  it('suppresses card failure when only one source is failing', () => {
    const state = buildOfflineDetectionCardLoadState([
      { hasData: false, isFailed: true, consecutiveFailures: 3 },
      { hasData: false, isFailed: false, consecutiveFailures: 0 },
      { hasData: false, isFailed: false, consecutiveFailures: 0 },
    ])

    expect(state.hasAnyData).toBe(false)
    expect(state.isFailed).toBe(false)
  })

  it('surfaces card failure only when every source has failed with no data', () => {
    const state = buildOfflineDetectionCardLoadState([
      { hasData: false, isFailed: true, consecutiveFailures: 3 },
      { hasData: false, isFailed: true, consecutiveFailures: 4 },
      { hasData: false, isFailed: true, consecutiveFailures: 5 },
    ])

    expect(state.hasAnyData).toBe(false)
    expect(state.isFailed).toBe(true)
    expect(state.consecutiveFailures).toBe(5)
  })
})
