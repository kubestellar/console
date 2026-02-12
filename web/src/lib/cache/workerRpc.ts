/**
 * Main-thread RPC client for the SQLite cache Web Worker.
 *
 * Provides a promise-based interface over postMessage.
 * Each call gets a unique ID and resolves when the worker replies with that ID.
 */

import type {
  WorkerResponse,
  CacheEntry,
  CacheMeta,
  PreloadResult,
  MigrationPayload,
} from './workerMessages'

type PendingCall = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

/** Message body sent to the worker (id is added by call/send). */
type RequestBody = Record<string, unknown> & { type: string }

export class CacheWorkerRpc {
  private worker: Worker
  private nextId = 1
  private pending = new Map<number, PendingCall>()
  private readyPromise: Promise<void>
  private resolveReady!: () => void

  constructor(worker: Worker) {
    this.worker = worker
    this.readyPromise = new Promise<void>((resolve) => {
      this.resolveReady = resolve
    })

    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data

      // Handle the initial 'ready' signal
      if (msg.id === -1 && msg.type === 'ready') {
        this.resolveReady()
        return
      }

      const pending = this.pending.get(msg.id)
      if (!pending) return

      this.pending.delete(msg.id)
      if (msg.type === 'error') {
        pending.reject(new Error(msg.message))
      } else if (msg.type === 'result') {
        pending.resolve(msg.value)
      }
    }

    this.worker.onerror = (event) => {
      console.error('[CacheWorkerRpc] Worker error:', event.message)
    }
  }

  /** Wait for the worker to finish SQLite initialization. */
  waitForReady(): Promise<void> {
    return this.readyPromise
  }

  /** Send a request and wait for the response. */
  private call<R>(msg: RequestBody): Promise<R> {
    const id = this.nextId++
    return new Promise<R>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      })
      this.worker.postMessage({ ...msg, id })
    })
  }

  /** Send a request without waiting for a response (fire-and-forget). */
  private send(msg: RequestBody): void {
    const id = this.nextId++
    // We still assign an ID but don't track the promise
    this.worker.postMessage({ ...msg, id })
  }

  // ---- Cache data operations ----

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    return this.call<CacheEntry<T> | null>({ type: 'get', key })
  }

  set(key: string, entry: CacheEntry): void {
    this.send({ type: 'set', key, entry })
  }

  deleteKey(key: string): void {
    this.send({ type: 'delete', key })
  }

  async clear(): Promise<void> {
    return this.call<void>({ type: 'clear' })
  }

  async getStats(): Promise<{ keys: string[]; count: number }> {
    return this.call<{ keys: string[]; count: number }>({ type: 'getStats' })
  }

  // ---- Cache metadata operations ----

  async getMeta(key: string): Promise<CacheMeta | null> {
    return this.call<CacheMeta | null>({ type: 'getMeta', key })
  }

  setMeta(key: string, meta: CacheMeta): void {
    this.send({ type: 'setMeta', key, meta })
  }

  // ---- Bulk operations ----

  async preloadAll(): Promise<PreloadResult> {
    return this.call<PreloadResult>({ type: 'preloadAll' })
  }

  async migrate(data: MigrationPayload): Promise<void> {
    return this.call<void>({ type: 'migrate', data })
  }

  /** Seed cache entries (used by perf tests to pre-populate warm cache). */
  async seedCache(entries: Array<{ key: string; entry: CacheEntry }>): Promise<void> {
    return this.call<void>({ type: 'seedCache', entries })
  }

  // ---- Preferences ----

  async getPreference(key: string): Promise<string | null> {
    return this.call<string | null>({ type: 'getPreference', key })
  }

  setPreference(key: string, value: string): void {
    this.send({ type: 'setPreference', key, value })
  }

  /** Terminate the worker. */
  terminate(): void {
    this.worker.terminate()
    // Reject all pending calls
    for (const [, pending] of this.pending) {
      pending.reject(new Error('Worker terminated'))
    }
    this.pending.clear()
  }
}
