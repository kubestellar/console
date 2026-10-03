import { beforeEach, afterEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// IndexedDB mock — jsdom provides a partial indexedDB but it's unreliable.
// We override it with a minimal in-memory implementation to make the
// openDatabase/getFromDB/saveToDB/deleteFromDB functions in hooks.ts work.
// ---------------------------------------------------------------------------

const idbStore = new Map<string, unknown>()

function makeRequest<T>(resultFn: () => T): IDBRequest<T> {
  const req = {
    result: undefined as T,
    error: null as DOMException | null,
    onsuccess: null as ((ev: Event) => void) | null,
    onerror: null as ((ev: Event) => void) | null,
  }
  queueMicrotask(() => {
    try {
      req.result = resultFn()
      req.onsuccess?.({} as Event)
    } catch (e: unknown) {
      req.error = e as DOMException
      req.onerror?.({} as Event)
    }
  })
  return req as unknown as IDBRequest<T>
}

function makeObjectStore(): IDBObjectStore {
  return {
    get(key: string) {
      return makeRequest(() => idbStore.get(key) ?? undefined)
    },
    put(value: { key: string }) {
      return makeRequest(() => {
        idbStore.set(value.key, value)
        return undefined as unknown
      })
    },
    delete(key: string) {
      return makeRequest(() => {
        idbStore.delete(key)
        return undefined as unknown
      })
    },
    clear() {
      return makeRequest(() => {
        idbStore.clear()
        return undefined as unknown
      })
    },
  } as unknown as IDBObjectStore
}

function makeTransaction(): IDBTransaction {
  const tx = {
    objectStore() {
      return makeObjectStore()
    },
    oncomplete: null as ((ev: Event) => void) | null,
    onerror: null as ((ev: Event) => void) | null,
    error: null as DOMException | null,
  }
  // Fire oncomplete on next microtask so clearAllStorage's promise resolves
  queueMicrotask(() => {
    tx.oncomplete?.({} as Event)
  })
  return tx as unknown as IDBTransaction
}

function makeFakeDB(): IDBDatabase {
  return {
    transaction() {
      return makeTransaction()
    },
    objectStoreNames: {
      contains: () => true,
    },
    createObjectStore: vi.fn(),
  } as unknown as IDBDatabase
}

const fakeDB = makeFakeDB()

/**
 * Install a working indexedDB.open mock. Must be called inside beforeEach
 * to reset per-test.
 */
function installIDBMock(): void {
  const fakeIndexedDB = {
    open: vi.fn().mockImplementation(() => {
      const req = {
        result: fakeDB,
        error: null as DOMException | null,
        onsuccess: null as ((ev: Event) => void) | null,
        onerror: null as ((ev: Event) => void) | null,
        onupgradeneeded: null as ((ev: Event) => void) | null,
      }
      queueMicrotask(() => {
        req.onsuccess?.({} as Event)
      })
      return req
    }),
  }
  // jsdom may or may not have indexedDB — define it on both window and globalThis
  Object.defineProperty(window, 'indexedDB', { value: fakeIndexedDB, writable: true, configurable: true })
  Object.defineProperty(globalThis, 'indexedDB', { value: fakeIndexedDB, writable: true, configurable: true })
}

/**
 * Install a broken indexedDB.open mock that always errors.
 */
export function installBrokenIDBMock(): void {
  const broken = {
    open: vi.fn().mockImplementation(() => {
      const req = {
        result: undefined,
        error: new DOMException('IDB unavailable'),
        onsuccess: null as ((ev: Event) => void) | null,
        onerror: null as ((ev: Event) => void) | null,
        onupgradeneeded: null as ((ev: Event) => void) | null,
      }
      queueMicrotask(() => {
        req.onerror?.({} as Event)
      })
      return req
    }),
  }
  Object.defineProperty(window, 'indexedDB', { value: broken, writable: true, configurable: true })
  Object.defineProperty(globalThis, 'indexedDB', { value: broken, writable: true, configurable: true })
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  idbStore.clear()
  localStorage.clear()
  installIDBMock()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Fresh import helper — hooks.ts has module-level singletons (dbInstance,
// dbPromise) that must be reset between tests that exercise IndexedDB.
// ---------------------------------------------------------------------------
export async function importHooks() {
  vi.resetModules()
  return import('../hooks')
}
