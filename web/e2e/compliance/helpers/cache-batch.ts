import { type Page } from '@playwright/test'
import { type ManifestData } from '../../mocks/liveMocks'
import {
  BATCH_NAV_TIMEOUT_MS,
  COMPLIANCE_ROUTE,
  SOFT_NAV_SETTER_TIMEOUT_MS,
  CACHE_DB_NAME,
  COLD_BATCH_RESET_WINDOW_NAME,
  COLD_BATCH_KEEP_LOCAL_STORAGE_KEYS,
  STORAGE_CLEANUP_TIMEOUT_MS,
  STORAGE_CLEANUP_POLL_INTERVAL_MS,
  STORAGE_CLEANUP_POLL_ATTEMPTS,
} from '../cache-constants'

export async function waitForComplianceBatchManifest(
  page: Page,
  batch: number,
  batchSize: number,
  timeoutMs = BATCH_NAV_TIMEOUT_MS
): Promise<ManifestData> {
  const handle = await page.waitForFunction(
    ({ expectedBatch, expectedBatchSize }: { expectedBatch: number; expectedBatchSize: number }) => {
      const manifest = (window as Window & { __COMPLIANCE_MANIFEST__?: ManifestData }).__COMPLIANCE_MANIFEST__
      const marker = document.querySelector('[data-testid="compliance-manifest"]')
      const currentUrl = new URL(window.location.href)
      const currentBatch = Number.parseInt(currentUrl.searchParams.get('batch') || '', 10) - 1
      const currentBatchSize = Number.parseInt(currentUrl.searchParams.get('size') || '', 10)

      if (!manifest || manifest.batch !== expectedBatch || manifest.batchSize !== expectedBatchSize) return null
      if (!marker) return null
      if (marker.getAttribute('data-compliance-batch') !== String(expectedBatch)) return null
      if (marker.getAttribute('data-compliance-batch-size') !== String(expectedBatchSize)) return null
      if (currentBatch !== expectedBatch || currentBatchSize !== expectedBatchSize) return null

      return manifest
    },
    { expectedBatch: batch, expectedBatchSize: batchSize },
    { timeout: timeoutMs }
  )

  return (await handle.jsonValue()) as ManifestData
}

/**
 * Soft navigation — calls the React-exposed __COMPLIANCE_SET_BATCH__ setter
 * to switch batches via useSearchParams without a full page reload, preserving
 * React Query's in-memory cache. Falls back to a full navigation only if the
 * setter stays unavailable long enough to exceed a short retry window.
 */
export async function softNavigateToBatch(
  page: Page,
  batch: number,
  batchSize = 24
): Promise<ManifestData | null> {
  const hasSetter = await page.waitForFunction(
    () => typeof (window as Window & { __COMPLIANCE_SET_BATCH__?: unknown }).__COMPLIANCE_SET_BATCH__ === 'function',
    undefined,
    { timeout: SOFT_NAV_SETTER_TIMEOUT_MS }
  ).then(() => true).catch((error) => { console.error('Promise error:', error); return false })

  if (hasSetter) {
    await page.evaluate(
      ({ b, s }: { b: number; s: number }) => {
        (window as Window & { __COMPLIANCE_SET_BATCH__?: (batch: number, size?: number) => void }).__COMPLIANCE_SET_BATCH__!(b, s)
      },
      { b: batch, s: batchSize }
    )
    return await waitForComplianceBatchManifest(page, batch, batchSize)
  }

  console.log(`[CacheTest] softNavigateToBatch: __COMPLIANCE_SET_BATCH__ unavailable, falling back to ${COMPLIANCE_ROUTE}`)
  await page.goto(`${COMPLIANCE_ROUTE}?batch=${batch + 1}&size=${batchSize}`, {
    waitUntil: 'domcontentloaded',
    timeout: BATCH_NAV_TIMEOUT_MS,
  })

  return await waitForComplianceBatchManifest(page, batch, batchSize)
}

// ---------------------------------------------------------------------------
// Cold-batch storage reset helpers
// ---------------------------------------------------------------------------

// Delete kc_cache on the next navigation, after the previous page has unloaded
// and released any live IndexedDB handles.
export async function registerColdBatchStorageReset(page: Page): Promise<void> {
  await page.addInitScript(
    async ({
      cacheDbName,
      keepLocalStorageKeys,
      resetWindowName,
      timeoutMs,
      pollIntervalMs,
      pollAttempts,
    }: {
      cacheDbName: string
      keepLocalStorageKeys: string[]
      resetWindowName: string
      timeoutMs: number
      pollIntervalMs: number
      pollAttempts: number
    }) => {
      if (window.name !== resetWindowName) return
      window.name = ''

      sessionStorage.clear()

      const keepKeys = new Set(keepLocalStorageKeys)
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i)
        if (!key || keepKeys.has(key)) continue
        localStorage.removeItem(key)
      }
      localStorage.setItem('kc-demo-mode', 'false')
      localStorage.setItem('token', 'test-token')
      localStorage.setItem('kc-agent-setup-dismissed', 'true')

      const deleteDatabaseOnce = async (): Promise<void> => {
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(cacheDbName)
          const timer = window.setTimeout(() => {
            reject(new Error(`IndexedDB delete timeout for ${cacheDbName}`))
          }, timeoutMs)

          request.onsuccess = () => {
            window.clearTimeout(timer)
            resolve()
          }
          request.onerror = () => {
            window.clearTimeout(timer)
            resolve()
          }
          request.onblocked = () => {
            window.clearTimeout(timer)
            resolve()
          }
        }).catch(() => {
          // Best-effort in init script; follow-up polling handles eventual cleanup.
        })
      }

      await deleteDatabaseOnce()

      if (typeof indexedDB.databases === 'function') {
        for (let attempt = 0; attempt < pollAttempts; attempt++) {
          const databases = await indexedDB.databases().catch(() => [])
          const cacheDb = databases.find((database) => database.name === cacheDbName)
          if (!cacheDb) {
            break
          }
          await deleteDatabaseOnce()
          await new Promise((resolve) => window.setTimeout(resolve, pollIntervalMs))
        }
      }
    },
    {
      cacheDbName: CACHE_DB_NAME,
      keepLocalStorageKeys: [...COLD_BATCH_KEEP_LOCAL_STORAGE_KEYS],
      resetWindowName: COLD_BATCH_RESET_WINDOW_NAME,
      timeoutMs: STORAGE_CLEANUP_TIMEOUT_MS,
      pollIntervalMs: STORAGE_CLEANUP_POLL_INTERVAL_MS,
      pollAttempts: STORAGE_CLEANUP_POLL_ATTEMPTS,
    }
  )
}

export async function clearColdBatchStorage(page: Page): Promise<void> {
  // window.name survives full navigations and gives the init script a one-shot
  // signal without stacking per-batch addInitScript handlers.
  await page.evaluate((resetWindowName: string) => {
    window.name = resetWindowName
  }, COLD_BATCH_RESET_WINDOW_NAME)
}
