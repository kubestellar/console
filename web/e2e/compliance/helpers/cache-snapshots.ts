import { type Page, expect } from '@playwright/test'
import {
  WARM_POLL_INTERVAL_MS,
  EVALUATE_RETRY_ATTEMPTS,
  EVALUATE_RETRY_DELAY_MS,
  BATCH_LOAD_TIMEOUT_MS,
  WARM_RETURN_WAIT_MS,
  CACHE_DB_NAME,
  CACHE_SNAPSHOT_STABILIZE_TIMEOUT_MS,
  CACHE_SNAPSHOT_STABILIZE_INTERVAL_MS,
  CACHE_SNAPSHOT_STABLE_READS,
  type ColdLoadSnapshot,
  type WarmLoadSnapshot,
  type CacheEntry,
} from '../cache-constants'

// ---------------------------------------------------------------------------
// Card state capture helpers
// ---------------------------------------------------------------------------

export async function captureColdSnapshots(page: Page, cardIds: string[]): Promise<ColdLoadSnapshot[]> {
  // Retry page.evaluate to handle transient execution-context invalidation
  // (e.g., a background navigation triggered by a card hook between
  // waitForCardsToLoad and this call).
  for (let attempt = 0; attempt < EVALUATE_RETRY_ATTEMPTS; attempt++) {
    try {
      return await page.evaluate((ids: string[]) => {
        return ids.map((id) => {
          const card = document.querySelector(`[data-card-id="${id}"]`)
          if (!card) {
            return {
              cardId: id, cardType: '', textLength: 0,
              hasVisualContent: false, hasContent: false,
              hasDemoBadge: false, dataLoading: null,
            }
          }
          const textLen = (card.textContent || '').trim().length
          const hasVisual = !!card.querySelector('canvas,svg,iframe,table,img,video,pre,code,[role="img"]')
          return {
            cardId: id,
            cardType: card.getAttribute('data-card-type') || '',
            textLength: textLen,
            hasVisualContent: hasVisual,
            hasContent: textLen > 10 || hasVisual,
            hasDemoBadge: !!card.querySelector('[data-testid="demo-badge"]'),
            dataLoading: card.getAttribute('data-loading'),
          }
        })
      }, cardIds)
    } catch (err) {
      console.warn(`[CacheTest] captureColdSnapshots attempt ${attempt + 1}/${EVALUATE_RETRY_ATTEMPTS} failed:`, err)
      if (attempt === EVALUATE_RETRY_ATTEMPTS - 1) {
        // Final attempt — return empty snapshots instead of crashing
        console.warn('[CacheTest] All captureColdSnapshots retries exhausted, returning empty snapshots')
        return cardIds.map((id) => ({
          cardId: id, cardType: '', textLength: 0,
          hasVisualContent: false, hasContent: false,
          hasDemoBadge: false, dataLoading: null,
        }))
      }
      // Wait before retrying to let the page settle
      await new Promise((r) => setTimeout(r, EVALUATE_RETRY_DELAY_MS))
      // Re-wait for page to be stable
      await page.waitForLoadState('domcontentloaded', { timeout: BATCH_LOAD_TIMEOUT_MS }).catch((error) => { console.error('Best-effort operation failed:', error) })
    }
  }
  // TypeScript: unreachable but needed for type safety
  return []
}

export async function _captureWarmSnapshots(
  page: Page,
  cardIds: string[],
  pollMs: number,
  totalMs: number
): Promise<WarmLoadSnapshot[]> {
  // Poll card state over time to find when content first appears
  return await page.evaluate(
    ({ ids, interval, duration }: { ids: string[]; interval: number; duration: number }) => {
      return new Promise<Array<{
        cardId: string; cardType: string; textLength: number;
        hasVisualContent: boolean; hasContent: boolean;
        hasDemoBadge: boolean; hasLargeSkeleton: boolean;
        dataLoading: string | null; timeToContentMs: number | null;
      }>>((resolve) => {
        const firstContentTime: Record<string, number | null> = {}
        for (const id of ids) firstContentTime[id] = null

        const start = performance.now()
        const timer = setInterval(() => {
          const elapsed = performance.now() - start
          for (const id of ids) {
            if (firstContentTime[id] !== null) continue
            const card = document.querySelector(`[data-card-id="${id}"]`)
            if (!card) continue
            const textLen = (card.textContent || '').trim().length
            const hasVisual = !!card.querySelector('canvas,svg,iframe,table,img,video,pre,code,[role="img"]')
            const hasSkeleton = !!card.querySelector('[data-card-skeleton="true"]')
            if ((textLen > 10 || hasVisual) && !hasSkeleton) {
              firstContentTime[id] = elapsed
            }
          }

          if (elapsed >= duration) {
            clearInterval(timer)
            // Final snapshot
            const results = ids.map((id) => {
              const card = document.querySelector(`[data-card-id="${id}"]`)
              if (!card) {
                return {
                  cardId: id, cardType: '', textLength: 0,
                  hasVisualContent: false, hasContent: false,
                  hasDemoBadge: false, hasLargeSkeleton: false,
                  dataLoading: null, timeToContentMs: null,
                }
              }
              const textLen = (card.textContent || '').trim().length
              const hasVisual = !!card.querySelector('canvas,svg,iframe,table,img,video,pre,code,[role="img"]')
              const hasSkeleton = !!card.querySelector('[data-card-skeleton="true"]')
              return {
                cardId: id,
                cardType: card.getAttribute('data-card-type') || '',
                textLength: textLen,
                hasVisualContent: hasVisual,
                hasContent: textLen > 10 || hasVisual,
                hasDemoBadge: !!card.querySelector('[data-testid="demo-badge"]'),
                hasLargeSkeleton: hasSkeleton,
                dataLoading: card.getAttribute('data-loading'),
                timeToContentMs: firstContentTime[id],
              }
            })
            resolve(results)
          }
        }, interval)
      })
    },
    { ids: cardIds, interval: pollMs, duration: totalMs }
  )
}

