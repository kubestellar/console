import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import {
  CardEventProvider,
  useCardEvents,
  useCardPublish,
  useCardSubscribe,
  type CardEvent,
  type DeployStartedPayload,
  type DeployProgressPayload,
  type DeployCompletedPayload,
  type DeployResultPayload,
} from '../cardEvents'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapper({ children }: { children: ReactNode }) {
  return createElement(CardEventProvider, null, children)
}

function createDeployStartedEvent(): CardEvent {
  return {
    type: 'deploy:started',
    payload: {
      id: 'deploy-1',
      workload: 'nginx',
      namespace: 'default',
      sourceCluster: 'cluster-a',
      targetClusters: ['cluster-b', 'cluster-c'],
      timestamp: Date.now(),
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CardEventProvider', () => {
  it('renders children', () => {
    const { result } = renderHook(() => useCardEvents(), { wrapper })
    expect(result.current).toBeDefined()
    expect(typeof result.current.publish).toBe('function')
    expect(typeof result.current.subscribe).toBe('function')
  })
})

describe('useCardEvents', () => {
  it('returns no-op bus when used outside provider', () => {
    const { result } = renderHook(() => useCardEvents())
    // Should not throw
    expect(() => result.current.publish(createDeployStartedEvent())).not.toThrow()
    const unsub = result.current.subscribe('deploy:started', () => {})
    expect(typeof unsub).toBe('function')
    unsub()
  })

  it('publish delivers events to subscribers', () => {
    const callback = vi.fn()

    const { result } = renderHook(() => useCardEvents(), { wrapper })

    act(() => {
      result.current.subscribe('deploy:started', callback)
    })

    act(() => {
      result.current.publish(createDeployStartedEvent())
    })

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'deploy:started' })
    )
  })

  it('does not deliver events of different types', () => {
    const callback = vi.fn()

    const { result } = renderHook(() => useCardEvents(), { wrapper })

    act(() => {
      result.current.subscribe('deploy:completed', callback)
    })

    act(() => {
      result.current.publish(createDeployStartedEvent())
    })

    expect(callback).not.toHaveBeenCalled()
  })

  it('unsubscribe stops event delivery', () => {
    const callback = vi.fn()

    const { result } = renderHook(() => useCardEvents(), { wrapper })

    let unsub: () => void
    act(() => {
      unsub = result.current.subscribe('deploy:started', callback)
    })

    act(() => {
      result.current.publish(createDeployStartedEvent())
    })
    expect(callback).toHaveBeenCalledTimes(1)

    act(() => {
      unsub!()
    })

    act(() => {
      result.current.publish(createDeployStartedEvent())
    })
    // Should not have been called again
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('supports multiple subscribers for the same event type', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()

    const { result } = renderHook(() => useCardEvents(), { wrapper })

    act(() => {
      result.current.subscribe('deploy:started', cb1)
      result.current.subscribe('deploy:started', cb2)
    })

    act(() => {
      result.current.publish(createDeployStartedEvent())
    })

    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)
  })

  it('handles errors in subscriber callbacks gracefully', () => {
    const errorCb = vi.fn(() => {
      throw new Error('subscriber error')
    })
    const goodCb = vi.fn()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useCardEvents(), { wrapper })

    act(() => {
      result.current.subscribe('deploy:started', errorCb)
      result.current.subscribe('deploy:started', goodCb)
    })

    act(() => {
      result.current.publish(createDeployStartedEvent())
    })

    // Error callback was called but didn't prevent good callback
    expect(errorCb).toHaveBeenCalledTimes(1)
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('cleans up event type map entry when last subscriber unsubscribes', () => {
    const callback = vi.fn()

    const { result } = renderHook(() => useCardEvents(), { wrapper })

    let unsub: () => void
    act(() => {
      unsub = result.current.subscribe('deploy:started', callback)
    })

    act(() => {
      unsub!()
    })

    // Publishing should not throw even though no subscribers remain
    act(() => {
      result.current.publish(createDeployStartedEvent())
    })

    expect(callback).not.toHaveBeenCalled()
  })
})

describe('useCardPublish', () => {
  it('returns the publish function', () => {
    const { result } = renderHook(() => useCardPublish(), { wrapper })
    expect(typeof result.current).toBe('function')
  })
})

describe('useCardSubscribe', () => {
  it('returns the subscribe function', () => {
    const { result } = renderHook(() => useCardSubscribe(), { wrapper })
    expect(typeof result.current).toBe('function')
  })
})

describe('Event payload types', () => {
  it('deploy:started payload has required fields', () => {
    const payload: DeployStartedPayload = {
      id: 'd1',
      workload: 'nginx',
      namespace: 'default',
      sourceCluster: 'c1',
      targetClusters: ['c2'],
      timestamp: Date.now(),
    }
    expect(payload.id).toBe('d1')
    expect(payload.targetClusters).toHaveLength(1)
  })

  it('deploy:progress payload has required fields', () => {
    const payload: DeployProgressPayload = {
      id: 'd1',
      cluster: 'c1',
      status: 'running',
      readyReplicas: 2,
      replicas: 3,
    }
    expect(payload.status).toBe('running')
    expect(payload.readyReplicas).toBeLessThan(payload.replicas)
  })

  it('deploy:completed payload has required fields', () => {
    const payload: DeployCompletedPayload = {
      id: 'd1',
      success: true,
      results: [{ cluster: 'c1', status: 'deployed' }],
      timestamp: Date.now(),
    }
    expect(payload.success).toBe(true)
    expect(payload.results).toHaveLength(1)
  })

  it('deploy:result payload has required fields', () => {
    const payload: DeployResultPayload = {
      id: 'd1',
      success: false,
      message: 'Partial failure',
      failedClusters: ['c2'],
    }
    expect(payload.success).toBe(false)
    expect(payload.failedClusters).toContain('c2')
  })
})
