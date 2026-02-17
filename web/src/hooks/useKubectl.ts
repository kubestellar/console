/**
 * Shared kubectl WebSocket service
 *
 * Optimizations:
 * - Reuses a single WebSocket connection instead of creating one per request
 * - Queues requests if connection is not ready
 * - Auto-reconnects on disconnect
 * - Cleans up on unmount
 */

import { getDemoMode } from './useDemoMode'
import { LOCAL_AGENT_WS_URL } from '../lib/constants'
const RECONNECT_DELAY = 1000
const REQUEST_TIMEOUT = 30000

interface PendingRequest {
  resolve: (output: string) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

class KubectlService {
  private ws: WebSocket | null = null
  private pendingRequests: Map<string, PendingRequest> = new Map()
  private requestQueue: Array<{ id: string; message: unknown }> = []
  private isConnecting = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private subscribers = 0

  subscribe() {
    this.subscribers++
    if (this.subscribers === 1) {
      this.connect()
    }
    return () => {
      this.subscribers--
      if (this.subscribers === 0) {
        this.disconnect()
      }
    }
  }

  private connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return
    }

    // In demo mode, skip WebSocket connection to avoid console errors
    if (getDemoMode()) {
      return
    }

    this.isConnecting = true
    try {
      this.ws = new WebSocket(LOCAL_AGENT_WS_URL)

      this.ws.onopen = () => {
        this.isConnecting = false
        // Process queued requests
        while (this.requestQueue.length > 0) {
          const queued = this.requestQueue.shift()
          if (queued && this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(queued.message))
          }
        }
      }

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          const pending = this.pendingRequests.get(msg.id)
          if (pending) {
            clearTimeout(pending.timeout)
            this.pendingRequests.delete(msg.id)
            if (msg.payload?.output !== undefined) {
              pending.resolve(msg.payload.output)
            } else if (msg.payload?.error) {
              pending.reject(new Error(msg.payload.error))
            } else {
              pending.resolve('')
            }
          }
        } catch {
          // Ignore parse errors
        }
      }

      this.ws.onclose = () => {
        this.isConnecting = false
        this.ws = null
        // Reject all pending requests
        this.pendingRequests.forEach((pending) => {
          clearTimeout(pending.timeout)
          pending.reject(new Error('Connection closed'))
        })
        this.pendingRequests.clear()
        // Reconnect if we have subscribers
        if (this.subscribers > 0) {
          this.scheduleReconnect()
        }
      }

      this.ws.onerror = () => {
        this.isConnecting = false
        // onclose will handle cleanup
      }
    } catch {
      this.isConnecting = false
      this.scheduleReconnect()
    }
  }

  private disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.pendingRequests.forEach((pending) => {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Disconnected'))
    })
    this.pendingRequests.clear()
    this.requestQueue = []
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.subscribers > 0) {
        this.connect()
      }
    }, RECONNECT_DELAY)
  }

  async execute(context: string, args: string[], timeout = REQUEST_TIMEOUT): Promise<string> {
    const requestId = `kubectl-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const message = {
      id: requestId,
      type: 'kubectl',
      payload: { context, args }
    }

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error('Request timed out'))
      }, timeout)

      this.pendingRequests.set(requestId, { resolve, reject, timeout: timeoutHandle })

      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message))
      } else {
        // Queue the request
        this.requestQueue.push({ id: requestId, message })
        this.connect()
      }
    })
  }
}

// Singleton instance
export const kubectlService = new KubectlService()

// React hook for kubectl commands
import { useEffect, useCallback } from 'react'

export function useKubectl() {
  useEffect(() => {
    const unsubscribe = kubectlService.subscribe()
    return unsubscribe
  }, [])

  const execute = useCallback(async (context: string, args: string[]): Promise<string> => {
    return kubectlService.execute(context, args)
  }, [])

  return { execute }
}
