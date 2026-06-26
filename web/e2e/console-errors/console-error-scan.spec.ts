/**
 * Console Error Scanner — traverse every route and capture Chrome console output.
 *
 * Uses Chrome DevTools Protocol (CDP) via Playwright to:
 *   1. Open every defined route in the KubeStellar Console
 *   2. Capture all console.info / console.warn / console.error messages
 *   3. Capture uncaught exceptions (page crashes)
 *   4. Generate a JSON + Markdown report of findings
 *
 * Routes are visited with mocked APIs so no live backend is required.
 * Each route gets SETTLE_MS to load and produce console output before
 * the scanner moves on.
 */

import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { setupAuth, setupLiveMocks } from '../mocks/liveMocks'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Time to wait after navigating to each route for console output to settle.
 * 2s is enough for Playwright to capture console messages and for lazy-loaded
 * chunks to finish parsing in headless Chromium. Was 4s but the cumulative
 * 38-route budget repeatedly tripped the 600s suite cap (#8981, #9097), so we
 * trade a bit of settle time for a comfortable margin under the suite cap.
 */
const SETTLE_MS = 2_000

/**
 * Max time to wait for an individual route navigation. A route that exceeds
 * this is treated as a hang — capping it prevents one slow route from
 * eating the entire suite budget. The initial priming load uses a longer
 * timeout (PRIME_NAV_TIMEOUT_MS) because `networkidle` can legitimately take
 * longer on the first paint.
 */
const NAV_TIMEOUT_MS = 30_000

/** Longer timeout for the initial priming load (waits on `networkidle`). */
const PRIME_NAV_TIMEOUT_MS = 45_000

/** Routes that require special params or are not visitable directly */
const _SKIP_ROUTES = new Set([
  '/login',
  '/auth/callback',
  '/widget',
  '/custom-dashboard/:id',
  '/missions/:missionId',
  '/__perf/all-cards',
  '/__compliance/all-cards',
  '*',
])

/** All application routes extracted from App.tsx */
const ALL_ROUTES: string[] = [
  '/',
  '/clusters',
  '/workloads',
  '/nodes',
  '/deployments',
  '/pods',
  '/services',
  '/operators',
  '/helm',
  '/logs',
  '/compute',
  '/compute/compare',
  '/storage',
  '/network',
  '/events',
  '/security',
  '/gitops',
  '/alerts',
  '/cost',
  '/security-posture',
  '/compliance',
  '/data-compliance',
  '/gpu-reservations',
  '/history',
  '/settings',
  '/users',
  '/namespaces',
  '/arcade',
  '/deploy',
  '/ai-ml',
  '/ai-agents',
  '/llm-d-benchmarks',
  '/cluster-admin',
  '/ci-cd',
  '/marketplace',
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConsoleEntry {
  type: 'info' | 'warning' | 'error' | 'exception'
  text: string
  url?: string
  lineNumber?: number
  timestamp: number
}

interface RouteReport {
  route: string
  status: 'ok' | 'warning' | 'error' | 'crash'
  navigated: boolean
  durationMs: number
  entries: ConsoleEntry[]
  counts: { info: number; warning: number; error: number; exception: number }
}

interface ScanReport {
  timestamp: string
  totalRoutes: number
  routesVisited: number
  routesFailed: number
  summary: {
    totalInfo: number
    totalWarnings: number
    totalErrors: number
    totalExceptions: number
  }
  routes: RouteReport[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifyType(msg: ConsoleMessage): ConsoleEntry['type'] {
  const t = msg.type()
  if (t === 'error') return 'error'
  if (t === 'warning') return 'warning'
  return 'info'
}

function getOutputDir(): string {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const dir = path.resolve(__dirname, '../test-results')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Escape a string for safe inclusion in a Markdown table cell.
 * Prevents markdown injection via pipe characters, backticks, or HTML tags.
 * Backslashes are escaped first so that subsequent replacements cannot be
 * reinterpreted as escape sequences by the Markdown renderer.
 */
function escapeMdCell(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/`/g, '\\`')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Deduplicate entries by message text within a route */
function dedup(entries: ConsoleEntry[]): ConsoleEntry[] {
  const seen = new Set<string>()
  return entries.filter((e) => {
    const key = `${e.type}:${e.text}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ---------------------------------------------------------------------------
// Mock setup for skipPattern routes (prevent 401 → auth redirect)
// ---------------------------------------------------------------------------

async function mockSkipPatternRoutes(page: Page): Promise<void> {
  // Routes that return arrays need '[]' not '{}'
  const arrayPatterns = [
    '**/api/workloads/**', '**/api/notifications/**', '**/api/gpu/**',
    '**/api/feedback/queue', '**/api/feedback/requests',
    '**/api/nightly-e2e/**', '**/api/public/nightly-e2e/**',
  ]
  const objectPatterns = [
    '**/api/kubectl/**', '**/api/active-users*',
    '**/api/user/preferences*', '**/api/permissions/**',
    '**/auth/**', '**/api/dashboards/**', '**/api/feedback/**',
    '**/api/persistence/**', '**/api/config/**', '**/api/gitops/**',
    '**/api/rewards/**',
  ]
  for (const pattern of arrayPatterns) {
    await page.route(pattern, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    )
  }
  for (const pattern of objectPatterns) {
    await page.route(pattern, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    )
  }
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function generateMarkdown(report: ScanReport): string {
  const lines: string[] = []
  const { summary } = report

  lines.push('# Console Error Scan Report')
  lines.push('')
  lines.push(`**Date:** ${report.timestamp}`)
  lines.push(`**Routes scanned:** ${report.routesVisited} / ${report.totalRoutes}`)
  lines.push(`**Routes with issues:** ${report.routesFailed}`)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push(`| Level | Count |`)
  lines.push(`|-------|-------|`)
  lines.push(`| ℹ️ Info | ${summary.totalInfo} |`)
  lines.push(`| ⚠️ Warning | ${summary.totalWarnings} |`)
  lines.push(`| ❌ Error | ${summary.totalErrors} |`)
  lines.push(`| 💥 Exception | ${summary.totalExceptions} |`)
  lines.push('')

  // Routes with errors/exceptions first, then warnings, then clean
  const sorted = [...report.routes].sort((a, b) => {
    const score = (r: RouteReport) =>
      r.counts.exception * 1000 + r.counts.error * 100 + r.counts.warning
    return score(b) - score(a)
  })

  lines.push('## Per-Route Results')
  lines.push('')

  for (const r of sorted) {
    const icon = r.status === 'crash' ? '💥'
      : r.status === 'error' ? '❌'
      : r.status === 'warning' ? '⚠️'
      : '✅'
    lines.push(`### ${icon} \`${r.route}\` (${r.durationMs}ms)`)
    lines.push('')

    if (r.entries.length === 0) {
      lines.push('No console issues.')
      lines.push('')
      continue
    }

    lines.push(`| Type | Message |`)
    lines.push(`|------|---------|`)
    for (const e of r.entries) {
      const typeIcon = e.type === 'exception' ? '💥'
        : e.type === 'error' ? '❌'
        : e.type === 'warning' ? '⚠️'
        : 'ℹ️'
      // Truncate long messages and escape markdown-injection characters
      const msg = escapeMdCell(e.text.slice(0, 200).replace(/\n/g, ' '))
      lines.push(`| ${typeIcon} ${e.type} | ${msg} |`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Main test
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' })

test('console error scan — all routes', async ({ page }) => {
  const routeReports: RouteReport[] = []

  // Listen for uncaught exceptions
  const pageExceptions: Array<{ message: string; stack?: string; timestamp: number }> = []
  page.on('pageerror', (err) => {
    pageExceptions.push({ message: err.message, stack: err.stack, timestamp: Date.now() })
  })

  // ── Setup ─────────────────────────────────────────────────────────────
  console.log('[ConsoleErrorScan] Setting up auth and API mocks...')
  await setupAuth(page)
  await setupLiveMocks(page, { delayDataAPIs: false })
  await mockSkipPatternRoutes(page)

  // Prime the app — initial load
  console.log('[ConsoleErrorScan] Priming app with initial load...')
  await page.goto('/', { waitUntil: 'networkidle', timeout: PRIME_NAV_TIMEOUT_MS })
  await page.waitForFunction(
    () => document.body.innerText.length > 0,
    { timeout: PRIME_NAV_TIMEOUT_MS },
  )

  // Set auth token in localStorage (ProtectedRoute checks this)
  await page.evaluate(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('kc-demo-mode', 'true')
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: true,
      timestamp: Date.now(),
    }))
  })

  // ── Traverse all routes ───────────────────────────────────────────────
  console.log(`[ConsoleErrorScan] Scanning ${ALL_ROUTES.length} routes...`)
  console.log('')

  for (const route of ALL_ROUTES) {
    const entries: ConsoleEntry[] = []
    const beforeExceptions = pageExceptions.length
    const start = Date.now()
    let navigated = false

    // Attach console listener for this route
    const onConsole = (msg: ConsoleMessage) => {
      const text = msg.text()
      // Skip noisy/expected messages
      if (text.includes('Download the React DevTools')) return
      if (text.includes('[HMR]')) return
      if (text.includes('[vite]')) return
      if (text.startsWith('%c')) return // styled console output

      entries.push({
        type: classifyType(msg),
        text,
        url: msg.location()?.url,
        lineNumber: msg.location()?.lineNumber,
        timestamp: Date.now(),
      })
    }
    page.on('console', onConsole)

    try {
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS })
      navigated = true

      // Wait for the route to settle — lazy chunks load, API calls resolve
      await page.waitForTimeout(SETTLE_MS)
    } catch (err) {
      entries.push({
        type: 'exception',
        text: `Navigation failed: ${(err as Error).message}`,
        timestamp: Date.now(),
      })
    }

    // Collect any uncaught exceptions that fired during this route
    for (let i = beforeExceptions; i < pageExceptions.length; i++) {
      const exc = pageExceptions[i]
      entries.push({
        type: 'exception',
        text: exc.stack || exc.message,
        timestamp: exc.timestamp,
      })
    }

    page.off('console', onConsole)
    const durationMs = Date.now() - start

    // Deduplicate and count
    const dedupEntries = dedup(entries)
    const counts = {
      info: dedupEntries.filter((e) => e.type === 'info').length,
      warning: dedupEntries.filter((e) => e.type === 'warning').length,
      error: dedupEntries.filter((e) => e.type === 'error').length,
      exception: dedupEntries.filter((e) => e.type === 'exception').length,
    }

    const status: RouteReport['status'] = counts.exception > 0 ? 'crash'
      : counts.error > 0 ? 'error'
      : counts.warning > 0 ? 'warning'
      : 'ok'

    const icon = status === 'crash' ? '💥' : status === 'error' ? '❌' : status === 'warning' ? '⚠️' : '✅'
    console.log(`${icon} ${route.padEnd(25)} ${durationMs}ms  E:${counts.error} W:${counts.warning} X:${counts.exception}`)

    routeReports.push({ route, status, navigated, durationMs, entries: dedupEntries, counts })
  }

  // ── Generate report ───────────────────────────────────────────────────
  console.log('')
  console.log('[ConsoleErrorScan] Generating reports...')

  const report: ScanReport = {
    timestamp: new Date().toISOString(),
    totalRoutes: ALL_ROUTES.length,
    routesVisited: routeReports.filter((r) => r.navigated).length,
    routesFailed: routeReports.filter((r) => r.status === 'error' || r.status === 'crash').length,
    summary: {
      totalInfo: routeReports.reduce((s, r) => s + r.counts.info, 0),
      totalWarnings: routeReports.reduce((s, r) => s + r.counts.warning, 0),
      totalErrors: routeReports.reduce((s, r) => s + r.counts.error, 0),
      totalExceptions: routeReports.reduce((s, r) => s + r.counts.exception, 0),
    },
    routes: routeReports,
  }

  const outDir = getOutputDir()
  fs.writeFileSync(path.join(outDir, 'console-errors-report.json'), JSON.stringify(report, null, 2))
  fs.writeFileSync(path.join(outDir, 'console-errors-summary.md'), generateMarkdown(report))

  console.log('')
  console.log(`[ConsoleErrorScan] Routes scanned: ${report.routesVisited}/${report.totalRoutes}`)
  console.log(`[ConsoleErrorScan] Errors: ${report.summary.totalErrors}, Warnings: ${report.summary.totalWarnings}, Exceptions: ${report.summary.totalExceptions}`)
  console.log(`[ConsoleErrorScan] Report: web/e2e/test-results/console-errors-report.json`)
  console.log(`[ConsoleErrorScan] Summary: web/e2e/test-results/console-errors-summary.md`)

  // ── Assertion: no uncaught exceptions ─────────────────────────────────
  // We don't fail on console.error (many are expected from mocked APIs
  // returning 503), but uncaught exceptions indicate real crashes.
  const crashRoutes = routeReports.filter((r) => r.status === 'crash')
  if (crashRoutes.length > 0) {
    console.log('')
    console.log('[ConsoleErrorScan] ⚠️  Routes with uncaught exceptions:')
    for (const r of crashRoutes) {
      const exceptions = r.entries.filter((e) => e.type === 'exception')
      for (const e of exceptions) {
        console.log(`  ${r.route}: ${e.text.slice(0, 150)}`)
      }
    }
  }

  // Fail if any route crashed with an uncaught exception
  expect(
    crashRoutes.length,
    `${crashRoutes.length} route(s) had uncaught exceptions: ${crashRoutes.map((r) => r.route).join(', ')}`
  ).toBe(0)
})
