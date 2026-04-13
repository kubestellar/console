/**
 * UX assertion helpers for Playwright tests.
 *
 * These go beyond "does it work?" to ask "is the experience good?" —
 * checking layout overflow, focus visibility, load times, and touch
 * target sizes. Used by the user-flows/ test suite to surface UX
 * improvement opportunities.
 */

import { type Page, type Locator, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum touch target size per WCAG 2.5.8 (px). */
const MIN_TOUCH_TARGET_PX = 44

/** Default max load time for assertLoadTime (ms). */
const DEFAULT_MAX_LOAD_MS = 3_000

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * Assert that the element (or page body) has no horizontal overflow.
 * Catches content that bleeds outside the viewport on small screens.
 */
export async function assertNoLayoutOverflow(page: Page, selector = 'body') {
  const overflow = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return { overflows: false, scrollWidth: 0, clientWidth: 0 }
    return {
      overflows: el.scrollWidth > el.clientWidth,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }
  }, selector)

  expect(overflow.overflows, `Layout overflow on "${selector}": scrollWidth=${overflow.scrollWidth} > clientWidth=${overflow.clientWidth}`).toBe(false)
}

/**
 * Assert that no element with the given selector escapes the viewport bounds.
 * Returns the first offending element's bounding box for debugging.
 */
export async function assertWithinViewport(page: Page, selector: string) {
  const viewport = page.viewportSize()
  if (!viewport) return

  const offenders = await page.evaluate(({ sel, vw, vh }) => {
    const els = document.querySelectorAll(sel)
    const bad: Array<{ tag: string; rect: DOMRect }> = []
    for (const el of els) {
      const rect = el.getBoundingClientRect()
      if (rect.right > vw || rect.bottom > vh || rect.left < 0 || rect.top < 0) {
        bad.push({ tag: `${el.tagName}.${el.className}`, rect })
      }
    }
    return bad.slice(0, 3) // limit to first 3 for readability
  }, { sel: selector, vw: viewport.width, vh: viewport.height })

  expect(offenders, `Elements escaping viewport: ${JSON.stringify(offenders)}`).toHaveLength(0)
}

// ---------------------------------------------------------------------------
// Focus & Accessibility
// ---------------------------------------------------------------------------

/**
 * Assert that the currently focused element has a visible focus indicator.
 * Checks for outline, box-shadow, or border change on :focus-visible.
 */
export async function assertFocusVisible(page: Page) {
  const hasIndicator = await page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return true // nothing focused — not a failure
    const styles = window.getComputedStyle(el)
    const outline = styles.outlineStyle
    const boxShadow = styles.boxShadow
    // Has a visible outline (not 'none') or a non-trivial box-shadow
    return (outline !== 'none' && outline !== '') || (boxShadow !== 'none' && boxShadow !== '')
  })

  expect(hasIndicator, 'Focused element has no visible focus indicator (outline or box-shadow)').toBe(true)
}

/**
 * Assert that a specific element meets the minimum touch target size.
 * Per WCAG 2.5.8, interactive elements should be at least 44×44px.
 */
export async function assertTouchTargetSize(locator: Locator, minPx = MIN_TOUCH_TARGET_PX) {
  const box = await locator.boundingBox()
  expect(box, 'Element not visible — cannot measure touch target').not.toBeNull()
  if (!box) return

  expect(box.width, `Touch target width ${box.width}px < ${minPx}px minimum`).toBeGreaterThanOrEqual(minPx)
  expect(box.height, `Touch target height ${box.height}px < ${minPx}px minimum`).toBeGreaterThanOrEqual(minPx)
}

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

/**
 * Assert that a target element becomes visible within maxMs after navigation.
 * Returns the actual load time for reporting.
 */
export async function assertLoadTime(
  page: Page,
  targetSelector: string,
  maxMs = DEFAULT_MAX_LOAD_MS,
): Promise<number> {
  const start = Date.now()
  await page.locator(targetSelector).first().waitFor({ state: 'visible', timeout: maxMs })
  const elapsed = Date.now() - start

  expect(elapsed, `Load time ${elapsed}ms exceeds ${maxMs}ms for "${targetSelector}"`).toBeLessThanOrEqual(maxMs)
  return elapsed
}

// ---------------------------------------------------------------------------
// Console errors
// ---------------------------------------------------------------------------

/**
 * Collect unexpected console errors during a test. Returns a cleanup
 * function that asserts no unexpected errors were logged.
 *
 * Usage:
 *   const checkErrors = collectConsoleErrors(page)
 *   // ... test actions ...
 *   checkErrors() // throws if unexpected errors found
 */
export function collectConsoleErrors(page: Page): () => void {
  const EXPECTED = [
    /Failed to fetch/i,
    /WebSocket/i,
    /ResizeObserver/i,
    /ChunkLoadError/i,
    /Loading chunk/i,
    /demo-token/i,
    /localhost:8585/i,
    /127\.0\.0\.1:8585/i,
    /ERR_CONNECTION_REFUSED/i,
    /net::ERR_/i,
    /502.*Bad Gateway/i,
    /Failed to load resource/i,
    /Cross-Origin Request Blocked/i,
    /CORS policy/i,
    // Narrowed: only allow Access-Control errors from known demo/local origins
    // to avoid masking unrelated issues that mention this header.
    /Access-Control-Allow-Origin.*localhost/i,
    /Access-Control-Allow-Origin.*127\.0\.0\.1/i,
    /Access-Control-Allow-Origin.*kubestellar\.io/i,
    /Notification permission/i,
    /validateDOMNesting/i,
    /act\(\)/i,
    /Cannot read.*undefined/i,
    /hydrat/i,
    /OPFS/i,
    /IndexedDB/i,
    /sqlite/i,
    /SharedArrayBuffer/i,
    /Atomics/i,
    /service.worker/i,
    /workbox/i,
  ]

  const unexpected: string[] = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      if (!EXPECTED.some((p) => p.test(text))) {
        unexpected.push(text)
      }
    }
  })

  return () => {
    expect(unexpected, `Unexpected console errors:\n${unexpected.join('\n')}`).toHaveLength(0)
  }
}
