import { type Page, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Timeout constants — named values for all numeric literals
// ---------------------------------------------------------------------------

/** Maximum wait for page to reach networkidle state */
export const NETWORK_IDLE_TIMEOUT_MS = 15_000

/** Maximum wait for a single element to become visible */
export const ELEMENT_VISIBLE_TIMEOUT_MS = 10_000

/** Maximum wait for page initial load (domcontentloaded + first paint) */
export const PAGE_LOAD_TIMEOUT_MS = 10_000

/** Timeout for modal/dialog appearance */
export const MODAL_TIMEOUT_MS = 5_000

/** Timeout for navigation to complete */
export const NAV_TIMEOUT_MS = 15_000

export async function waitForAppContent(
  page: Page,
  timeoutMs: number = ELEMENT_VISIBLE_TIMEOUT_MS,
) {
  await page.locator('#root').waitFor({ state: 'visible', timeout: timeoutMs })
  await page.waitForFunction(
    () => (document.body.innerText || '').trim().length > 0,
    { timeout: timeoutMs },
  ).catch(() => {
    // Some error-state routes intentionally render late; callers with stricter
    // expectations assert their route-specific markers after this best-effort wait.
  })
}

// ---------------------------------------------------------------------------
// Best-effort networkidle wait — logs a warning on timeout instead of
// silently swallowing the error. The dashboard has long-lived WebSocket/SSE
// connections so `networkidle` almost never settles; callers should prefer
// `domcontentloaded` + waiting on a specific UI element when possible.
// See #9082.
// ---------------------------------------------------------------------------

export async function waitForNetworkIdleBestEffort(
  page: Page,
  timeoutMs: number = NETWORK_IDLE_TIMEOUT_MS,
  label?: string
) {
  try {
    await page.waitForLoadState('networkidle', { timeout: timeoutMs })
  } catch (error) { console.error('Error:', error)
    if (typeof process !== 'undefined' && process.env.E2E_VERBOSE_WAITS) {
      console.warn(
        `[e2e] networkidle timed out after ${timeoutMs }ms${label ? ` (${label})` : ''} — page may have long-lived WebSocket/SSE connections`
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Wait for sub-route page — DashboardPage routes use dashboard-header testid
// ---------------------------------------------------------------------------

export async function waitForSubRoute(page: Page) {
  await expect(page.getByTestId('dashboard-header')).toBeVisible({
    timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
  })
}


export async function waitForWorkloadsReady(
  page: Page,
  timeoutMs: number = ELEMENT_VISIBLE_TIMEOUT_MS,
) {
  await waitForSubRoute(page)
  await expect(page.getByTestId('dashboard-title')).toContainText('Workloads', {
    timeout: timeoutMs,
  })
  await page.waitForFunction(
    () => {
      const hasHydratedList = Boolean(document.querySelector('[data-testid="workloads-list"]'))
      const hasEmptyState = Boolean(document.querySelector('[data-testid="workloads-empty-state"]'))
      const hasClustersOverview = Boolean(document.querySelector('[data-testid="clusters-overview-grid"]'))
      const isStillLoading = Boolean(document.querySelector('[data-testid="workloads-loading-state"]'))
      return (hasHydratedList || hasEmptyState) && hasClustersOverview && !isStillLoading
    },
    { timeout: timeoutMs }
  )
}

// ---------------------------------------------------------------------------
// Wait for main dashboard — the / route uses dashboard-page testid
// ---------------------------------------------------------------------------

export async function waitForDashboard(page: Page) {
  await expect(page.getByTestId('dashboard-page')).toBeVisible({
    timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
  })
}

/**
 * Robust page reload with Firefox-specific error recovery.
 * Firefox occasionally experiences NS_ERROR_FAILURE or NS_BINDING_ABORTED on
 * page.reload(). This helper adds retry logic and explicit wait conditions.
 */
export async function reloadPageSafely(page: Page, maxRetries: number = 3): Promise<void> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
      // Additional wait to ensure page is fully interactive
      await page.locator('#root').waitFor({ state: 'visible', timeout: 10_000 })
      return
    } catch (error) {
      lastError = error as Error
      if (attempt < maxRetries - 1) {
        // Brief pause before retry
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
  }
  if (lastError) {
    throw lastError
  }
}
