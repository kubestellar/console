/**
 * Shared WebSocket mock and test utilities for useClusterProgress test suites.
 *
 * This module is imported by each split test file (useClusterProgress.part*.test.ts)
 * so the mock WebSocket implementation and async helpers stay in one place.
 */
import { act, renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import { useClusterProgress } from '../useClusterProgress'

export type WSHandler = ((event: { data: string }) => void) | null

export interface MockWebSocketInstance {
  onopen: (() => void) | null
  onmessage: WSHandler
  onclose: (() => void) | null
  onerror: (() => void) | null
  close: ReturnType<typeof vi.fn>
  readyState: number
  url: string
  protocols: string[]
}

export let wsInstances: MockWebSocketInstance[] = []

export function resetWsInstances() {
  wsInstances = []
}

export class MockWebSocket implements MockWebSocketInstance {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  onopen: (() => void) | null = null
  onmessage: WSHandler = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) this.onclose()
  })
  readyState = MockWebSocket.OPEN
  url: string
  protocols: string[]

  constructor(url = 'ws://127.0.0.1:8585/ws', protocols?: string | string[]) {
    this.url = url
    this.protocols = Array.isArray(protocols)
      ? protocols
      : protocols ? [protocols] : []
    wsInstances.push(this)
    // Simulate async open
    setTimeout(() => {
      if (this.onopen) this.onopen()
    }, 0)
  }
}

export async function flushPendingWebSocketSetup() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(0)
  })
}

export async function renderClusterProgressHook() {
  const hook = renderHook(() => useClusterProgress())
  await flushPendingWebSocketSetup()
  return hook
}

export async function advanceTimersAndFlush(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
    await Promise.resolve()
    await Promise.resolve()
  })
}
