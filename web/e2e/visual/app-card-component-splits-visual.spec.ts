import { test, expect } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

const VIEWPORT = { width: 1440, height: 1000 }
const CONTENT_TIMEOUT_MS = 30_000
const CARDS = [
  { type: 'pod_health_trend', content: 'select' },
  { type: 'user_management', content: '[role="tablist"]' },
  { type: 'trestle_scan', content: '[title^="Toggle "]' },
  { type: 'namespace_monitor', content: 'button' },
  { type: 'network_utils', content: 'input' },
] as const

test.use({ viewport: VIEWPORT, locale: 'en-US', timezoneId: 'Europe/Paris' })

for (const { type, content } of CARDS) {
  test(`${type} preserves its demo presentation`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-17T12:10:00Z'))
    await setupDemoMode(page)
    // Let source modules through when this spec runs against a Vite dev server.
    await page.route('**/src/**', route => route.continue())
    // Exercise the normal dashboard/card registry with one persisted placement.
    await page.addInitScript(({ type }) => {
      // Prevent demo setup from clearing these placements, regardless of init-script order.
      localStorage.setItem('kc-demo-mode', 'true')
      localStorage.setItem('kubestellar-pods-cards', JSON.stringify([
        { id: `split-${type}`, card_type: type, config: {}, position: { w: 12, h: 6 } },
      ]))
      // A fixed history avoids screenshot noise from demo chart jitter/timestamps.
      localStorage.setItem('pod-health-trend-history', JSON.stringify({
        timestamp: Date.now(),
        data: [
          { time: '12:00', healthy: 30, issues: 2, pending: 1 },
          { time: '12:05', healthy: 32, issues: 1, pending: 0 },
        ],
      }))
    }, { type })
    await page.goto('/pods')
    const card = page.locator(`[data-card-type="${type}"]`)
    await expect(card.locator(content).first()).toBeVisible({ timeout: CONTENT_TIMEOUT_MS })
    if (type === 'pod_health_trend') {
      await expect(card.locator('svg').first()).toBeVisible()
    }
    if (type === 'user_management') {
      const firstTab = card.getByRole('tab').first()
      await firstTab.focus()
      await firstTab.press('ArrowRight')
      await expect(card.getByRole('tab').nth(1)).toBeFocused()
      await expect(card.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true')
    }
    if (type === 'trestle_scan') {
      await card.locator('[title^="Toggle "]').first().click()
      await expect(card.locator('button[title*="passing" i]').last()).toBeVisible()
    }
    if (type === 'namespace_monitor') {
      await card.locator('div.cursor-pointer:has(> svg.lucide-server)').first().click()
      const namespaceRow = card.locator('div.cursor-pointer:has(> svg.lucide-layers)').first()
      await expect(namespaceRow).toBeVisible({ timeout: CONTENT_TIMEOUT_MS })
      await namespaceRow.click({ position: { x: 8, y: 10 } })
      await expect(card.locator('div.group.transition-all').first()).toBeVisible()
    }
    await card.scrollIntoViewIfNeeded()
    await test.info().attach(`${type}-page`, { body: await page.screenshot(), contentType: 'image/png' })
    await expect(card).toHaveScreenshot(`card-split-${type}.png`, {
      // Relative refresh ages are outside this refactor's presentation contract.
      mask: [card.locator('time'), card.locator('[title*="refresh" i]')],
    })
  })
}
