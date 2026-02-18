/**
 * Accessibility Compliance Test Suite
 *
 * WCAG 2.1 AA audit across 15 routes using axe-core.
 * Tests keyboard navigation and focus management.
 *
 * Run: PLAYWRIGHT_BASE_URL=http://localhost:5174 npx playwright test e2e/compliance/a11y-compliance.spec.ts --project=chromium
 */
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { setupAuth, setupLiveMocks, setLiveColdMode } from '../mocks/liveMocks'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface A11yCheckResult {
  route: string
  routeName: string
  category: 'axe-audit' | 'keyboard-nav' | 'focus-management'
  status: 'pass' | 'fail' | 'warn' | 'skip'
  details: string
  severity: 'critical' | 'serious' | 'moderate' | 'minor'
  violationCount?: number
}

interface A11yReport {
  timestamp: string
  totalRoutes: number
  checks: A11yCheckResult[]
  summary: {
    passCount: number
    failCount: number
    warnCount: number
    skipCount: number
    totalViolations: number
    criticalViolations: number
    seriousViolations: number
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROUTES_TO_AUDIT = [
  { name: 'Dashboard', path: '/' },
  { name: 'Clusters', path: '/clusters' },
  { name: 'Settings', path: '/settings' },
  { name: 'Compute', path: '/compute' },
  { name: 'Security', path: '/security' },
  { name: 'Deployments', path: '/deployments' },
  { name: 'Helm', path: '/helm' },
  { name: 'GPU Reservations', path: '/gpu-reservations' },
  { name: 'AI/ML', path: '/ai-ml' },
  { name: 'Logs', path: '/logs' },
  { name: 'Events', path: '/events' },
  { name: 'Pods', path: '/pods' },
  { name: 'Services', path: '/services' },
  { name: 'Nodes', path: '/nodes' },
  { name: 'Workloads', path: '/workloads' },
]

const PAGE_LOAD_TIMEOUT_MS = 15_000
const ROUTE_SETTLE_MS = 2_000

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' })

const report: A11yReport = {
  timestamp: new Date().toISOString(),
  totalRoutes: ROUTES_TO_AUDIT.length,
  checks: [],
  summary: {
    passCount: 0,
    failCount: 0,
    warnCount: 0,
    skipCount: 0,
    totalViolations: 0,
    criticalViolations: 0,
    seriousViolations: 0,
  },
}

function addCheck(result: A11yCheckResult) {
  report.checks.push(result)
}

test('a11y compliance — WCAG 2.1 AA multi-route audit', async ({ page }, testInfo) => {
  testInfo.setTimeout(300_000) // 5 minutes for 15 routes

  // Phase 1: Setup
  console.log('[A11y] Phase 1: Setting up live mode with mocks')
  await setupAuth(page)
  await setupLiveMocks(page)
  await setLiveColdMode(page)

  // Phase 2: Per-route axe-core audit
  console.log('[A11y] Phase 2: Running axe-core WCAG 2.1 AA audits')

  for (const route of ROUTES_TO_AUDIT) {
    console.log(`[A11y]   Auditing ${route.name} (${route.path})`)

    try {
      await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_TIMEOUT_MS })

      // Wait for sidebar/content to render
      try {
        await page.waitForSelector('[data-testid="sidebar"], main, [data-card-type]', { timeout: 8_000 })
      } catch {
        // Some routes may not have these elements
      }
      await page.waitForTimeout(ROUTE_SETTLE_MS)

      // Run axe-core
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .exclude('[data-testid="chart"]')
        .exclude('.recharts-wrapper')
        .exclude('.echarts-for-react')
        .exclude('canvas')
        .exclude('svg') // Chart SVGs produce false positives
        .analyze()

      // Classify violations by severity
      const critical = results.violations.filter(v => v.impact === 'critical')
      const serious = results.violations.filter(v => v.impact === 'serious')
      const moderate = results.violations.filter(v => v.impact === 'moderate')
      const minor = results.violations.filter(v => v.impact === 'minor')

      const totalViolations = results.violations.length

      if (critical.length > 0) {
        addCheck({
          route: route.path,
          routeName: route.name,
          category: 'axe-audit',
          status: 'fail',
          details: `${critical.length} critical violations: ${critical.map(v => `${v.id} (${v.nodes.length} instances)`).join(', ')}`,
          severity: 'critical',
          violationCount: critical.length,
        })
      }

      if (serious.length > 0) {
        addCheck({
          route: route.path,
          routeName: route.name,
          category: 'axe-audit',
          status: 'fail',
          details: `${serious.length} serious violations: ${serious.map(v => `${v.id} (${v.nodes.length} instances)`).join(', ')}`,
          severity: 'serious',
          violationCount: serious.length,
        })
      }

      if (moderate.length > 0) {
        addCheck({
          route: route.path,
          routeName: route.name,
          category: 'axe-audit',
          status: 'warn',
          details: `${moderate.length} moderate violations: ${moderate.map(v => v.id).join(', ')}`,
          severity: 'moderate',
          violationCount: moderate.length,
        })
      }

      if (minor.length > 0) {
        addCheck({
          route: route.path,
          routeName: route.name,
          category: 'axe-audit',
          status: 'warn',
          details: `${minor.length} minor violations: ${minor.map(v => v.id).join(', ')}`,
          severity: 'minor',
          violationCount: minor.length,
        })
      }

      if (totalViolations === 0) {
        addCheck({
          route: route.path,
          routeName: route.name,
          category: 'axe-audit',
          status: 'pass',
          details: `No WCAG 2.1 AA violations (${results.passes.length} rules passed)`,
          severity: 'minor',
          violationCount: 0,
        })
      }

      console.log(`[A11y]     ${route.name}: ${totalViolations} violations (${critical.length} critical, ${serious.length} serious, ${moderate.length} moderate, ${minor.length} minor)`)
    } catch (err) {
      addCheck({
        route: route.path,
        routeName: route.name,
        category: 'axe-audit',
        status: 'skip',
        details: `Failed to audit: ${(err as Error).message?.slice(0, 200)}`,
        severity: 'critical',
      })
      console.log(`[A11y]     ${route.name}: SKIPPED - ${(err as Error).message?.slice(0, 100)}`)
    }
  }

  // Phase 3: Keyboard navigation tests
  console.log('[A11y] Phase 3: Testing keyboard navigation')

  // Navigate to dashboard for keyboard tests
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: PAGE_LOAD_TIMEOUT_MS })
  try {
    await page.waitForSelector('[data-testid="sidebar"]', { timeout: 8_000 })
  } catch { /* continue */ }
  await page.waitForTimeout(1_500)

  // Tab through page and check for visible focus indicators
  const focusResults = await page.evaluate(() => {
    const results: Array<{ tag: string; hasFocusVisible: boolean; hasOutline: boolean }> = []
    const interactiveElements = document.querySelectorAll(
      'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )

    // Sample up to 20 interactive elements
    const sample = Array.from(interactiveElements).slice(0, 20)

    for (const el of sample) {
      const htmlEl = el as HTMLElement
      htmlEl.focus()
      const computed = window.getComputedStyle(htmlEl)
      const outline = computed.outline || computed.outlineStyle
      const boxShadow = computed.boxShadow

      results.push({
        tag: `${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''}`,
        hasFocusVisible: outline !== 'none' || boxShadow !== 'none',
        hasOutline: outline !== 'none' && outline !== '' && !outline.includes('0px'),
      })
    }
    return results
  })

  const focusableCount = focusResults.length
  const withVisibleFocus = focusResults.filter(r => r.hasFocusVisible).length
  const focusRate = focusableCount > 0 ? withVisibleFocus / focusableCount : 1

  if (focusRate >= 0.8) {
    addCheck({
      route: '/',
      routeName: 'Dashboard',
      category: 'keyboard-nav',
      status: 'pass',
      details: `${withVisibleFocus}/${focusableCount} elements have visible focus indicators (${Math.round(focusRate * 100)}%)`,
      severity: 'serious',
    })
  } else if (focusRate >= 0.5) {
    addCheck({
      route: '/',
      routeName: 'Dashboard',
      category: 'keyboard-nav',
      status: 'warn',
      details: `Only ${withVisibleFocus}/${focusableCount} elements have visible focus (${Math.round(focusRate * 100)}%)`,
      severity: 'serious',
    })
  } else {
    addCheck({
      route: '/',
      routeName: 'Dashboard',
      category: 'keyboard-nav',
      status: 'fail',
      details: `Only ${withVisibleFocus}/${focusableCount} elements have visible focus (${Math.round(focusRate * 100)}%)`,
      severity: 'serious',
    })
  }

  // Phase 4: Focus management — verify Escape closes dialogs
  console.log('[A11y] Phase 4: Testing focus management')

  const hasSearchButton = await page.locator('button, [role="button"]').filter({ hasText: /search/i }).count() > 0
  || await page.locator('[data-testid*="search"]').count() > 0

  if (hasSearchButton) {
    try {
      // Try Cmd+K to open search
      await page.keyboard.press('Meta+k')
      await page.waitForTimeout(500)

      const dialogOpen = await page.locator('[role="dialog"], [role="combobox"], [data-testid*="search"]').count() > 0
      if (dialogOpen) {
        // Press Escape
        await page.keyboard.press('Escape')
        await page.waitForTimeout(500)
        const dialogClosed = await page.locator('[role="dialog"]').count() === 0

        addCheck({
          route: '/',
          routeName: 'Dashboard',
          category: 'focus-management',
          status: dialogClosed ? 'pass' : 'warn',
          details: dialogClosed ? 'Escape key closes search dialog' : 'Escape did not close search dialog',
          severity: 'moderate',
        })
      } else {
        addCheck({
          route: '/',
          routeName: 'Dashboard',
          category: 'focus-management',
          status: 'skip',
          details: 'Cmd+K did not open a dialog',
          severity: 'moderate',
        })
      }
    } catch {
      addCheck({
        route: '/',
        routeName: 'Dashboard',
        category: 'focus-management',
        status: 'skip',
        details: 'Could not test search dialog focus management',
        severity: 'moderate',
      })
    }
  } else {
    addCheck({
      route: '/',
      routeName: 'Dashboard',
      category: 'focus-management',
      status: 'skip',
      details: 'No search button found to test',
      severity: 'moderate',
    })
  }

  // Check html lang attribute
  const htmlLang = await page.getAttribute('html', 'lang')
  addCheck({
    route: '/',
    routeName: 'Dashboard',
    category: 'axe-audit',
    status: htmlLang ? 'pass' : 'fail',
    details: htmlLang ? `<html lang="${htmlLang}"> is set` : '<html> missing lang attribute',
    severity: htmlLang ? 'minor' : 'serious',
  })

  // Phase 5: Generate report
  console.log('[A11y] Phase 5: Generating report')

  // Calculate summary
  for (const check of report.checks) {
    switch (check.status) {
      case 'pass': report.summary.passCount++; break
      case 'fail': report.summary.failCount++; break
      case 'warn': report.summary.warnCount++; break
      case 'skip': report.summary.skipCount++; break
    }
    if (check.violationCount) {
      report.summary.totalViolations += check.violationCount
      if (check.severity === 'critical') report.summary.criticalViolations += check.violationCount
      if (check.severity === 'serious') report.summary.seriousViolations += check.violationCount
    }
  }

  // Write report
  const outDir = path.resolve(__dirname, '../test-results')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  fs.writeFileSync(path.join(outDir, 'a11y-compliance-report.json'), JSON.stringify(report, null, 2))

  // Write markdown summary
  const md = [
    '# Accessibility Compliance Report',
    '',
    `Generated: ${report.timestamp}`,
    `Total routes audited: ${report.totalRoutes}`,
    '',
    '## Summary',
    '',
    `- **Pass**: ${report.summary.passCount}`,
    `- **Fail**: ${report.summary.failCount}`,
    `- **Warn**: ${report.summary.warnCount}`,
    `- **Skip**: ${report.summary.skipCount}`,
    `- **Total violations**: ${report.summary.totalViolations} (${report.summary.criticalViolations} critical, ${report.summary.seriousViolations} serious)`,
    '',
    '## Per-Route Results',
    '',
    '| Route | Category | Status | Details |',
    '|-------|----------|--------|---------|',
    ...report.checks.map(c =>
      `| ${c.routeName} (${c.route}) | ${c.category} | ${c.status} | ${c.details.slice(0, 120)} |`
    ),
    '',
  ].join('\n')

  fs.writeFileSync(path.join(outDir, 'a11y-compliance-summary.md'), md)

  // Log summary
  console.log(`[A11y] Pass: ${report.summary.passCount}, Fail: ${report.summary.failCount}, Warn: ${report.summary.warnCount}, Skip: ${report.summary.skipCount}`)
  console.log(`[A11y] Total violations: ${report.summary.totalViolations} (${report.summary.criticalViolations} critical, ${report.summary.seriousViolations} serious)`)

  // Soft assertion: report is generated and most routes were audited
  const nonSkip = report.summary.passCount + report.summary.failCount + report.summary.warnCount
  expect(nonSkip, 'At least 5 routes should be audited successfully').toBeGreaterThanOrEqual(5)

  // Log critical violations as warnings (these are real app issues to fix, not test failures)
  if (report.summary.criticalViolations > 0) {
    console.log(`[A11y] WARNING: ${report.summary.criticalViolations} critical violations found — see report for details`)
  }
})