/**
 * Resilient warm snapshot capture — uses Playwright-side polling instead of
 * in-page setInterval, which is vulnerable to execution-context destruction
 * during SPA navigation.
 */
export async function captureWarmSnapshotsResilient(
  page: Page,
  cardIds: string[],
  totalMs: number
): Promise<WarmLoadSnapshot[]> {
  const start = Date.now()
  const firstContentTime: Record<string, number | null> = {}
  for (const id of cardIds) firstContentTime[id] = null

  while (Date.now() - start < totalMs) {
    try {
      const snapshot = await page.evaluate((ids: string[]) => {
        return ids.map((id) => {
          const card = document.querySelector(`[data-card-id="${id}"]`)
          if (!card) return { id, textLen: 0, hasVisual: false, hasSkeleton: true }
          const textLen = (card.textContent || '').trim().length
          const hasVisual = !!card.querySelector('canvas,svg,iframe,table,img,video,pre,code,[role="img"]')
          const hasSkeleton = !!card.querySelector('[data-card-skeleton="true"]')
          return { id, textLen, hasVisual, hasSkeleton }
        })
      }, cardIds)
      const elapsed = Date.now() - start
      for (const s of snapshot) {
        if (firstContentTime[s.id] === null && (s.textLen > 10 || s.hasVisual) && !s.hasSkeleton) {
          firstContentTime[s.id] = elapsed
        }
      }
    } catch (error) {
        console.error('Operation failed:', error)
      }
    await page.waitForTimeout(WARM_POLL_INTERVAL_MS)
  }

  // Final snapshot
  try {
    return await page.evaluate((ids: string[]) => {
      return ids.map((id) => {
        const card = document.querySelector(`[data-card-id="${id}"]`)
        if (!card) {
          return {
            cardId: id, cardType: '', textLength: 0,
            hasVisualContent: false, hasContent: false,
            hasDemoBadge: false, hasLargeSkeleton: false,
            dataLoading: null, timeToContentMs: null,
          }
        }
        const textLen = (card.textContent || '').trim().length
        const hasVisual = !!card.querySelector('canvas,svg,iframe,table,img,video,pre,code,[role="img"]')
        const hasSkeleton = !!card.querySelector('[data-card-skeleton="true"]')
        return {
          cardId: id,
          cardType: card.getAttribute('data-card-type') || '',
          textLength: textLen,
          hasVisualContent: hasVisual,
          hasContent: textLen > 10 || hasVisual,
          hasDemoBadge: !!card.querySelector('[data-testid="demo-badge"]'),
          hasLargeSkeleton: hasSkeleton,
          dataLoading: card.getAttribute('data-loading'),
          timeToContentMs: null, // filled below
        }
      })
    }, cardIds).then((results) => {
      for (const r of results) {
        r.timeToContentMs = firstContentTime[r.cardId] ?? null
      }
      return results
    })
  } catch (error) {
    console.error('Failed to capture warm snapshots:', error)
    return cardIds.map((id) => ({
      cardId: id, cardType: '', textLength: 0,
      hasVisualContent: false, hasContent: false,
      hasDemoBadge: false, hasLargeSkeleton: false,
      dataLoading: null, timeToContentMs: null,
    }))
  }
}

/**
 * Retry cards that had a clean cold snapshot but briefly regress to demo or
 * empty state during warm return on slower CI runners.
 */
