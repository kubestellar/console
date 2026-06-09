import { isNetlifyDeployment } from './demoMode'
import { isInClusterMode } from '../hooks/useBackendHealth'
import { getWsAuthParams } from './utils/wsAuth'
import {
  LOCAL_AGENT_WS_URL,
  WS_CONNECT_TIMEOUT_MS,
  WS_CONNECTION_COOLDOWN_MS,
  BACKEND_HEALTH_CHECK_TIMEOUT_MS,
  KUBECTL_DEFAULT_TIMEOUT_MS,
  MAX_CONCURRENT_KUBECTL_REQUESTS,
  MAX_PENDING_KUBECTL_REQUESTS,
  FOCUS_DELAY_MS,
} from './constants'
import { reportBackendAvailable, reportBackendUnavailable } from './backendHealthEvents'
import type {
  KubectlExecOptions,
  KubectlRequest,
  KubectlResponse,
  KubectlWebSocketMode,
  Message,
  PendingRequest,
  QueuedRequest,
} from './kubectlProxy.types'

export class KubectlProxyConnection {
  private ws: WebSocket | null = null
  private pendingRequests: Map<string, PendingRequest> = new Map()
  private connectPromise: Promise<void> | null = null
  private messageId = 0
  private isConnecting = false
  private requestQueue: QueuedRequest[] = []
  private activeRequests = 0
  private readonly maxConcurrentRequests = MAX_CONCURRENT_KUBECTL_REQUESTS
  private lastConnectionFailureAt = 0
  private wsMode: KubectlWebSocketMode = 'unknown'

  private getBackendWSURL(): string {
    if (typeof window === 'undefined') return LOCAL_AGENT_WS_URL
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${wsProtocol}//${window.location.host}/ws`
  }

