import type { Page } from '@playwright/test'
import {
  MIN_CONTENT_TEXT_LENGTH,
  MONITOR_POLL_INTERVAL_MS,
  WARM_GRACE_SNAPSHOTS,
  CRITERION_I_EARLY_SNAPSHOTS,
  type CardStateSnapshot,
  type CriterionResult,
  type CriterionStatus,
} from '../loading-constants'

// ---------------------------------------------------------------------------
// Criterion evaluators
// ---------------------------------------------------------------------------

export function checkCriterionA(
  cardId: string,
  cardType: string,
  history: CardStateSnapshot[]
): CriterionResult {
  // Loading phase should NOT have demo badge or yellow border
  const loadingSnapshots = history.filter((s) => s.dataEffectiveLoading === 'true')
  if (loadingSnapshots.length === 0) {
    return { criterion: 'a', status: 'skip', details: 'No loading snapshots captured' }
  }

  const violations = loadingSnapshots.filter((s) => s.hasDemoBadge || s.hasYellowBorder)
  if (violations.length === 0) {
    return { criterion: 'a', status: 'pass', details: `${loadingSnapshots.length} loading snapshots, all clean` }
  }

  const pct = Math.round((violations.length / loadingSnapshots.length) * 100)
  return {
    criterion: 'a',
    status: 'fail',
    details: `${violations.length}/${loadingSnapshots.length} loading snapshots showed demo indicators (${pct}%)`,
  }
}

export function checkCriterionB(
  cardId: string,
  cardType: string,
  history: CardStateSnapshot[]
): CriterionResult {
  // Refresh icon should spin during loading
  const loadingSnapshots = history.filter((s) => s.dataEffectiveLoading === 'true')
  if (loadingSnapshots.length === 0) {
    return { criterion: 'b', status: 'skip', details: 'No loading snapshots captured' }
  }

  const spinning = loadingSnapshots.filter((s) => s.hasSpinningRefresh)
  if (spinning.length > 0) {
    return {
      criterion: 'b',
      status: 'pass',
      details: `${spinning.length}/${loadingSnapshots.length} loading snapshots had spinning refresh`,
    }
  }

  return {
    criterion: 'b',
    status: 'fail',
    details: `No spinning refresh icon detected during ${loadingSnapshots.length} loading snapshots`,
  }
}

export function checkCriterionC(
  cardId: string,
  cardType: string,
  sseUrls: string[]
): CriterionResult {
  // Check if SSE stream requests were made (some cards use REST only)
  if (sseUrls.length > 0) {
    return { criterion: 'c', status: 'pass', details: `${sseUrls.length} SSE stream requests observed` }
  }
  return {
    criterion: 'c',
    status: 'warn',
    details: 'No SSE /stream requests detected — card may use REST only',
  }
}

export function checkCriterionD(
  cardId: string,
  cardType: string,
  history: CardStateSnapshot[]
): CriterionResult {
  // Transition: loading → content (data-loading goes from true to false, text > threshold)
  const hadLoading = history.some((s) => s.dataLoading === 'true')
  const hadContent = history.some(
    (s) => s.dataLoading === 'false' && (s.textContentLength > MIN_CONTENT_TEXT_LENGTH || s.hasVisualContent)
  )

  if (!hadLoading && hadContent) {
    return { criterion: 'd', status: 'pass', details: 'Content appeared (no loading phase captured)' }
  }
  if (hadLoading && hadContent) {
    return { criterion: 'd', status: 'pass', details: 'Transitioned from loading skeleton to content' }
  }
  if (hadLoading && !hadContent) {
    return { criterion: 'd', status: 'fail', details: 'Loading skeleton appeared but no content followed' }
  }
  return { criterion: 'd', status: 'skip', details: 'No loading or content snapshots captured' }
}

export function checkCriterionE(
  cardId: string,
  cardType: string,
  history: CardStateSnapshot[]
): CriterionResult {
  // After first content, refresh icon should still spin during incremental load
  const firstContentIdx = history.findIndex(
    (s) => s.dataLoading === 'false' && (s.textContentLength > MIN_CONTENT_TEXT_LENGTH || s.hasVisualContent)
  )
  if (firstContentIdx === -1) {
    return { criterion: 'e', status: 'skip', details: 'No content phase captured' }
  }

  // Look for spinning refresh in post-content snapshots (incremental refresh)
  const postContent = history.slice(firstContentIdx)
  const hasSpinner = postContent.some((s) => s.hasSpinningRefresh && s.textContentLength > MIN_CONTENT_TEXT_LENGTH)
  if (hasSpinner) {
    return { criterion: 'e', status: 'pass', details: 'Refresh icon animated during incremental load' }
  }
  // This is expected to skip for most cards — auto-refresh timer is 15s+
  return {
    criterion: 'e',
    status: 'skip',
    details: 'No incremental refresh observed (auto-refresh timer not triggered within test window)',
  }
}

