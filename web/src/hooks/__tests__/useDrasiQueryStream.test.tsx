/**
 * Branch-coverage tests for useDrasiQueryStream.ts
 *
 * Covers the no-subscribe short-circuits (mode, paused, missing deps),
 * delta parsing (added / updated / deleted / update-envelope), the
 * lifecycle-event filter, the rolling-cap behavior, and error reporting.
 * EventSource is mocked at the global level.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDrasiQueryStream } from '../useDrasiQueryStream'

// ---------------------------------------------------------------------------
// EventSource mock — a minimal replacement that captures the URL, lets
// tests fire message / error events, and supports close() tracking.
// ---------------------------------------------------------------------------

class MockEventSource {
  static instances: MockEventSource[] = []
  url: string
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onopen: ((ev: Event) => void) | null = null
  closed = false

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }
  close() { this.closed = true }

  // Helpers for tests.
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent)
  }
  emitRaw(data: string) {
    this.onmessage?.({ data } as MessageEvent)
  }
  error() {
    this.onerror?.(new Event('error'))
  }
  open() {
    this.onopen?.(new Event('open'))
  }
}

describe('useDrasiQueryStream', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    // @ts-expect-error — override global for the duration of the test
    globalThis.EventSource = MockEventSource
    // Mock fetch so preflightCheck() resolves successfully without a real network
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200 } as Response)))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('no-op paths', () => {
    it('does not subscribe when mode is null', () => {
      renderHook(() => useDrasiQueryStream({
        mode: null, drasiServerUrl: 'http://x', instanceId: 'i', queryId: 'q',
      }))
      expect(MockEventSource.instances.length).toBe(0)
    })

    it('does not subscribe when mode is platform (not yet implemented)', () => {
      renderHook(() => useDrasiQueryStream({
        mode: 'platform', drasiServerUrl: 'http://x', instanceId: 'i', queryId: 'q',
      }))
      expect(MockEventSource.instances.length).toBe(0)
    })

    it('does not subscribe when paused', () => {
      renderHook(() => useDrasiQueryStream({
        mode: 'server', drasiServerUrl: 'http://x', instanceId: 'i', queryId: 'q',
        paused: true,
      }))
      expect(MockEventSource.instances.length).toBe(0)
    })

    it('does not subscribe when drasiServerUrl is missing', () => {
      renderHook(() => useDrasiQueryStream({
        mode: 'server', instanceId: 'i', queryId: 'q',
      }))
      expect(MockEventSource.instances.length).toBe(0)
    })

    it('does not subscribe when instanceId is null', () => {
      renderHook(() => useDrasiQueryStream({
        mode: 'server', drasiServerUrl: 'http://x', instanceId: null, queryId: 'q',
      }))
      expect(MockEventSource.instances.length).toBe(0)
    })

    it('does not subscribe when queryId is null', () => {
      renderHook(() => useDrasiQueryStream({
        mode: 'server', drasiServerUrl: 'http://x', instanceId: 'i', queryId: null,
      }))
      expect(MockEventSource.instances.length).toBe(0)
    })
  })

  describe('subscribe + URL shape', () => {
    it('opens an EventSource via the backend proxy with encoded params', async () => {
      renderHook(() => useDrasiQueryStream({
        mode: 'server',
        drasiServerUrl: 'http://drasi.local:8090',
        instanceId: 'inst 1',
        queryId: 'q 1',
      }))
      await waitFor(() => expect(MockEventSource.instances.length).toBe(1))
      const url = MockEventSource.instances[0].url
      expect(url).toContain('/api/drasi/proxy')
      expect(url).toContain('/api/v1/instances/inst%201/queries/q%201/events/stream')
      expect(url).toContain('target=server')
      expect(url).toContain(encodeURIComponent('http://drasi.local:8090'))
    })

    it('sets connected=true on open and clears error', async () => {
      const { result } = renderHook(() => useDrasiQueryStream({
        mode: 'server', drasiServerUrl: 'http://x', instanceId: 'i', queryId: 'q',
      }))
      await waitFor(() => expect(MockEventSource.instances.length).toBeGreaterThan(0))
      act(() => { MockEventSource.instances[0].open() })
      await waitFor(() => expect(result.current.connected).toBe(true))
      expect(result.current.error).toBeNull()
    })

    it('closes the EventSource on unmount', async () => {
      const { unmount } = renderHook(() => useDrasiQueryStream({
        mode: 'server', drasiServerUrl: 'http://x', instanceId: 'i', queryId: 'q',
      }))
      await waitFor(() => expect(MockEventSource.instances.length).toBeGreaterThan(0))
      const es = MockEventSource.instances[0]
      unmount()
      expect(es.closed).toBe(true)
    })

    it('reopens when queryId changes', async () => {
      const { rerender } = renderHook(
        ({ q }: { q: string }) => useDrasiQueryStream({
          mode: 'server', drasiServerUrl: 'http://x', instanceId: 'i', queryId: q,
        }),
        { initialProps: { q: 'q1' } },
      )
      await waitFor(() => expect(MockEventSource.instances.length).toBeGreaterThan(0))
      rerender({ q: 'q2' })
      await waitFor(() => expect(MockEventSource.instances.length).toBe(2))
      expect(MockEventSource.instances[0].closed).toBe(true)
    })
  })

  describe('delta event handling', () => {
    it('applies added rows', async () => {
      const { result } = renderHook(() => useDrasiQueryStream({
        mode: 'server', drasiServerUrl: 'http://x', instanceId: 'i', queryId: 'q',
      }))
      await waitFor(() => expect(MockEventSource.instances.length).toBeGreaterThan(0))
      act(() => {
        MockEventSource.instances[0].emit({
          added: [{ symbol: 'AAPL', price: 100 }],
        })
      })
      await waitFor(() => expect(result.current.results.length).toBe(1))
      expect(result.current.results[0]).toEqual({ symbol: 'AAPL', price: 100 })
    })

    it('handles updated rows with {before, after} envelope', async () => {
      const { result } = renderHook(() => useDrasiQueryStream({
        mode: 'server', drasiServerUrl: 'http://x', instanceId: 'i', queryId: 'q',
      }))
      await waitFor(() => expect(MockEventSource.instances.length).toBeGreaterThan(0))
      act(() => {
        MockEventSource.instances[0].emit({
          updated: [{ before: { symbol: 'AAPL', price: 100 }, after: { symbol: 'AAPL', price: 110 } }],
        })
      })
      await waitFor(() => expect(result.current.results.length).toBe(1))
      expect(result.current.results[0]).toEqual({ symbol: 'AAPL', price: 110 })
    })

    it('handles updated rows that are bare (no envelope)', async () => {
      const { result } = renderHook(() => useDrasiQueryStream({
        mode: 'server', drasiServerUrl: 'http://x', instanceId: 'i', queryId: 'q',
      }))
      await waitFor(() => expect(MockEventSource.instances.length).toBeGreaterThan(0))
      act(() => {
        MockEventSource.instances[0].emit({
          updated: [{ symbol: 'MSFT', price: 300 }],
        })
      })
      await waitFor(() => expect(result.current.results.length).toBe(1))
    })

    it('removes deleted rows', async () => {
      const { result } = renderHook(() => useDrasiQueryStream({
        mode: 'server', drasiServerUrl: 'http://x', instanceId: 'i', queryId: 'q',
      }))
      await waitFor(() => expect(MockEventSource.instances.length).toBeGreaterThan(0))
      act(() => {
        MockEventSource.instances[0].emit({ added: [{ symbol: 'AAPL' }, { symbol: 'MSFT' }] })
      })
      await waitFor(() => expect(result.current.results.length).toBe(2))
      act(() => {
        MockEventSource.instances[0].emit({ deleted: [{ symbol: 'AAPL' }] })
      })
      await waitFor(() => expect(result.current.results.length).toBe(1))
      expect(result.current.results[0]).toEqual({ symbol: 'MSFT' })
    })

    it('silently ignores non-JSON messages', async () => {
      const { result } = renderHook(() => useDrasiQueryStream({
        mode: 'server', drasiServerUrl: 'http://x', instanceId: 'i', queryId: 'q',
      }))
      await waitFor(() => expect(MockEventSource.instances.length).toBeGreaterThan(0))
      act(() => { MockEventSource.instances[0].emitRaw('heartbeat') })
      expect(result.current.results.length).toBe(0)
    })

    it('treats Query lifecycle events with status Stopped as a disconnect', async () => {
      const { result } = renderHook(() => useDrasiQueryStream({
        mode: 'server', drasiServerUrl: 'http://x', instanceId: 'i', queryId: 'q',
      }))
      await waitFor(() => expect(MockEventSource.instances.length).toBeGreaterThan(0))
      act(() => { MockEventSource.instances[0].open() })
      await waitFor(() => expect(result.current.connected).toBe(true))
      act(() => {
        MockEventSource.instances[0].emit({
          componentType: 'Query', componentId: 'q', status: 'Stopped',
        })
      })
      await waitFor(() => expect(result.current.connected).toBe(false))
    })

    it('caps the rolling result set at 200 rows', async () => {
      const { result } = renderHook(() => useDrasiQueryStream({
        mode: 'server', drasiServerUrl: 'http://x', instanceId: 'i', queryId: 'q',
      }))
      await waitFor(() => expect(MockEventSource.instances.length).toBeGreaterThan(0))
      // Push 250 unique rows in one delta.
      const added = Array.from({ length: 250 }, (_, i) => ({ n: i }))
      act(() => { MockEventSource.instances[0].emit({ added }) })
      await waitFor(() => expect(result.current.results.length).toBe(200))
    })
  })

  describe('errors', () => {
    it('sets error and connected=false on EventSource error', async () => {
      const { result } = renderHook(() => useDrasiQueryStream({
        mode: 'server', drasiServerUrl: 'http://x', instanceId: 'i', queryId: 'q',
      }))
      await waitFor(() => expect(MockEventSource.instances.length).toBeGreaterThan(0))
      act(() => { MockEventSource.instances[0].error() })
      await waitFor(() => expect(result.current.error).not.toBeNull())
      expect(result.current.connected).toBe(false)
    })
  })
})
