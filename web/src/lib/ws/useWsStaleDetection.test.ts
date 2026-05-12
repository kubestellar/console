import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createWsStaleDetection, DEFAULT_WS_STALE_TIMEOUT_MS, WS_STALE_CHECK_INTERVAL_MS } from './useWsStaleDetection'

describe('createWsStaleDetection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls onStale after the timeout when the socket stays disconnected', () => {
    let connected = false
    const onStale = vi.fn()
    const staleDetection = createWsStaleDetection({
      onStale,
      isConnected: () => connected,
      shouldCheck: () => true,
    })

    staleDetection.markMessageReceived()
    staleDetection.start()
    vi.advanceTimersByTime(DEFAULT_WS_STALE_TIMEOUT_MS + WS_STALE_CHECK_INTERVAL_MS)

    expect(onStale).toHaveBeenCalledTimes(1)
  })

  it('does not call onStale while the socket remains connected', () => {
    const onStale = vi.fn()
    const staleDetection = createWsStaleDetection({
      onStale,
      isConnected: () => true,
      shouldCheck: () => true,
    })

    staleDetection.markMessageReceived()
    staleDetection.start()
    vi.advanceTimersByTime(DEFAULT_WS_STALE_TIMEOUT_MS + WS_STALE_CHECK_INTERVAL_MS)

    expect(onStale).not.toHaveBeenCalled()
  })

  it('stops the timer when checking is no longer needed', () => {
    let shouldCheck = true
    const onStale = vi.fn()
    const staleDetection = createWsStaleDetection({
      onStale,
      isConnected: () => false,
      shouldCheck: () => shouldCheck,
    })

    staleDetection.markMessageReceived()
    staleDetection.start()
    shouldCheck = false
    vi.advanceTimersByTime(WS_STALE_CHECK_INTERVAL_MS)
    vi.advanceTimersByTime(DEFAULT_WS_STALE_TIMEOUT_MS + WS_STALE_CHECK_INTERVAL_MS)

    expect(onStale).not.toHaveBeenCalled()
  })
})