export async function checkCriterionF(page: Page): Promise<CriterionResult> {
  // Check all persistent cache stores: localStorage (old MCP hooks) + IndexedDB (new cache system)
  const cacheInfo = await page.evaluate(() => {
    // Check localStorage for cache entries from old MCP hooks and new cache metadata
    let localStorageCount = 0
    const cacheKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      if (
        key.includes('cache') ||
        key.includes('kubestellar-') ||
        key.startsWith('kc-') ||
        key.startsWith('cache:')
      ) {
        localStorageCount++
        cacheKeys.push(key)
      }
    }

    // Check IndexedDB
    return new Promise<{ localStorageCount: number; idbCount: number; cacheKeys: string[] }>((resolve) => {
      try {
        const req = indexedDB.open('kc_cache')
        req.onsuccess = () => {
          try {
            const db = req.result
            const storeNames = Array.from(db.objectStoreNames)
            if (storeNames.length === 0) {
              db.close()
              resolve({ localStorageCount, idbCount: 0, cacheKeys })
              return
            }
            const tx = db.transaction(storeNames, 'readonly')
            let total = 0
            let done = 0
            for (const store of storeNames) {
              const countReq = tx.objectStore(store).count()
              countReq.onsuccess = () => {
                total += countReq.result
                done++
                if (done === storeNames.length) {
                  db.close()
                  resolve({ localStorageCount, idbCount: total, cacheKeys })
                }
              }
              countReq.onerror = () => {
                done++
                if (done === storeNames.length) {
                  db.close()
                  resolve({ localStorageCount, idbCount: total, cacheKeys })
                }
              }
            }
          } catch (error) { console.error('Error:', error)
            resolve({ localStorageCount, idbCount: 0, cacheKeys  })
          }
        }
        req.onerror = () => resolve({ localStorageCount, idbCount: 0, cacheKeys })
      } catch (error) { console.error('Error:', error)
        resolve({ localStorageCount, idbCount: 0, cacheKeys  })
      }
    })
  })

  const total = cacheInfo.localStorageCount + cacheInfo.idbCount
  if (total > 0) {
    return {
      criterion: 'f',
      status: 'pass',
      details: `Cache: ${cacheInfo.localStorageCount} localStorage + ${cacheInfo.idbCount} IndexedDB entries`,
    }
  }
  return { criterion: 'f', status: 'fail', details: 'No persistent cache entries found in localStorage or IndexedDB' }
}

export function checkCriterionG(
  cardId: string,
  cardType: string,
  warmHistory: CardStateSnapshot[]
): CriterionResult {
  // On warm return: cached data should appear within 500ms (grace period for async cache hydration)
  if (warmHistory.length === 0) {
    return { criterion: 'g', status: 'skip', details: 'No warm return snapshots captured' }
  }

  // Allow a brief grace period for async cache hydration (SQLite Worker init, localStorage parse)
  const earlyHistory = warmHistory.slice(0, Math.min(WARM_GRACE_SNAPSHOTS, warmHistory.length))

  // Find first snapshot with content and no skeleton within the grace period
  const firstContentIdx = earlyHistory.findIndex(
    (s) => (s.textContentLength > MIN_CONTENT_TEXT_LENGTH || s.hasVisualContent) && !s.hasLargeSkeleton
  )

  if (firstContentIdx === 0) {
    return { criterion: 'g', status: 'pass', details: 'Cached data loaded immediately, no skeleton phase' }
  }
  if (firstContentIdx > 0 && firstContentIdx < WARM_GRACE_SNAPSHOTS) {
    const ms = firstContentIdx * MONITOR_POLL_INTERVAL_MS
    return { criterion: 'g', status: 'pass', details: `Cached data appeared after ${ms}ms (within grace period)` }
  }

  // Check if content appeared outside the grace period
  const laterIdx = warmHistory.findIndex(
    (s) => (s.textContentLength > MIN_CONTENT_TEXT_LENGTH || s.hasVisualContent) && !s.hasLargeSkeleton
  )
  if (laterIdx >= 0) {
    const ms = laterIdx * MONITOR_POLL_INTERVAL_MS
    return {
      criterion: 'g',
      status: 'warn',
      details: `Cached data appeared after ${ms}ms (outside ${WARM_GRACE_SNAPSHOTS * MONITOR_POLL_INTERVAL_MS}ms grace period)`,
    }
  }

  const first = warmHistory[0]
  return {
    criterion: 'g',
    status: 'fail',
    details: `First snapshot: text=${first.textContentLength} chars, skeleton=${first.hasLargeSkeleton}, loading=${first.dataLoading}`,
  }
}