export function shouldRetryWarmSnapshot(
  coldSnap: ColdLoadSnapshot | undefined,
  warmSnap: WarmLoadSnapshot
): boolean {
  return Boolean(coldSnap?.hasContent && !coldSnap.hasDemoBadge && (!warmSnap.hasContent || warmSnap.hasDemoBadge))
}

export function mergeRecoveredWarmSnapshot(
  initialWarmSnap: WarmLoadSnapshot,
  recoveredWarmSnap: WarmLoadSnapshot
): WarmLoadSnapshot {
  return {
    ...initialWarmSnap,
    ...recoveredWarmSnap,
    timeToContentMs: initialWarmSnap.timeToContentMs
      ?? (recoveredWarmSnap.hasContent
        ? WARM_RETURN_WAIT_MS + (recoveredWarmSnap.timeToContentMs ?? 0)
        : recoveredWarmSnap.timeToContentMs),
  }
}

// ---------------------------------------------------------------------------
// Cache inspection helpers
// ---------------------------------------------------------------------------

export async function snapshotCacheState(page: Page): Promise<{
  indexedDBEntries: CacheEntry[]
  localStorageKeys: string[]
}> {
  return await page.evaluate(async (cacheDbName: string) => {
    // Read localStorage cache-related keys
    const lsKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      if (
        key.includes('cache') || key.includes('kubestellar-') ||
        key.startsWith('kc-') || key.startsWith('kc_') || key.startsWith('cache:')
      ) {
        lsKeys.push(key)
      }
    }

    // Read IndexedDB kc_cache entries
    const idbEntries = await new Promise<Array<{
      key: string; timestamp: number; version: number;
      dataSize: number; dataType: string; isArray: boolean; arrayLength: number | null;
    }>>((resolve) => {
      try {
        const req = indexedDB.open(cacheDbName, 1)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('cache')) {
            db.createObjectStore('cache', { keyPath: 'key' })
          }
        }
        req.onsuccess = () => {
          try {
            const db = req.result
            if (!db.objectStoreNames.contains('cache')) {
              db.close()
              resolve([])
              return
            }
            const tx = db.transaction('cache', 'readonly')
            const store = tx.objectStore('cache')
            const all = store.getAll()
            all.onsuccess = () => {
              const entries = (all.result || []).map((entry: Record<string, unknown>) => {
                const data = entry.data
                return {
                  key: String(entry.key || ''),
                  timestamp: Number(entry.timestamp || 0),
                  version: Number(entry.version || 0),
                  dataSize: JSON.stringify(data).length,
                  dataType: typeof data,
                  isArray: Array.isArray(data),
                  arrayLength: Array.isArray(data) ? data.length : null,
                }
              })
              db.close()
              resolve(entries)
            }
            all.onerror = () => { db.close(); resolve([]) }
          } catch (error) {
            console.error('Failed to access IndexedDB entries:', error)
            resolve([])
          }
        }
        req.onerror = () => resolve([])
      } catch (error) {
        console.error('Failed to open IndexedDB:', error)
        resolve([])
      }
    })

    return { indexedDBEntries: idbEntries, localStorageKeys: lsKeys }
  }, CACHE_DB_NAME)
}

export async function waitForSettledCacheState(page: Page): Promise<{
  indexedDBEntries: CacheEntry[]
  localStorageKeys: string[]
}> {
  let settledState: {
    indexedDBEntries: CacheEntry[]
    localStorageKeys: string[]
  } | null = null
  let lastSignature = ''
  let stableReads = 0

  await expect(async () => {
    const cacheState = await snapshotCacheState(page)
    const idbKeys = cacheState.indexedDBEntries.map((entry) => entry.key).sort()
    const localStorageKeys = [...cacheState.localStorageKeys].sort()
    const signature = JSON.stringify({
      indexedDbKeys: idbKeys,
      localStorageKeys,
    })

    expect(
      cacheState.indexedDBEntries.length,
      'Expected IndexedDB cache writes to complete before warm-return assertions',
    ).toBeGreaterThan(0)

    if (signature === lastSignature) {
      stableReads += 1
    } else {
      lastSignature = signature
      stableReads = 1
    }

    expect(
      stableReads,
      'Expected cache snapshot to stop changing before reading IndexedDB state',
    ).toBeGreaterThanOrEqual(CACHE_SNAPSHOT_STABLE_READS)

    settledState = cacheState
  }).toPass({
    timeout: CACHE_SNAPSHOT_STABILIZE_TIMEOUT_MS,
    intervals: [CACHE_SNAPSHOT_STABILIZE_INTERVAL_MS],
  })

  if (!settledState) {
    throw new Error('Failed to capture settled cache state')
  }

  return settledState
}
