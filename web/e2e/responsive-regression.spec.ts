import { test, expect, Page } from '@playwright/test'

/**
 * Responsive Breakpoint Regression Tests
 *
 * Validates that key pages render correctly at standard viewport widths.
 * Catches regressions like:
 * - #2982: Tutorial invisible at certain widths
 * - #2999: CI doesn't test all allowed browser widths
 * - #3035: Button overlap in modal at specific widths
 *
 * Run with: npx playwright test e2e/responsive-regression.spec.ts
 */

const VIEWPORTS = [
  { width: 375, height: 812, name: 'mobile' },
  { width: 768, height: 1024, name: 'tablet' },
  { width: 1024, height: 768, name: 'laptop' },
  { width: 1440, height: 900, name: 'desktop' },
]

/** Tolerance in pixels when checking element right-edge overflow. */
const OVERFLOW_TOLERANCE_PX = 5
/** Timeout (ms) for root element visibility. */
const ROOT_VISIBLE_TIMEOUT_MS = 10_000
/** Minimum body text length to consider the page non-blank. */
const MIN_BODY_TEXT_LEN = 20
/** Timeout (ms) for hamburger/sidebar-toggle visibility probe. */
const MOBILE_NAV_PROBE_TIMEOUT_MS = 5_000
/** Max viewport width (px) below which mobile/hamburger nav is expected. */
const MOBILE_NAV_MAX_WIDTH_PX = 1024

const KEY_ROUTES = [
  { path: '/', name: 'Dashboard' },
  { path: '/clusters', name: 'Clusters' },
  { path: '/settings', name: 'Settings' },
  { path: '/deploy', name: 'Deploy' },
  { path: '/security', name: 'Security' },
]

async function setupDemoMode(page: Page) {
  // Seed localStorage BEFORE any page script runs so the auth guard sees
  // the token on first execution. page.evaluate() runs after the page has
  // already parsed and executed scripts, which is too late for webkit/Safari
  // where the auth redirect fires synchronously on script evaluation.
  // page.addInitScript() injects the snippet ahead of any page code (#9096).
  await page.addInitScript(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
  })
}

test.describe('Responsive Breakpoint Tests', () => {
  for (const viewport of VIEWPORTS) {
    test.describe(`${viewport.name} (${viewport.width}x${viewport.height})`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await setupDemoMode(page)
      })

      for (const route of KEY_ROUTES) {
        test(`${route.name} page renders without overflow or blank areas`, async ({ page }) => {
          await page.goto(route.path)
          await page.waitForLoadState('domcontentloaded')

          // Root should be visible
          const root = page.locator('#root')
          await expect(root).toBeVisible({ timeout: ROOT_VISIBLE_TIMEOUT_MS })

          // Page should have meaningful content
          const bodyText = await page.textContent('body')
          expect(
            bodyText?.length,
            `${route.path} at ${viewport.name}: blank or near-empty page`
          ).toBeGreaterThan(MIN_BODY_TEXT_LEN)

          // Check for horizontal overflow (a common responsive bug)
          const hasOverflow = await page.evaluate(() => {
            return document.documentElement.scrollWidth > document.documentElement.clientWidth
          })

          // Horizontal overflow is a warning, not a hard failure (some pages may intentionally scroll)
          if (hasOverflow) {
            console.warn(
              `${route.path} at ${viewport.name}: horizontal overflow detected ` +
              `(scrollWidth > clientWidth)`
            )
          }

          // Verify no VISIBLE elements extend beyond viewport width (regression #3035).
          // Skip elements that are intentionally off-canvas (display:none,
          // visibility:hidden, aria-hidden, or inside a hidden/closed
          // dialog/drawer) — those are not user-visible overflow. #9877
          const overflowingElements = await page.evaluate(
            ({ vw, tolerance }: { vw: number; tolerance: number }) => {
              const elements = document.querySelectorAll('button, .modal, [role="dialog"], nav')
              const overflowing: string[] = []
              elements.forEach((el) => {
                const htmlEl = el as HTMLElement
                const style = window.getComputedStyle(htmlEl)
                // Skip non-visible elements: they cannot cause user-visible overflow.
                if (
                  style.display === 'none' ||
                  style.visibility === 'hidden' ||
                  style.opacity === '0' ||
                  htmlEl.hidden ||
                  htmlEl.getAttribute('aria-hidden') === 'true'
                ) {
                  return
                }
                // Skip elements inside a closed/hidden dialog or drawer.
                if (htmlEl.closest('[aria-hidden="true"], [hidden], [data-state="closed"]')) {
                  return
                }
                const rect = htmlEl.getBoundingClientRect()
                // Zero-sized elements can't be visually overflowing.
                if (rect.width === 0 || rect.height === 0) {
                  return
                }
                if (rect.right > vw + tolerance) {
                  overflowing.push(
                    `${el.tagName}.${el.className?.split(' ')[0] || ''} (right: ${Math.round(rect.right)}px)`
                  )
                }
              })
              return overflowing
            },
            { vw: viewport.width, tolerance: OVERFLOW_TOLERANCE_PX }
          )

          expect(
            overflowingElements,
            `Elements overflow viewport at ${viewport.name}: ${overflowingElements.join(', ')}`
          ).toHaveLength(0)
        })
      }

      // Navigation should be accessible at all widths
      test('navigation is accessible', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('domcontentloaded')

        // At mobile/tablet, expect a hamburger or sidebar toggle
        if (viewport.width < MOBILE_NAV_MAX_WIDTH_PX) {
          const mobileNav = page.locator('[data-testid="mobile-menu-toggle"]')
            .or(page.locator('button[aria-label*="menu" i]'))
            .or(page.locator('[data-testid="sidebar-toggle"]'))

          const hasHamburger = await mobileNav.first().isVisible({ timeout: MOBILE_NAV_PROBE_TIMEOUT_MS }).catch(() => false)

          // Either hamburger menu is present OR nav items are visible
          if (!hasHamburger) {
            const navItems = page.locator('nav a, nav button')
            const navCount = await navItems.count()
            expect(
              navCount,
              `No navigation accessible at ${viewport.name} viewport`
            ).toBeGreaterThan(0)
          }
        } else {
          // On larger viewports, main nav should be visible
          const nav = page.locator('nav')
          await expect(nav.first()).toBeVisible({ timeout: MOBILE_NAV_PROBE_TIMEOUT_MS })
        }
      })
    })
  }
})
