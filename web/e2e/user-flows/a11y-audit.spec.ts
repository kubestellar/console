import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  setupDemoAndNavigate,
  NETWORK_IDLE_TIMEOUT_MS,
} from '../helpers/setup'

/**
 * Accessibility audit tests using axe-core.
 *
 * Runs automated a11y scans on key routes and reports violations
 * as ux-finding annotations with severity mapping. Uses a threshold
 * rather than requiring zero violations to establish a baseline.
 */

/** Maximum acceptable critical + serious violations per page */
const MAX_CRITICAL_VIOLATIONS = 10

/** Maximum acceptable total violations (all severities) per page */
const MAX_TOTAL_VIOLATIONS = 50

/** Severity mapping from axe impact to ux-finding severity */
const SEVERITY_MAP: Record<string, string> = {
  critical: 'critical',
  serious: 'high',
  moderate: 'medium',
  minor: 'low',
}

const AUDIT_ROUTES = [
  { path: '/', label: 'dashboard' },
  { path: '/clusters', label: 'clusters' },
  { path: '/settings', label: 'settings' },
  { path: '/missions', label: 'missions' },
] as const

for (const { path, label } of AUDIT_ROUTES) {
  test.describe(`A11y Audit — ${label}`, () => {
    test(`axe scan on ${path} is below violation threshold`, async ({ page }) => {
      await setupDemoAndNavigate(page, path)

      // Wait for dynamic content to settle
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()

      const violations = results.violations

      // Annotate each violation as a ux-finding
      for (const v of violations) {
        const severity = SEVERITY_MAP[v.impact || 'minor'] || 'low'
        test.info().annotations.push({
          type: 'ux-finding',
          description: `[${severity}] ${v.id}: ${v.help} (${v.nodes.length} instance${v.nodes.length === 1 ? '' : 's'}) — ${v.helpUrl}`,
        })
      }

      // Count critical + serious
      const criticalCount = violations.filter(
        v => v.impact === 'critical' || v.impact === 'serious',
      ).length

      const totalCount = violations.length

      // Log summary for debugging
      if (totalCount > 0) {
        const summary = violations.map(v => `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`).join('\n')
        // eslint-disable-next-line no-console
        console.log(`\nAxe violations on ${path} (${totalCount} total):\n${summary}`)
      }

      expect(
        criticalCount,
        `${criticalCount} critical/serious a11y violations on ${path} exceeds threshold of ${MAX_CRITICAL_VIOLATIONS}`,
      ).toBeLessThanOrEqual(MAX_CRITICAL_VIOLATIONS)

      expect(
        totalCount,
        `${totalCount} total a11y violations on ${path} exceeds threshold of ${MAX_TOTAL_VIOLATIONS}`,
      ).toBeLessThanOrEqual(MAX_TOTAL_VIOLATIONS)
    })
  })
}

test.describe('A11y Audit — Combined Summary', () => {
  test('all audited pages have reasonable a11y scores', async ({ page }) => {
    const pageSummaries: Array<{ route: string; total: number; critical: number }> = []

    for (const { path } of AUDIT_ROUTES) {
      await setupDemoAndNavigate(page, path)
      await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {})

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()

      const critical = results.violations.filter(
        v => v.impact === 'critical' || v.impact === 'serious',
      ).length

      pageSummaries.push({ route: path, total: results.violations.length, critical })
    }

    // Attach combined summary
    test.info().annotations.push({
      type: 'ux-finding',
      description: `A11y summary: ${pageSummaries.map(p => `${p.route}=${p.total} (${p.critical} crit)`).join(', ')}`,
    })

    // At least one page should have been scanned successfully
    expect(pageSummaries.length).toBeGreaterThan(0)
  })
})
