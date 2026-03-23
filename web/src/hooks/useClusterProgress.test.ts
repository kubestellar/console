import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useClusterProgress } from './useClusterProgress'

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = []
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(_url: string) {
    MockWebSocket.instances.push(this)
  }
  close() {
    // no-op
  }

  // Helper to simulate receiving a message
  simulateMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) })
    }
  }
}

describe('useClusterProgress', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts with null progress', () => {
    const { result } = renderHook(() => useClusterProgress())
    expect(result.current.progress).toBeNull()
  })

  it('updates progress when receiving local_cluster_progress message', () => {
    const { result } = renderHook(() => useClusterProgress())

    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateMessage({
        type: 'local_cluster_progress',
        payload: {
          tool: 'kind',
          name: 'test-cluster',
          status: 'failed',
          message: 'Docker is not running. Start Docker Desktop or Rancher Desktop first.',
          progress: 0,
        },
      })
    })

    expect(result.current.progress).not.toBeNull()
    expect(result.current.progress?.status).toBe('failed')
    expect(result.current.progress?.message).toContain('Docker is not running')
  })

  it('ignores non-progress messages', () => {
    const { result } = renderHook(() => useClusterProgress())

    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateMessage({
        type: 'some_other_event',
        payload: { foo: 'bar' },
      })
    })

    expect(result.current.progress).toBeNull()
  })

  it('dismiss clears progress', () => {
    const { result } = renderHook(() => useClusterProgress())

    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateMessage({
        type: 'local_cluster_progress',
        payload: {
          tool: 'kind',
          name: 'test',
          status: 'done',
          message: 'Cluster created',
          progress: 100,
        },
      })
    })

    expect(result.current.progress).not.toBeNull()

    act(() => {
      result.current.dismiss()
    })

    expect(result.current.progress).toBeNull()
  })

  it('receives real error messages (not generic "operation failed")', () => {
    const { result } = renderHook(() => useClusterProgress())

    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateMessage({
        type: 'local_cluster_progress',
        payload: {
          tool: 'kind',
          name: 'my-cluster',
          status: 'failed',
          message: 'kind create failed: cluster "my-cluster" already exists',
          progress: 0,
        },
      })
    })

    expect(result.current.progress?.message).toBe(
      'kind create failed: cluster "my-cluster" already exists'
    )
    // Verify it is NOT the old generic message
    expect(result.current.progress?.message).not.toBe('operation failed')
  })
})