  private async resolveWebSocketURL(): Promise<string> {
    if (this.wsMode === 'backend') return this.getBackendWSURL()
    if (this.wsMode === 'local') return LOCAL_AGENT_WS_URL

    if (isInClusterMode()) {
      this.wsMode = 'backend'
      return this.getBackendWSURL()
    }

    try {
      const res = await fetch('/health', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(BACKEND_HEALTH_CHECK_TIMEOUT_MS),
      })
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as {
          in_cluster?: boolean
        } | null
        if (data?.in_cluster === true) {
          this.wsMode = 'backend'
          return this.getBackendWSURL()
        }
      }
    } catch {
      // ignore probe failure and fall back to local endpoint
    }

    this.wsMode = 'local'
    return LOCAL_AGENT_WS_URL
  }

  private async ensureConnected(): Promise<void> {
    if (isNetlifyDeployment) {
      throw new Error('Agent unavailable on Netlify deployment')
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    if (this.connectPromise) {
      return this.connectPromise
    }

    if (this.isConnecting) {
      await new Promise((resolve) => setTimeout(resolve, FOCUS_DELAY_MS))
      return this.ensureConnected()
    }

    this.isConnecting = true
    this.connectPromise = (async () => {
      const wsURL = await this.resolveWebSocketURL()
      const isLocalTarget = wsURL === LOCAL_AGENT_WS_URL

      if (
        isLocalTarget &&
        Date.now() - this.lastConnectionFailureAt < WS_CONNECTION_COOLDOWN_MS
      ) {
        throw new Error('Local agent unavailable (cooldown)')
      }

      return new Promise<void>((resolve, reject) => {
        let settled = false
        let connectTimeout: ReturnType<typeof setTimeout> | null = null
        const finalize = (cb: () => void) => {
          if (settled) return
          settled = true
          if (connectTimeout) clearTimeout(connectTimeout)
          cb()
        }
        void (async () => {
          try {
            const { url, protocols } = await getWsAuthParams(wsURL)
            this.ws = new WebSocket(url, protocols)
            connectTimeout = setTimeout(() => {
              try {
                this.ws?.close()
              } catch {
                /* ignore */
              }
              this.lastConnectionFailureAt = Date.now()
              this.isConnecting = false
              this.connectPromise = null
              finalize(() =>
                reject(
                  new Error(
                    `Connection timeout after ${WS_CONNECT_TIMEOUT_MS}ms`,
                  ),
                ),
              )
            }, WS_CONNECT_TIMEOUT_MS)

            this.ws.onopen = () => {
              this.isConnecting = false
              this.lastConnectionFailureAt = 0
              this.wsMode = wsURL === LOCAL_AGENT_WS_URL ? 'local' : 'backend'
              if (this.wsMode === 'backend') {
                reportBackendAvailable('ws')
              }
              finalize(() => resolve())
            }

            this.ws.onmessage = (event) => {
              try {
                const message: Message = JSON.parse(event.data)
                const pending = this.pendingRequests.get(message.id)
                if (pending) {
                  clearTimeout(pending.timeout)
                  this.pendingRequests.delete(message.id)

                  if (message.type === 'error') {
                    const errorPayload = message.payload as {
                      code: string
                      message: string
                    }
                    pending.reject(
                      new Error(errorPayload.message || 'Unknown error'),
                    )
                  } else {
                    pending.resolve(message.payload as KubectlResponse)
                  }
                }
              } catch (e: unknown) {
                console.error('[KubectlProxy] Failed to parse message:', e)
              }
            }

            this.ws.onclose = () => {
              const wasBackendSocket = this.wsMode === 'backend'
              this.ws = null
              this.connectPromise = null
              this.isConnecting = false
              this.lastConnectionFailureAt = Date.now()
              this.wsMode = 'unknown'
              if (wasBackendSocket) {
                reportBackendUnavailable('ws')
              }

              this.pendingRequests.forEach((pending, id) => {
                clearTimeout(pending.timeout)
                pending.reject(new Error('Connection closed'))
                this.pendingRequests.delete(id)
              })
            }

            this.ws.onerror = (err) => {
              console.error('[KubectlProxy] WebSocket error:', err)
              this.isConnecting = false
              this.connectPromise = null
              this.lastConnectionFailureAt = Date.now()
              this.wsMode = 'unknown'
              if (!isLocalTarget) {
                reportBackendUnavailable('ws')
              }
              finalize(() =>
                reject(
                  new Error(
                    isLocalTarget
                      ? 'Failed to connect to local agent'
                      : 'Failed to connect to backend WebSocket',
                  ),
                ),
              )
            }
          } catch (err: unknown) {
            this.isConnecting = false
            this.connectPromise = null
            this.lastConnectionFailureAt = Date.now()
            this.wsMode = 'unknown'
            finalize(() => reject(err))
          }
        })()
      })
    })().catch((err) => {
      this.isConnecting = false
      this.connectPromise = null
      this.lastConnectionFailureAt = Date.now()
      this.wsMode = 'unknown'
      throw err
    })

    return this.connectPromise
  }

  private generateId(): string {
    return `kubectl-${++this.messageId}-${Date.now()}`
  }

  async exec(
    args: string[],
    options: KubectlExecOptions = {},
  ): Promise<KubectlResponse> {
    if (options.priority) {
      return this.execImmediate(args, options)
    }

    if (this.requestQueue.length >= MAX_PENDING_KUBECTL_REQUESTS) {
      return Promise.reject(new Error('Too many pending kubectl requests'))
    }

    return new Promise((resolve, reject) => {
      this.requestQueue.push({ args, options, resolve, reject })
      this.processQueue()
    })
  }

  private async processQueue(): Promise<void> {
    if (this.activeRequests >= this.maxConcurrentRequests) {
      return
    }

    const request = this.requestQueue.shift()
    if (!request) {
      return
    }

    this.activeRequests++

    try {
      const response = await this.execImmediate(request.args, request.options)
      request.resolve(response)
    } catch (err: unknown) {
      request.reject(err instanceof Error ? err : new Error(String(err)))
    } finally {
      this.activeRequests--
      if (this.requestQueue.length > 0) {
        this.processQueue()
      }
    }
  }

  private async execImmediate(
    args: string[],
    options: KubectlExecOptions = {},
  ): Promise<KubectlResponse> {
    await this.ensureConnected()

    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to local agent')
    }

    const id = this.generateId()
    const timeout = options.timeout || KUBECTL_DEFAULT_TIMEOUT_MS

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Kubectl command timed out after ${timeout}ms`))
      }, timeout)

      this.pendingRequests.set(id, { resolve, reject, timeout: timeoutHandle })

      const message: Message = {
        id,
        type: 'kubectl',
        payload: {
          context: options.context,
          namespace: options.namespace,
          args,
        } as KubectlRequest,
      }

      try {
        ws.send(JSON.stringify(message))
      } catch (err: unknown) {
        clearTimeout(timeoutHandle)
        this.pendingRequests.delete(id)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  close(): void {
    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift()!
      request.reject(new Error('Connection closed'))
    }
    this.activeRequests = 0

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.connectPromise = null
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  getQueueStats(): { queued: number; active: number; maxConcurrent: number } {
    return {
      queued: this.requestQueue.length,
      active: this.activeRequests,
      maxConcurrent: this.maxConcurrentRequests,
    }
  }
}
