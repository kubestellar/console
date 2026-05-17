import { useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import { useKeepAliveActive } from '../../hooks/useKeepAliveActive'
import { registerRefetch } from '../modeTransition'
import {
  FAILURE_BACKOFF_MULTIPLIER,
  MAX_BACKOFF_INTERVAL,
  MAX_FAILURES,
  META_PREFIX,
  REFRESH_RATES,
  SS_PREFIX,
  _idbPreloadPromise,
  _idbStorage,
  cacheStorage,
  clearSessionSnapshots,
  preloadedMetaMap,
  registerPreloadedMetaApplier,
  ssRead,
  ssWrite,
  type CacheEntry,
  type CacheMeta,
  type CacheState,
  type RefreshCategory,
  type Subscriber,
  workerRpc,
} from './cacheStorage'
import {
  isDemoMode,
  isEquivalentToInitial,
  registerCacheModeReset,
  resolveDemoDisplayState,
  subscribeDemoMode,
} from './cacheFallback'

export function getEffectiveInterval(baseInterval: number, consecutiveFailures: number): number {
  let interval = baseInterval
  if (consecutiveFailures > 0) {
    const backoffMultiplier = Math.pow(FAILURE_BACKOFF_MULTIPLIER, Math.min(consecutiveFailures, 5))
    interval = Math.min(interval * backoffMultiplier, MAX_BACKOFF_INTERVAL)
  }
  return interval
}

let globalAutoRefreshPaused = false
const autoRefreshPauseListeners = new Set<(paused: boolean) => void>()

function notifyAutoRefreshPauseListeners() {
  autoRefreshPauseListeners.forEach(fn => fn(globalAutoRefreshPaused))
}

export function isAutoRefreshPaused(): boolean {
  return globalAutoRefreshPaused
}

export function setAutoRefreshPaused(paused: boolean): void {
  if (globalAutoRefreshPaused === paused) return
  globalAutoRefreshPaused = paused
  notifyAutoRefreshPauseListeners()
}

export function subscribeAutoRefreshPaused(cb: (paused: boolean) => void): () => void {
  autoRefreshPauseListeners.add(cb)
  return () => autoRefreshPauseListeners.delete(cb)
}

export class CacheStore<T> {
  private state: CacheState<T>
  private subscribers = new Set<Subscriber>()
  private fetchingRef = false
  private refreshTimeoutRef: ReturnType<typeof setTimeout> | null = null
  private initialDataLoaded = false
  private storageLoadPromise: Promise<void> | null = null
  private resetVersion = 0

  constructor(
    private key: string,
    private initialData: T,
    private persist: boolean = true,
  ) {
    const meta = this.loadMeta()
    const ssEntry = this.persist ? ssRead<T>(key) : null
    const snapshot = ssEntry ?? (this.persist ? _idbStorage.getFromSnapshot<T>(key) : null)

    if (snapshot && (!isEquivalentToInitial(snapshot.data, initialData) || snapshot.timestamp > 0)) {
      this.initialDataLoaded = true
      this.state = {
        data: snapshot.data,
        isLoading: false,
        isRefreshing: true,
        error: null,
        isFailed: false,
        consecutiveFailures: 0,
        lastRefresh: snapshot.timestamp,
      }
      this.storageLoadPromise = Promise.resolve()
    } else {
      this.state = {
        data: initialData,
        isLoading: true,
        isRefreshing: false,
        error: null,
        isFailed: meta.consecutiveFailures >= MAX_FAILURES,
        consecutiveFailures: meta.consecutiveFailures,
        lastRefresh: meta.lastSuccessfulRefresh ?? null,
      }
      if (this.persist) {
        this.storageLoadPromise = this.loadFromStorage()
      }
    }
  }

  private async loadFromStorage(): Promise<void> {
    if (!this.persist || this.initialDataLoaded) return
    await _idbPreloadPromise

    try {
      const entry = await cacheStorage.get<T>(this.key)
      if (entry && (!isEquivalentToInitial(entry.data, this.initialData) || entry.timestamp > 0)) {
        this.initialDataLoaded = true
        ssWrite(this.key, entry.data, entry.timestamp)
        this.setState({
          data: entry.data,
          isLoading: false,
          isRefreshing: true,
          lastRefresh: entry.timestamp,
          isFailed: false,
          consecutiveFailures: 0,
        })
        this.saveMeta({ consecutiveFailures: 0, lastSuccessfulRefresh: entry.timestamp })
      }
    } catch {
      // Ignore errors, will use initial data with isLoading=true
    }
  }

  private async saveToStorage(data: T): Promise<void> {
    if (!this.persist) return
    ssWrite(this.key, data, Date.now())
    try {
      await cacheStorage.set(this.key, data)
      if (workerRpc) {
        _idbStorage.set(this.key, data).catch(() => {})
      }
    } catch (e: unknown) {
      console.error(`[Cache] Failed to save ${this.key}:`, e)
    }
  }

  private loadMeta(): CacheMeta {
    return preloadedMetaMap.get(this.key) ?? { consecutiveFailures: 0 }
  }

  private saveMeta(meta: CacheMeta): void {
    preloadedMetaMap.set(this.key, meta)
    if (workerRpc) {
      workerRpc.setMeta(this.key, meta)
    } else {
      try {
        localStorage.setItem(META_PREFIX + this.key, JSON.stringify(meta))
      } catch {}
    }
  }

  getSnapshot = (): CacheState<T> => this.state

  subscribe = (callback: Subscriber): (() => void) => {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  private notify(): void {
    this.subscribers.forEach(cb => cb())
  }

  private setState(updates: Partial<CacheState<T>>): void {
    this.state = { ...this.state, ...updates }
    this.notify()
  }

  markReady(): void {
    if (this.state.isLoading) {
      this.setState({ isLoading: false, lastRefresh: Date.now() })
    }
  }

  resetToInitialData(): void {
    this.resetVersion++
    this.fetchingRef = false
    this.initialDataLoaded = false
    this.setState({
      data: this.initialData,
      isLoading: true,
      isRefreshing: false,
      error: null,
      isFailed: false,
      consecutiveFailures: 0,
    })
    if (this.persist) {
      this.storageLoadPromise = this.loadFromStorage()
    }
  }

  resetForModeTransition(): void {
    this.resetVersion++
    this.fetchingRef = false
    this.initialDataLoaded = false
    this.storageLoadPromise = null
    this.setState({
      data: this.initialData,
      isLoading: true,
      isRefreshing: false,
      error: null,
      isFailed: false,
      consecutiveFailures: 0,
    })
  }

  applyPreloadedMeta(): void {
    if (!this.initialDataLoaded && this.state.isLoading) {
      const meta = this.loadMeta()
      this.setState({
        isFailed: meta.consecutiveFailures >= MAX_FAILURES,
        consecutiveFailures: meta.consecutiveFailures,
        lastRefresh: meta.lastSuccessfulRefresh ?? null,
      })
    }
  }

  hydrateFromEntry(entry: CacheEntry<T>): void {
    this.initialDataLoaded = true
    this.state = {
      ...this.state,
      data: entry.data,
      isLoading: false,
      isRefreshing: true,
      lastRefresh: entry.timestamp,
    }
    this.notify()
  }

  async fetch(
    fetcher: () => Promise<T>,
    merge?: (old: T, new_: T) => T,
    progressiveFetcher?: (onProgress: (partialData: T) => void) => Promise<T>,
  ): Promise<void> {
    if (this.fetchingRef) return
    this.fetchingRef = true
    const fetchVersion = this.resetVersion

    if (this.storageLoadPromise) {
      const currentPromise = this.storageLoadPromise
      try {
        await currentPromise
      } catch {}
      if (this.storageLoadPromise === currentPromise) {
        this.storageLoadPromise = null
      }
    }

    if (this.resetVersion !== fetchVersion) {
      this.fetchingRef = false
      return
    }

    const hasCachedData = this.state.data !== this.initialData || this.initialDataLoaded
    this.setState({ isLoading: !hasCachedData, isRefreshing: hasCachedData })

    try {
      const PROGRESS_THROTTLE_MS = 100
      let lastProgressTs = 0
      let pendingProgress: T | null = null
      let progressTimerId: ReturnType<typeof setTimeout> | null = null

      const flushProgress = () => {
        if (pendingProgress === null) return
        if (this.resetVersion !== fetchVersion) return
        this.setState({ data: pendingProgress })
        pendingProgress = null
        lastProgressTs = Date.now()
      }

      const onProgress = progressiveFetcher ? (partialData: T) => {
        if (this.resetVersion !== fetchVersion) return
        if (isEquivalentToInitial(partialData, this.initialData)) return

        const now = Date.now()
        pendingProgress = partialData
        if (now - lastProgressTs >= PROGRESS_THROTTLE_MS) {
          if (progressTimerId) { clearTimeout(progressTimerId); progressTimerId = null }
          flushProgress()
        } else if (!progressTimerId) {
          const remaining = PROGRESS_THROTTLE_MS - (now - lastProgressTs)
          progressTimerId = setTimeout(() => {
            progressTimerId = null
            flushProgress()
          }, remaining)
        }
      } : undefined

      const newData = progressiveFetcher && onProgress
        ? await progressiveFetcher(onProgress)
        : await fetcher()

      if (progressTimerId) { clearTimeout(progressTimerId); progressTimerId = null }
      if (this.resetVersion !== fetchVersion) {
        this.fetchingRef = false
        return
      }

      if (isEquivalentToInitial(newData, this.initialData) && hasCachedData) {
        this.fetchingRef = false
        this.setState({ isLoading: false, isRefreshing: false })
        return
      }

      const finalData = merge && hasCachedData ? merge(this.state.data, newData) : newData
      if (this.resetVersion !== fetchVersion) {
        this.fetchingRef = false
        return
      }

      await this.saveToStorage(finalData)
      if (this.resetVersion !== fetchVersion) {
        try { sessionStorage.removeItem(SS_PREFIX + this.key) } catch {}
        cacheStorage.delete(this.key).catch(() => {})
        this.fetchingRef = false
        return
      }
      this.saveMeta({ consecutiveFailures: 0, lastSuccessfulRefresh: Date.now() })
      if (this.resetVersion !== fetchVersion) {
        this.fetchingRef = false
        return
      }

      this.initialDataLoaded = true
      this.setState({
        data: finalData,
        isLoading: false,
        isRefreshing: false,
        error: null,
        isFailed: false,
        consecutiveFailures: 0,
        lastRefresh: Date.now(),
      })
    } catch (e: unknown) {
      if (this.resetVersion !== fetchVersion) {
        this.fetchingRef = false
        return
      }

      const errorMessage = e instanceof Error ? e.message : 'Failed to fetch data'
      const newFailures = this.state.consecutiveFailures + 1
      const hasData = this.state.data !== this.initialData || this.initialDataLoaded
      const reachedMaxFailures = newFailures >= MAX_FAILURES

      if (hasData && this.persist && this.resetVersion === fetchVersion) {
        this.saveToStorage(this.state.data)
        this.initialDataLoaded = true
      }

      this.saveMeta({
        consecutiveFailures: newFailures,
        lastError: errorMessage,
        lastSuccessfulRefresh: hasData ? Date.now() : (this.state.lastRefresh ?? undefined),
      })

      this.setState({
        isLoading: !hasData && !reachedMaxFailures,
        isRefreshing: false,
        error: errorMessage,
        isFailed: hasData ? false : reachedMaxFailures,
        consecutiveFailures: hasData ? 0 : newFailures,
      })
    } finally {
      this.fetchingRef = false
    }
  }

  async clear(): Promise<void> {
    await cacheStorage.delete(this.key)
    try { sessionStorage.removeItem(SS_PREFIX + this.key) } catch {}
    preloadedMetaMap.delete(this.key)
    if (workerRpc) {
      workerRpc.setMeta(this.key, { consecutiveFailures: 0 })
    } else {
      localStorage.removeItem(META_PREFIX + this.key)
    }
    this.initialDataLoaded = false
    this.setState({
      data: this.initialData,
      isLoading: true,
      isRefreshing: false,
      error: null,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
    })
  }

  destroy(): void {
    if (this.refreshTimeoutRef) {
      clearTimeout(this.refreshTimeoutRef)
    }
    this.subscribers.clear()
  }

  resetFailures(): void {
    if (this.state.consecutiveFailures === 0 && !this.state.error) return
    this.saveMeta({
      consecutiveFailures: 0,
      lastSuccessfulRefresh: this.state.lastRefresh ?? undefined,
    })
    this.setState({ consecutiveFailures: 0, isFailed: false, error: null })
  }
}

export const cacheRegistry = new Map<string, CacheStore<unknown>>()

export function getOrCreateCache<T>(key: string, initialData: T, persist: boolean): CacheStore<T> {
  if (!cacheRegistry.has(key)) {
    cacheRegistry.set(key, new CacheStore(key, initialData, persist) as CacheStore<unknown>)
  }
  return cacheRegistry.get(key) as CacheStore<T>
}

function clearAllInMemoryCaches(): void {
  cacheStorage.clear().catch((e) => {
    console.error('[Cache] Failed to clear persistent storage during mode transition:', e)
  })
  preloadedMetaMap.clear()
  clearSessionSnapshots()
  for (const store of cacheRegistry.values()) {
    (store as CacheStore<unknown>).resetForModeTransition()
  }
}

registerPreloadedMetaApplier(() => {
  for (const store of cacheRegistry.values()) {
    (store as CacheStore<unknown>).applyPreloadedMeta()
  }
})
registerCacheModeReset(clearAllInMemoryCaches)

export interface UseCacheOptions<T> {
  key: string
  fetcher: () => Promise<T>
  category?: RefreshCategory
  refreshInterval?: number
  initialData: T
  demoData?: T
  persist?: boolean
  autoRefresh?: boolean
  enabled?: boolean
  demoWhenEmpty?: boolean
  isEmpty?: (data: T) => boolean
  liveInDemoMode?: boolean
  merge?: (oldData: T, newData: T) => T
  shared?: boolean
  progressiveFetcher?: (onProgress: (partialData: T) => void) => Promise<T>
}

export interface UseCacheResult<T> {
  data: T
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
  retryFetch: () => Promise<void>
  clearAndRefetch: () => Promise<void>
  isDemoFallback: boolean
}

export type CachedHookResult<T> = Omit<UseCacheResult<T>, 'clearAndRefetch'>

export function useCache<T>({
  key,
  fetcher,
  category = 'default',
  refreshInterval,
  initialData,
  demoData,
  persist = true,
  autoRefresh = true,
  enabled = true,
  demoWhenEmpty = false,
  isEmpty: isEmptyFn,
  liveInDemoMode = false,
  merge,
  shared = true,
  progressiveFetcher,
}: UseCacheOptions<T>): UseCacheResult<T> {
  const demoMode = useSyncExternalStore(subscribeDemoMode, isDemoMode, isDemoMode)
  const autoRefreshGloballyPaused = useSyncExternalStore(
    subscribeAutoRefreshPaused,
    isAutoRefreshPaused,
    isAutoRefreshPaused,
  )
  const keepAliveActive = useKeepAliveActive()
  const effectiveEnabled = enabled && (!demoMode || liveInDemoMode)

  const hasMountedRef = useRef(false)
  const prevEnabledRef = useRef(effectiveEnabled)
  const initialFetchDoneRef = useRef(false)
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const storeRef = useRef<CacheStore<T> | null>(null)
  const storeKeyRef = useRef(key)

  if (!storeRef.current || storeKeyRef.current !== key) {
    if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current)
      autoRefreshTimerRef.current = null
    }
    initialFetchDoneRef.current = false

    storeKeyRef.current = key
    storeRef.current = shared
      ? getOrCreateCache(key, initialData, persist)
      : new CacheStore(key, initialData, persist)
  }

  const store = storeRef.current
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const mergeRef = useRef(merge)
  mergeRef.current = merge
  const progressiveFetcherRef = useRef(progressiveFetcher)
  progressiveFetcherRef.current = progressiveFetcher

  const refetch = useCallback(async () => {
    if (!effectiveEnabled || !keepAliveActive) return
    await store.fetch(() => fetcherRef.current(), mergeRef.current, progressiveFetcherRef.current)
  }, [effectiveEnabled, keepAliveActive, store])

  const retryFetch = useCallback(async () => {
    store.resetFailures()
    await store.fetch(() => fetcherRef.current(), mergeRef.current, progressiveFetcherRef.current)
  }, [store])

  const clearAndRefetch = async () => {
    await store.clear()
    await refetch()
  }

  const baseInterval = refreshInterval ?? REFRESH_RATES[category]
  const effectiveInterval = getEffectiveInterval(baseInterval, state.consecutiveFailures)

  useEffect(() => {
    if (!effectiveEnabled) {
      store.markReady()
      hasMountedRef.current = true
      prevEnabledRef.current = effectiveEnabled
      initialFetchDoneRef.current = false
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current)
        autoRefreshTimerRef.current = null
      }
      return
    }

    const isModeTransition = hasMountedRef.current && !prevEnabledRef.current && effectiveEnabled
    hasMountedRef.current = true
    prevEnabledRef.current = effectiveEnabled

    if (!isModeTransition && !initialFetchDoneRef.current && keepAliveActive) {
      initialFetchDoneRef.current = true
      const lastRefresh = state.lastRefresh
      const dataAge = lastRefresh ? Date.now() - lastRefresh : Infinity
      const hasFreshData = !state.isLoading && !state.isRefreshing && dataAge < baseInterval
      if (!hasFreshData) {
        refetch().catch(() => {})
      }
    }

    const unregisterRefetch = registerRefetch(`cache:${key}`, refetch)

    if (autoRefresh && !autoRefreshGloballyPaused && keepAliveActive) {
      if (!autoRefreshTimerRef.current) {
        autoRefreshTimerRef.current = setInterval(() => {
          refetch().catch(() => {})
        }, effectiveInterval)
      }
    } else if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current)
      autoRefreshTimerRef.current = null
    }

    return () => {
      unregisterRefetch()
    }
  }, [effectiveEnabled, autoRefresh, autoRefreshGloballyPaused, keepAliveActive, refetch, store, key])

  useEffect(() => {
    if (!autoRefreshTimerRef.current || !autoRefresh || autoRefreshGloballyPaused || !keepAliveActive) return
    clearInterval(autoRefreshTimerRef.current)
    autoRefreshTimerRef.current = setInterval(() => {
      refetch().catch(() => {})
    }, effectiveInterval)
  }, [effectiveInterval, autoRefresh, autoRefreshGloballyPaused, keepAliveActive, refetch])

  useEffect(() => {
    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current)
        autoRefreshTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      if (!shared && storeRef.current) {
        storeRef.current.destroy()
      }
    }
  }, [shared])

  const demoDataRef = useRef(demoData)
  const initialDataRef = useRef(initialData)
  const demoDataJSON = JSON.stringify(demoData)
  const initialDataJSON = JSON.stringify(initialData)
  const prevDemoJSON = useRef(demoDataJSON)
  const prevInitialJSON = useRef(initialDataJSON)

  if (demoDataJSON !== prevDemoJSON.current) {
    prevDemoJSON.current = demoDataJSON
    demoDataRef.current = demoData
  }
  if (initialDataJSON !== prevInitialJSON.current) {
    prevInitialJSON.current = initialDataJSON
    initialDataRef.current = initialData
  }

  const stableDemoData = demoDataRef.current
  const stableInitialData = initialDataRef.current
  const dataIsEmpty = isEmptyFn
    ? isEmptyFn(state.data)
    : Array.isArray(state.data) && (state.data as unknown[]).length === 0

  const demoDisplayState = resolveDemoDisplayState({
    effectiveEnabled,
    state,
    stableDemoData,
    stableInitialData,
    demoWhenEmpty,
    dataIsEmpty,
  })

  return {
    data: demoDisplayState.data,
    isLoading: demoDisplayState.isLoading,
    isRefreshing: demoDisplayState.isRefreshing,
    error: state.error,
    isFailed: state.isFailed,
    consecutiveFailures: state.consecutiveFailures,
    lastRefresh: state.lastRefresh,
    isDemoFallback: demoDisplayState.isDemoFallback,
    refetch,
    retryFetch,
    clearAndRefetch,
  }
}

export function useArrayCache<T>(
  options: Omit<UseCacheOptions<T[]>, 'initialData'> & { initialData?: T[] },
): UseCacheResult<T[]> {
  return useCache({ ...options, initialData: options.initialData ?? [] })
}

export function useObjectCache<T extends Record<string, unknown>>(
  options: Omit<UseCacheOptions<T>, 'initialData'> & { initialData?: T },
): UseCacheResult<T> {
  return useCache({ ...options, initialData: options.initialData ?? ({} as T) })
}