export function checkCriterionH(
  cardId: string,
  cardType: string,
  warmHistory: CardStateSnapshot[]
): CriterionResult {
  // Cached data maintained throughout warm return — no regressions to skeleton
  if (warmHistory.length === 0) {
    return { criterion: 'h', status: 'skip', details: 'No warm return snapshots captured' }
  }

  const contentSnapshots = warmHistory.filter(
    (s) => s.textContentLength > MIN_CONTENT_TEXT_LENGTH || s.hasVisualContent
  )
  const skeletonSnapshots = warmHistory.filter((s) => s.hasLargeSkeleton)

  if (contentSnapshots.length === warmHistory.length) {
    return { criterion: 'h', status: 'pass', details: 'Content stable throughout warm return' }
  }
  if (contentSnapshots.length > 0 && skeletonSnapshots.length === 0) {
    return { criterion: 'h', status: 'pass', details: 'Content present, no skeleton regression' }
  }

  const demoBadges = warmHistory.filter((s) => s.hasDemoBadge)
  if (demoBadges.length > 0) {
    return {
      criterion: 'h',
      status: 'fail',
      details: `${demoBadges.length}/${warmHistory.length} warm snapshots showed demo badge`,
    }
  }

  return {
    criterion: 'h',
    status: 'warn',
    details: `${contentSnapshots.length}/${warmHistory.length} snapshots had content, ${skeletonSnapshots.length} had skeleton`,
  }
}

export function checkCriterionI(
  cardId: string,
  cardType: string,
  history: CardStateSnapshot[]
): CriterionResult {
  // On cold start with cleared caches, the first snapshot should be
  // skeleton/loading — NOT demo data.  If the first snapshot has content +
  // demo badge + data-loading="false", `initialData` was set to demo data
  // (bypassing the loading→content transition entirely).
  if (history.length === 0) {
    return { criterion: 'i', status: 'skip', details: 'No snapshots captured' }
  }

  const first = history[0]
  const hasContent = first.textContentLength > MIN_CONTENT_TEXT_LENGTH || first.hasVisualContent

  if (first.hasDemoBadge && hasContent && first.dataLoading === 'false') {
    return {
      criterion: 'i',
      status: 'fail',
      details: `First snapshot already has demo content (${first.textContentLength} chars) with demo badge — initialData likely set to demo data`,
    }
  }

  // Also check early snapshots (within first ~200ms / 4 polls) for same pattern
  const earlySnapshots = history.slice(0, Math.min(CRITERION_I_EARLY_SNAPSHOTS, history.length))
  const earlyDemoFlash = earlySnapshots.find(
    (s) => s.hasDemoBadge && (s.textContentLength > MIN_CONTENT_TEXT_LENGTH || s.hasVisualContent) && s.dataLoading === 'false'
  )
  if (earlyDemoFlash) {
    return {
      criterion: 'i',
      status: 'fail',
      details: `Demo data appeared within first ${CRITERION_I_EARLY_SNAPSHOTS * MONITOR_POLL_INTERVAL_MS}ms (${earlyDemoFlash.textContentLength} chars) — initialData likely set to demo data`,
    }
  }

  if (hasContent && first.dataLoading === 'false' && !first.hasDemoBadge) {
    // Content without demo badge on first snapshot — could be from localStorage cache, OK
    return { criterion: 'i', status: 'pass', details: 'First snapshot has content without demo badge (likely cached)' }
  }

  return { criterion: 'i', status: 'pass', details: 'First snapshot shows loading/skeleton as expected' }
}

export function deriveOverallStatus(criteria: Record<string, CriterionResult>): CriterionStatus {
  const statuses = Object.values(criteria).map((r) => r.status)
  if (statuses.includes('fail')) return 'fail'
  if (statuses.includes('warn')) return 'warn'
  if (statuses.every((s) => s === 'skip')) return 'skip'
  return 'pass'
}
