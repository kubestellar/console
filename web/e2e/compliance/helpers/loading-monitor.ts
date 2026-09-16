import type { Page } from '@playwright/test'
import { MONITOR_POLL_INTERVAL_MS, MONITOR_STOP_MAX_RETRIES, MONITOR_STOP_RETRY_DELAY_MS, type CardStateSnapshot } from '../loading-constants'

// ---------------------------------------------------------------------------
// Compliance monitor — injected into the page
// ---------------------------------------------------------------------------

export async function startComplianceMonitor(page: Page, cardIds: string[]) {
  await page.evaluate(
    ({ ids, pollInterval }: { ids: string[]; pollInterval: number }) => {
      type Snapshot = {
        timestamp: number
        dataLoading: string | null
        dataEffectiveLoading: string | null
        hasDemoBadge: boolean
        hasYellowBorder: boolean
        hasLargeSkeleton: boolean
        hasSpinningRefresh: boolean
        textContentLength: number
        hasVisualContent: boolean
      }

      const win = window as Window & {
        __COMPLIANCE_MONITOR__?: {
          cardHistory: Record<string, Snapshot[]>
          running: boolean
          intervalId: number
        }
      }

      const cardHistory: Record<string, Snapshot[]> = {}
      for (const id of ids) cardHistory[id] = []

      function snapshot() {
        const now = performance.now()
        for (const id of ids) {
          const card = document.querySelector(`[data-card-id="${id}"]`)
          if (!card) continue

          const snap: Snapshot = {
            timestamp: now,
            dataLoading: card.getAttribute('data-loading'),
            dataEffectiveLoading: card.getAttribute('data-effective-loading'),
            hasDemoBadge: !!card.querySelector('[data-testid="demo-badge"]'),
            hasYellowBorder: card.className.includes('border-yellow-500'),
            hasLargeSkeleton: false,
            hasSpinningRefresh: !!card.querySelector('svg.animate-spin'),
            textContentLength: (card.textContent || '').trim().length,
            hasVisualContent: !!card.querySelector('canvas,svg,iframe,table,img,video,pre,code,[role="img"]'),
          }

          // Check for CardWrapper skeleton overlay (precise attribute — ignores card-internal animate-pulse decorations)
          if (card.querySelector('[data-card-skeleton="true"]')) {
            snap.hasLargeSkeleton = true
          }

          cardHistory[id].push(snap)
        }
      }

      const intervalId = window.setInterval(snapshot, pollInterval)
      // Take an immediate first snapshot
      snapshot()

      win.__COMPLIANCE_MONITOR__ = { cardHistory, running: true, intervalId }
    },
    { ids: cardIds, pollInterval: MONITOR_POLL_INTERVAL_MS }
  )
}

export async function stopComplianceMonitor(page: Page): Promise<Record<string, CardStateSnapshot[]>> {
  for (let attempt = 0; attempt < MONITOR_STOP_MAX_RETRIES; attempt++) {
    try {
      return await page.evaluate(() => {
        const win = window as Window & {
          __COMPLIANCE_MONITOR__?: {
            cardHistory: Record<string, unknown[]>
            running: boolean
            intervalId: number
          }
        }
        const monitor = win.__COMPLIANCE_MONITOR__
        if (!monitor) return {}
        clearInterval(monitor.intervalId)
        monitor.running = false
        return monitor.cardHistory as Record<string, CardStateSnapshot[]>
      })
    } catch (err) {
      // Execution context can be destroyed if a navigation is still settling
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Execution context') && attempt < MONITOR_STOP_MAX_RETRIES - 1) {
        console.log(`  [stopComplianceMonitor] context destroyed, retrying (${attempt + 1}/${MONITOR_STOP_MAX_RETRIES})...`)
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(MONITOR_STOP_RETRY_DELAY_MS)
        continue
      }
      console.log(`  [stopComplianceMonitor] failed: ${msg}`)
      return {}
    }
  }
  return {}
}
