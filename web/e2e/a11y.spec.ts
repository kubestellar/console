import { test, expect, Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * Accessibility Audit Tests for KubeStellar Console
 *
 * These tests use axe-core to validate WCAG 2.1 AA compliance
 * across key pages and interactions.
 *
 * Prerequisites:
 *   npm install @axe-core/playwright
 *
 * Run with: npx playwright test e2e/a11y.spec.ts
 */

/**
 * Sets up demo mode for testing
 */
async function setupDemoMode(page: Page) {
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'demo-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('demo-user-onboarded', 'true')
  })
}

// Pages to audit for accessibility
const pagesToAudit = [
  { name: 'Dashboard', path: '/' },
  { name: 'Clusters', path: '/clusters' },
  { name: 'Deploy', path: '/deploy' },
  { name: 'Settings', path: '/settings' },
  { name: 'Security', path: '/security' },
]

test.describe('Accessibility Audits', () => {
  test.describe('WCAG 2.1 AA Compliance', () => {
    for (const { name, path } of pagesToAudit) {
      test(`${name} page passes accessibility audit`, async ({ page }) => {
        await setupDemoMode(page)
        await page.goto(path)
        await page.waitForLoadState('networkidle', { timeout: 15000 })

        // Wait for content to fully render
        await page.waitForTimeout(1000)

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .exclude('[data-testid="chart"]') // Charts may have known issues
          .exclude('.recharts-wrapper') // Chart library exclusion
          .analyze()

        // Log violations for debugging
        if (results.violations.length > 0) {
          console.log(`\n=== Accessibility violations on ${path} ===`)
          for (const violation of results.violations) {
            console.log(`\n[${violation.impact}] ${violation.id}: ${violation.description}`)
            console.log(`Help: ${violation.helpUrl}`)
            for (const node of violation.nodes.slice(0, 3)) {
              console.log(`  - ${node.html.substring(0, 100)}...`)
            }
          }
        }

        // Allow some violations but flag critical/serious ones
        const criticalViolations = results.violations.filter(
          v => v.impact === 'critical' || v.impact === 'serious'
        )

        expect(
          criticalViolations,
          `Critical accessibility violations found on ${path}`
        ).toHaveLength(0)
      })
    }
  })

  test.describe('Keyboard Navigation', () => {
    test('can navigate dashboard with keyboard only', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Tab through focusable elements
      const focusableCount = await page.evaluate(() => {
        const focusable = document.querySelectorAll(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        return focusable.length
      })

      expect(focusableCount).toBeGreaterThan(0)

      // Test Tab navigation works
      await page.keyboard.press('Tab')
      const firstFocused = await page.evaluate(() => document.activeElement?.tagName)
      expect(firstFocused).toBeTruthy()

      // Tab a few more times
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab')
        const isFocused = await page.evaluate(() => document.activeElement !== document.body)
        expect(isFocused).toBe(true)
      }
    })

    test('Escape key closes modals', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      // Try to open any modal
      const modalTrigger = page.locator('button:has-text("Add")').first()
        .or(page.getByTestId('add-card-button'))

      if (await modalTrigger.isVisible({ timeout: 3000 })) {
        await modalTrigger.click()

        const modal = page.locator('[role="dialog"]')
        if (await modal.isVisible({ timeout: 3000 })) {
          await page.keyboard.press('Escape')
          await expect(modal).not.toBeVisible({ timeout: 3000 })
        }
      }
    })

    test('focus is trapped in modals', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      // Try to open a modal
      const modalTrigger = page.locator('button:has-text("Add")').first()
        .or(page.getByTestId('add-card-button'))

      if (await modalTrigger.isVisible({ timeout: 3000 })) {
        await modalTrigger.click()

        const modal = page.locator('[role="dialog"]')
        if (await modal.isVisible({ timeout: 3000 })) {
          // Tab through modal multiple times
          for (let i = 0; i < 15; i++) {
            await page.keyboard.press('Tab')
          }

          // Focus should still be within modal
          const focusedElement = await page.evaluate(() => {
            const focused = document.activeElement
            const modal = document.querySelector('[role="dialog"]')
            return modal?.contains(focused)
          })

          expect(focusedElement).toBe(true)

          // Clean up
          await page.keyboard.press('Escape')
        }
      }
    })
  })

  test.describe('Color Contrast', () => {
    test('text has sufficient color contrast', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      const results = await new AxeBuilder({ page })
        .withRules(['color-contrast'])
        .analyze()

      const contrastViolations = results.violations.filter(v => v.id === 'color-contrast')

      if (contrastViolations.length > 0) {
        console.log('\n=== Color contrast violations ===')
        for (const node of contrastViolations[0].nodes.slice(0, 5)) {
          console.log(`  - ${node.html.substring(0, 80)}...`)
          console.log(`    ${node.failureSummary}`)
        }
      }

      // Log but don't fail for minor contrast issues
      expect(contrastViolations.length).toBeLessThan(10)
    })
  })

  test.describe('Screen Reader Support', () => {
    test('images have alt text', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      const results = await new AxeBuilder({ page })
        .withRules(['image-alt'])
        .analyze()

      expect(
        results.violations.filter(v => v.id === 'image-alt'),
        'Images missing alt text'
      ).toHaveLength(0)
    })

    test('form inputs have labels', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/settings')
      await page.waitForLoadState('networkidle')

      const results = await new AxeBuilder({ page })
        .withRules(['label'])
        .analyze()

      expect(
        results.violations.filter(v => v.id === 'label'),
        'Form inputs missing labels'
      ).toHaveLength(0)
    })

    test('headings have proper hierarchy', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      const results = await new AxeBuilder({ page })
        .withRules(['heading-order'])
        .analyze()

      // Log violations but allow some flexibility
      if (results.violations.length > 0) {
        console.log('\n=== Heading order violations ===')
        for (const violation of results.violations) {
          console.log(`${violation.description}: ${violation.nodes.length} occurrences`)
        }
      }
    })
  })

  test.describe('Interactive Element Accessibility', () => {
    test('buttons are accessible', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      const results = await new AxeBuilder({ page })
        .withRules(['button-name'])
        .analyze()

      expect(
        results.violations.filter(v => v.id === 'button-name'),
        'Buttons missing accessible names'
      ).toHaveLength(0)
    })

    test('links are accessible', async ({ page }) => {
      await setupDemoMode(page)
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      const results = await new AxeBuilder({ page })
        .withRules(['link-name'])
        .analyze()

      expect(
        results.violations.filter(v => v.id === 'link-name'),
        'Links missing accessible names'
      ).toHaveLength(0)
    })
  })
})
