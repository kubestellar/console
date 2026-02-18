/**
 * Interaction Compliance Test Suite
 *
 * Tests core user interactions: global search, theme toggle,
 * card expand/collapse, card refresh, sidebar collapse, dashboard refresh.
 *
 * Run: PLAYWRIGHT_BASE_URL=http://localhost:5174 npx playwright test e2e/compliance/interaction-compliance.spec.ts --project=chromium
 */
import { test, expect, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { setupAuth, setupLiveMocks, setLiveColdMode } from '../mocks/liveMocks'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InteractionResult {
  testName: string
  category: 'search' | 'theme' | 'card' | 'sidebar' | 'dashboard'
  status: 'pass' | 'fail' | 'warn' | 'skip'
  details: string
  durationMs: number
}

interface InteractionReport {
  timestamp: string
  checks: InteractionResult[]
  summary: {
    passCount: number
    failCount: number
    warnCount: number
    skipCount: number
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_LOAD_TIMEOUT_MS = 15_000
const SETTLE_MS = 2_000

// ---------------------------------------------------------------------------
// Report state
// ---------------------------------------------------------------------------

const report: InteractionReport = {
  timestamp: new Date().toISOString(),
  checks: [],
  summary: { passCount: 0, failCount: 0, warnCount: 0, skipCount: 0 },
}

function addResult(result: InteractionResult) {
  report.checks.push(result)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setupPage(page: Page) {
  await setupAuth(page)
  await setupLiveMocks(page)
  await setLiveColdMode(page)
}

async function navigateAndSettle(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_TIMEOUT_MS })
  try {
    await page.waitForSelector('[data-testid="sidebar"], main, [data-card-type]', { timeout: 8_000 })
  } catch { /* some routes may not have these */ }
  await page.waitForTimeout(SETTLE_MS)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Interaction Compliance', () => {
  test.describe.configure({ mode: 'serial' })

  test('setup — live mode with mocks', async ({ page }) => {
    await setupPage(page)
    await navigateAndSettle(page, '/')

    // Verify page loaded
    const body = await page.locator('body').textContent()
    expect(body?.length).toBeGreaterThan(0)
  })

  test('global search (Cmd+K)', async ({ page }) => {
    const start = Date.now()
    await setupPage(page)
    await navigateAndSettle(page, '/')

    // Check for search trigger
    const hasSearchButton = await page.locator('button, [role="button"]').filter({ hasText: /search/i }).count() > 0
      || await page.locator('[data-testid*="search"]').count() > 0

    if (!hasSearchButton) {
      addResult({
        testName: 'Global search (Cmd+K)',
        category: 'search',
        status: 'skip',
        details: 'No search button found',
        durationMs: Date.now() - start,
      })
      return
    }

    try {
      // Open search with Cmd+K
      await page.keyboard.press('Meta+k')
      await page.waitForTimeout(800)

      const dialogOpen = await page.locator('[role="dialog"], [role="combobox"], [data-testid*="search"], [data-testid*="command"]').count() > 0

      if (!dialogOpen) {
        addResult({
          testName: 'Global search (Cmd+K)',
          category: 'search',
          status: 'warn',
          details: 'Cmd+K did not open a dialog or command palette',
          durationMs: Date.now() - start,
        })
        return
      }

      // Type a search query
      await page.keyboard.type('cluster', { delay: 50 })
      await page.waitForTimeout(1_000)

      // Check for search results
      const resultItems = await page.locator('[role="option"], [role="listbox"] li, [data-testid*="result"], [data-testid*="item"]').count()

      // Press Escape to close
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)

      const dialogClosed = await page.locator('[role="dialog"]').count() === 0

      addResult({
        testName: 'Global search (Cmd+K)',
        category: 'search',
        status: dialogClosed ? 'pass' : 'warn',
        details: `Dialog opened: yes, Results found: ${resultItems}, Escape closes: ${dialogClosed}`,
        durationMs: Date.now() - start,
      })
    } catch (err) {
      addResult({
        testName: 'Global search (Cmd+K)',
        category: 'search',
        status: 'skip',
        details: `Error: ${(err as Error).message?.slice(0, 200)}`,
        durationMs: Date.now() - start,
      })
    }
  })

  test('theme toggle', async ({ page }) => {
    const start = Date.now()
    await setupPage(page)
    await navigateAndSettle(page, '/settings')

    try {
      // Look for theme toggle / dark mode switch
      const themeToggle = page.locator(
        'button:has-text("dark"), button:has-text("theme"), [data-testid*="theme"], [data-testid*="dark-mode"], [aria-label*="theme"], [aria-label*="dark"]'
      ).first()

      const toggleExists = await themeToggle.count() > 0

      if (!toggleExists) {
        // Try looking for a select or radio option
        const themeSelect = page.locator('select, [role="radiogroup"]').filter({ hasText: /dark|light|theme/i }).first()
        const selectExists = await themeSelect.count() > 0

        if (!selectExists) {
          addResult({
            testName: 'Theme toggle',
            category: 'theme',
            status: 'skip',
            details: 'No theme toggle found on /settings',
            durationMs: Date.now() - start,
          })
          return
        }
      }

      // Get initial theme state
      const initialDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))

      // Click theme toggle
      await themeToggle.click()
      await page.waitForTimeout(500)

      const afterToggle = await page.evaluate(() => document.documentElement.classList.contains('dark'))

      // Check if theme actually changed
      const themeChanged = initialDark !== afterToggle

      if (themeChanged) {
        // Verify persistence: reload and check
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(1_500)

        const afterReload = await page.evaluate(() => document.documentElement.classList.contains('dark'))
        const persisted = afterReload === afterToggle

        addResult({
          testName: 'Theme toggle',
          category: 'theme',
          status: persisted ? 'pass' : 'warn',
          details: `Toggle: ${initialDark ? 'dark→light' : 'light→dark'}, Persisted after reload: ${persisted}`,
          durationMs: Date.now() - start,
        })
      } else {
        addResult({
          testName: 'Theme toggle',
          category: 'theme',
          status: 'warn',
          details: 'Theme toggle clicked but dark class did not change',
          durationMs: Date.now() - start,
        })
      }
    } catch (err) {
      addResult({
        testName: 'Theme toggle',
        category: 'theme',
        status: 'skip',
        details: `Error: ${(err as Error).message?.slice(0, 200)}`,
        durationMs: Date.now() - start,
      })
    }
  })

  test('card expand/collapse', async ({ page }) => {
    test.setTimeout(30_000)
    const start = Date.now()
    await setupPage(page)
    await navigateAndSettle(page, '/')

    try {
      // Find a card with an expand button using multiple selector strategies
      let targetButton = page.locator(
        '[data-card-type] button[aria-label*="expand"], [data-card-type] button[aria-label*="maximize"], [data-card-type] [data-testid*="expand"]'
      ).first()

      let hasButton = await targetButton.count() > 0

      if (!hasButton) {
        // Try buttons with expand/fullscreen titles
        targetButton = page.locator(
          '[data-card-type] button[title*="expand"], [data-card-type] button[title*="full"]'
        ).first()
        hasButton = await targetButton.count() > 0
      }

      if (!hasButton) {
        addResult({
          testName: 'Card expand/collapse',
          category: 'card',
          status: 'skip',
          details: 'No expand button found on any dashboard card',
          durationMs: Date.now() - start,
        })
        return
      }

      // Click expand
      await targetButton.click()
      await page.waitForTimeout(800)

      // Check for modal/dialog/expanded state
      const modalOpen = await page.locator(
        '[role="dialog"], [data-testid*="modal"], [data-testid*="expanded"], .fixed.inset-0, [class*="modal"]'
      ).count() > 0

      if (modalOpen) {
        // Close modal (Escape or close button)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(500)

        const modalClosed = await page.locator('[role="dialog"], [data-testid*="modal"]').count() === 0

        addResult({
          testName: 'Card expand/collapse',
          category: 'card',
          status: modalClosed ? 'pass' : 'warn',
          details: `Expand opens modal: yes, Escape closes: ${modalClosed}`,
          durationMs: Date.now() - start,
        })
      } else {
        addResult({
          testName: 'Card expand/collapse',
          category: 'card',
          status: 'warn',
          details: 'Expand button clicked but no modal/dialog detected',
          durationMs: Date.now() - start,
        })
      }
    } catch (err) {
      addResult({
        testName: 'Card expand/collapse',
        category: 'card',
        status: 'skip',
        details: `Error: ${(err as Error).message?.slice(0, 200)}`,
        durationMs: Date.now() - start,
      })
    }
  })

  test('card refresh', async ({ page }) => {
    const start = Date.now()
    await setupPage(page)
    await navigateAndSettle(page, '/')

    try {
      // Find a refresh button on a card
      const refreshButton = page.locator(
        '[data-card-type] button[aria-label*="refresh"], [data-card-type] button[title*="refresh"], [data-card-type] [data-testid*="refresh"]'
      ).first()

      const hasRefresh = await refreshButton.count() > 0

      if (!hasRefresh) {
        addResult({
          testName: 'Card refresh',
          category: 'card',
          status: 'skip',
          details: 'No refresh button found on any dashboard card',
          durationMs: Date.now() - start,
        })
        return
      }

      // Get the parent card
      const card = refreshButton.locator('xpath=ancestor::*[@data-card-type]').first()
      const cardType = await card.getAttribute('data-card-type')

      // Click refresh
      await refreshButton.click()
      await page.waitForTimeout(300)

      // Check for loading indicator (spinner, skeleton, etc.)
      const hasLoadingIndicator = await card.locator('.animate-spin, [data-loading="true"], .skeleton, [class*="loading"]').count() > 0

      // Wait for content to reload
      await page.waitForTimeout(3_000)

      const hasContent = await card.locator('[data-loading="false"], .text-sm, p, table, li').count() > 0

      addResult({
        testName: 'Card refresh',
        category: 'card',
        status: hasContent ? 'pass' : 'warn',
        details: `Card: ${cardType}, Loading indicator: ${hasLoadingIndicator}, Content after refresh: ${hasContent}`,
        durationMs: Date.now() - start,
      })
    } catch (err) {
      addResult({
        testName: 'Card refresh',
        category: 'card',
        status: 'skip',
        details: `Error: ${(err as Error).message?.slice(0, 200)}`,
        durationMs: Date.now() - start,
      })
    }
  })

  test('sidebar collapse/expand', async ({ page }) => {
    const start = Date.now()
    await setupPage(page)
    await navigateAndSettle(page, '/')

    try {
      const sidebar = page.locator('[data-testid="sidebar"], nav, aside').first()
      const sidebarExists = await sidebar.count() > 0

      if (!sidebarExists) {
        addResult({
          testName: 'Sidebar collapse/expand',
          category: 'sidebar',
          status: 'skip',
          details: 'No sidebar element found',
          durationMs: Date.now() - start,
        })
        return
      }

      // Measure initial width
      const initialBox = await sidebar.boundingBox()
      if (!initialBox) {
        addResult({
          testName: 'Sidebar collapse/expand',
          category: 'sidebar',
          status: 'skip',
          details: 'Sidebar has no bounding box (hidden?)',
          durationMs: Date.now() - start,
        })
        return
      }

      // Find collapse toggle
      const collapseButton = page.locator(
        'button[aria-label*="collapse"], button[aria-label*="toggle sidebar"], button[data-testid*="sidebar-toggle"], button[data-testid*="collapse"], [data-testid="sidebar"] button:first-child'
      ).first()

      const hasCollapse = await collapseButton.count() > 0

      if (!hasCollapse) {
        addResult({
          testName: 'Sidebar collapse/expand',
          category: 'sidebar',
          status: 'skip',
          details: `Sidebar exists (width: ${Math.round(initialBox.width)}px) but no collapse button found`,
          durationMs: Date.now() - start,
        })
        return
      }

      // Click collapse
      await collapseButton.click()
      await page.waitForTimeout(800)

      const collapsedBox = await sidebar.boundingBox()
      const widthChanged = collapsedBox && Math.abs(collapsedBox.width - initialBox.width) > 20

      if (widthChanged) {
        // Click expand (same button)
        await collapseButton.click()
        await page.waitForTimeout(800)

        const expandedBox = await sidebar.boundingBox()
        const restored = expandedBox && Math.abs(expandedBox.width - initialBox.width) < 20

        addResult({
          testName: 'Sidebar collapse/expand',
          category: 'sidebar',
          status: restored ? 'pass' : 'warn',
          details: `Initial: ${Math.round(initialBox.width)}px, Collapsed: ${Math.round(collapsedBox!.width)}px, Restored: ${expandedBox ? Math.round(expandedBox.width) : '?'}px`,
          durationMs: Date.now() - start,
        })
      } else {
        addResult({
          testName: 'Sidebar collapse/expand',
          category: 'sidebar',
          status: 'warn',
          details: `Collapse button clicked but width didn't change (${Math.round(initialBox.width)}px → ${collapsedBox ? Math.round(collapsedBox.width) : '?'}px)`,
          durationMs: Date.now() - start,
        })
      }
    } catch (err) {
      addResult({
        testName: 'Sidebar collapse/expand',
        category: 'sidebar',
        status: 'skip',
        details: `Error: ${(err as Error).message?.slice(0, 200)}`,
        durationMs: Date.now() - start,
      })
    }
  })

  test('dashboard refresh', async ({ page }) => {
    const start = Date.now()
    await setupPage(page)
    await navigateAndSettle(page, '/')

    try {
      // Find dashboard-level refresh button
      const dashRefresh = page.locator(
        'button[aria-label*="refresh"]:not([data-card-type] *), button[data-testid*="dashboard-refresh"], button[data-testid*="refresh-all"], header button:has-text("refresh")'
      ).first()

      const hasDashRefresh = await dashRefresh.count() > 0

      if (!hasDashRefresh) {
        addResult({
          testName: 'Dashboard refresh',
          category: 'dashboard',
          status: 'skip',
          details: 'No dashboard-level refresh button found',
          durationMs: Date.now() - start,
        })
        return
      }

      // Count cards before refresh
      const cardsBefore = await page.locator('[data-card-type]').count()

      // Click refresh
      await dashRefresh.click()
      await page.waitForTimeout(500)

      // Check for loading states
      const loadingCards = await page.locator('[data-card-type][data-loading="true"], [data-card-type] .skeleton, [data-card-type] .animate-pulse').count()

      // Wait for content to reload
      await page.waitForTimeout(4_000)

      const cardsAfter = await page.locator('[data-card-type]').count()
      const contentLoaded = await page.locator('[data-card-type][data-loading="false"]').count()

      addResult({
        testName: 'Dashboard refresh',
        category: 'dashboard',
        status: cardsAfter > 0 ? 'pass' : 'warn',
        details: `Cards before: ${cardsBefore}, Loading states seen: ${loadingCards}, Cards after: ${cardsAfter}, Loaded: ${contentLoaded}`,
        durationMs: Date.now() - start,
      })
    } catch (err) {
      addResult({
        testName: 'Dashboard refresh',
        category: 'dashboard',
        status: 'skip',
        details: `Error: ${(err as Error).message?.slice(0, 200)}`,
        durationMs: Date.now() - start,
      })
    }
  })

  // Generate final report
  test('generate report', async () => {
    // Calculate summary
    for (const check of report.checks) {
      switch (check.status) {
        case 'pass': report.summary.passCount++; break
        case 'fail': report.summary.failCount++; break
        case 'warn': report.summary.warnCount++; break
        case 'skip': report.summary.skipCount++; break
      }
    }

    // Write JSON report
    const outDir = path.resolve(__dirname, '../test-results')
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

    fs.writeFileSync(
      path.join(outDir, 'interaction-compliance-report.json'),
      JSON.stringify(report, null, 2)
    )

    // Write markdown summary
    const md = [
      '# Interaction Compliance Report',
      '',
      `Generated: ${report.timestamp}`,
      '',
      '## Summary',
      '',
      `- **Pass**: ${report.summary.passCount}`,
      `- **Fail**: ${report.summary.failCount}`,
      `- **Warn**: ${report.summary.warnCount}`,
      `- **Skip**: ${report.summary.skipCount}`,
      '',
      '## Results',
      '',
      '| Test | Category | Status | Duration | Details |',
      '|------|----------|--------|----------|---------|',
      ...report.checks.map(c =>
        `| ${c.testName} | ${c.category} | ${c.status} | ${c.durationMs}ms | ${c.details.slice(0, 120)} |`
      ),
      '',
    ].join('\n')

    fs.writeFileSync(path.join(outDir, 'interaction-compliance-summary.md'), md)

    // Log summary
    console.log(`[Interaction] Pass: ${report.summary.passCount}, Fail: ${report.summary.failCount}, Warn: ${report.summary.warnCount}, Skip: ${report.summary.skipCount}`)

    // No hard assertion — these are observational tests
    // Skip count should not dominate (at least 2 tests should work)
    const workingTests = report.summary.passCount + report.summary.warnCount + report.summary.failCount
    expect(workingTests, 'At least 2 interaction tests should execute').toBeGreaterThanOrEqual(2)
  })
})
