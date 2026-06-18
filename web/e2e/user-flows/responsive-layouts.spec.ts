import { test, expect } from '@playwright/test'
import {
  setupDemoAndNavigate,
} from '../helpers/setup'
import { assertNoLayoutOverflow } from '../helpers/ux-assertions'

/**
 * Responsive layout UX tests.
 *
 * Validates key routes at mobile, tablet, and desktop viewports.
 * Checks for horizontal overflow, non-blank rendering, and captures
 * screenshots for visual review.
 */

/** Minimum body text length to consider a page "not blank" */
const MIN_BODY_TEXT_LENGTH = 10
/** Maximum time to wait for route content before declaring blank render */
const CONTENT_TIMEOUT_MS = 15_000

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const

const ROUTES = ['/', '/clusters', '/settings', '/missions', '/deploy'] as const

for (const viewport of VIEWPORTS) {
  for (const route of ROUTES) {
    const routeLabel = route === '/' ? 'home' : route.replace('/', '')

    test.describe(`${viewport.name} @ ${routeLabel}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } })

      test('no horizontal overflow', async ({ page }) => {
        await setupDemoAndNavigate(page, route)

        await assertNoLayoutOverflow(page)
      })

      test('renders content (not blank)', async ({ page }) => {
        await setupDemoAndNavigate(page, route)

        await expect
          .poll(
            async () => {
              const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
              return bodyText.length
            },
            {
              timeout: CONTENT_TIMEOUT_MS,
              message: `Route "${route}" at ${viewport.name} rendered blank`,
            },
          )
          .toBeGreaterThan(MIN_BODY_TEXT_LENGTH)
      })

      test('screenshot for visual review', async ({ page }) => {
        await setupDemoAndNavigate(page, route)

        const screenshotPath = `test-results/ux/responsive-${viewport.name}-${routeLabel}.png`
        await page.screenshot({ path: screenshotPath, fullPage: false })

        // Attach for test report
        test.info().attachments.push({
          name: `${viewport.name}-${routeLabel}`,
          path: screenshotPath,
          contentType: 'image/png',
        })
      })
    })
  }
}
