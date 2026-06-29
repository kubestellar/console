import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { collectK8sGroundTruth } from '../../../harness/groundtruth/collectK8sGroundTruth'
import { safeJsonStringify } from '../../../harness/evidence/sanitizeEvidence'
import {
  dismissOptionalLiveOverlays,
  establishLiveCanarySession,
  gotoLiveCanaryRoute,
  liveCanaryUrl,
} from '../helpers/liveSiteAssertions'
import { firstVisibleLocator } from '../helpers/visualLoginAssertions'

type MatrixRoute = {
  route: string
  label: string
  expectedMarkers?: (groundTruth: ReturnType<typeof collectK8sGroundTruth>) => Array<string | RegExp>
  expectedFields?: (groundTruth: ReturnType<typeof collectK8sGroundTruth>) => Record<string, number>
}

type Box = {
  x: number
  y: number
  width: number
  height: number
}

type RouteFacts = {
  browserName: string
  projectName: string
  route: string
  url: string
  routeState: 'live' | 'login' | 'session-expired' | 'startup-error' | 'blank'
  viewport: { width: number; height: number } | null
  status: 'passed' | 'failed'
  missingMarkers: string[]
  fieldMismatches: Array<{ field: string; expected: number; actual: number | null; actualValues?: Array<number | null>; reason?: string }>
  bodyPreview: string
  scrollOverflowX: number
  textCollisionCount: number
  clippedElementCount: number
  boxes: Record<string, Box | null>
  baseline?: { mode: 'disabled' | 'compare'; status: 'skipped' | 'passed' | 'failed'; error?: string }
  screenshotPath?: string
  error?: string
}

type InteractionFacts = {
  browserName: string
  control: string
  route: string
  status: 'passed' | 'failed' | 'skipped'
  expectedTopLayer?: string
  actualTopLayer?: string
  topmostIsOverlay?: boolean
  overlayBox?: Box | null
  screenshotPath?: string
  error?: string
}

const OPTIONAL_INTERACTION_LOOKUP_TIMEOUT_MS = 3_000

const coreRoutes: MatrixRoute[] = [
  {
    route: '/',
    label: 'dashboard',
    expectedMarkers: () => ['Dashboard'],
    expectedFields: groundTruth => ({
      'dashboard-clusters-total': groundTruth.contexts.reachable,
      'dashboard-nodes-total': groundTruth.nodes.total,
      'dashboard-pods-total': groundTruth.pods.total,
      'dashboard-namespaces-total': groundTruth.namespaces.total,
    }),
  },
  {
    route: '/clusters',
    label: 'clusters',
    expectedMarkers: () => ['Clusters'],
    expectedFields: groundTruth => ({
      'clusters-total': groundTruth.contexts.reachable,
      'nodes-total': groundTruth.nodes.total,
      'nodes-ready': groundTruth.nodes.ready,
      'pods-total': groundTruth.pods.total,
    }),
  },
  {
    route: '/nodes',
    label: 'nodes',
    expectedMarkers: () => ['Nodes'],
    expectedFields: groundTruth => ({
      'nodes-total': groundTruth.nodes.total,
      'nodes-ready': groundTruth.nodes.ready,
    }),
  },
  {
    route: '/pods',
    label: 'pods',
    expectedMarkers: () => ['Pods'],
    expectedFields: groundTruth => ({
      'pods-total': groundTruth.pods.total,
      'pods-pending': groundTruth.pods.pending,
    }),
  },
  {
    route: '/namespaces',
    label: 'namespaces',
    expectedMarkers: () => ['Namespaces'],
    expectedFields: groundTruth => ({
      'namespaces-total': groundTruth.namespaces.total,
    }),
  },
  {
    route: '/deployments',
    label: 'deployments',
    expectedMarkers: () => ['Deployments'],
    expectedFields: groundTruth => ({
      'deployments-total': groundTruth.deployments.total,
      'deployments-available': groundTruth.deployments.available,
    }),
  },
  {
    route: '/alerts',
    label: 'alerts',
    expectedMarkers: () => ['Alerts', /critical|warning|normal|issue|alert/i],
  },
]

function sanitizeSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'root'
}

function markerMissing(bodyText: string, marker: string | RegExp): boolean {
  return typeof marker === 'string' ? !bodyText.includes(marker) : !marker.test(bodyText)
}

async function readBodyText(page: Page, timeout = 10_000): Promise<string> {
  const locatorText = await page.locator('body').innerText({ timeout }).catch(() => '')
  if (locatorText.trim()) return locatorText
  return page.evaluate(() => (document.body?.innerText || document.body?.textContent || '').trim()).catch(() => '')
}

async function waitForRouteStateText(page: Page): Promise<void> {
  await expect.poll(async () => {
    const text = await readBodyText(page, 500)
    return text.replace(/\s+/g, ' ').trim()
  }, {
    message: 'live browser matrix route should settle into visible content or a visible startup/auth state',
    timeout: 8_000,
  }).not.toBe('')
}

async function waitForRouteHandshakeSettled(page: Page): Promise<void> {
  await waitForRouteStateText(page)
  await expect.poll(async () => {
    const text = (await readBodyText(page, 500)).replace(/\s+/g, ' ').trim()
    if (/infrastructure connection error|too many requests|rate limited|http 429/i.test(text)) return 'error'
    if (/connecting to infrastructure|checking backend connectivity/i.test(text)) return 'loading'
    return text ? 'settled' : 'blank'
  }, {
    message: 'live browser matrix route should leave the startup loading handshake before classification',
    timeout: 25_000,
  }).not.toBe('loading')
}

async function waitForExpectedMarkers(
  page: Page,
  expectedMarkers: Array<string | RegExp>,
  mode: 'all' | 'any' = 'all',
): Promise<void> {
  await expect.poll(async () => {
    const text = await readBodyText(page, 500)
    const missing = expectedMarkers.filter(marker => markerMissing(text, marker))
    return mode === 'all' ? missing.map(marker => String(marker)) : missing.length < expectedMarkers.length
  }, {
    message: 'live browser matrix route should hydrate expected live markers before classification',
    timeout: 30_000,
  }).toEqual(mode === 'all' ? [] : true)
}

type BrowserGroundtruthFieldState = {
  value: number | null
  values: number[]
  markerCount: number
  reason: 'missing' | 'unparseable' | 'duplicate-disagreement' | 'ok'
}

async function readGroundtruthFields(page: Page, expected: Record<string, number>): Promise<Record<string, BrowserGroundtruthFieldState>> {
  return page.evaluate((fields) => {
    const values: Record<string, BrowserGroundtruthFieldState> = {}
    for (const field of fields) {
      const markers = Array.from(document.querySelectorAll(`[data-groundtruth-field="${field}"]`))
      const parsed = markers
        .map(marker => (marker.textContent || '').replace(/,/g, '').match(/-?\d+/))
        .filter((match): match is RegExpMatchArray => Boolean(match))
        .map(match => Number(match[0]))
      const uniqueValues = [...new Set(parsed)]
      const reason = markers.length === 0
        ? 'missing'
        : parsed.length !== markers.length || parsed.length === 0
          ? 'unparseable'
          : uniqueValues.length > 1
            ? 'duplicate-disagreement'
            : 'ok'
      values[field] = {
        markerCount: markers.length,
        values: parsed,
        reason,
        value: reason === 'ok' ? uniqueValues[0] : null,
      }
    }
    return values
  }, Object.keys(expected))
}

async function waitForExpectedFields(page: Page, expected: Record<string, number>): Promise<void> {
  const fields = Object.keys(expected)
  if (fields.length === 0) return

  await expect.poll(async () => {
    const actual = await readGroundtruthFields(page, expected)
    return Object.entries(expected)
      .map(([field, expectedValue]) => {
        const state = actual[field]
        if (!state || state.reason !== 'ok') return `${field}:${state?.reason || 'missing'}`
        return state.value === expectedValue ? null : `${field}:expected:${expectedValue}:actual:${state.value}`
      })
      .filter((failure): failure is string => failure !== null)
  }, {
    message: 'live browser matrix route should hydrate expected semantic fields before classification',
    timeout: 30_000,
  }).toEqual([])
}

function classifyRouteState(url: string, bodyText: string): RouteFacts['routeState'] {
  const normalizedText = bodyText.replace(/\s+/g, ' ').trim()
  if (!normalizedText) return 'blank'
  if (/connecting to infrastructure|checking backend connectivity|infrastructure connection error|backend connectivity|too many requests|rate limited|http 429|unable to connect to clusters|data unavailable/i.test(normalizedText)) return 'startup-error'
  if (/session expired|redirecting to sign in/i.test(normalizedText)) return 'session-expired'
  try {
    const pathname = new URL(url).pathname
    if (pathname === '/login' || pathname.startsWith('/auth/')) return 'login'
  } catch {
    // Keep the text-based classification when Playwright reports a relative URL.
  }
  if (/continue with github|welcome back|sign in to manage/i.test(normalizedText)) return 'login'
  return 'live'
}

function writeBrowserMatrixReport(report: Record<string, unknown>) {
  const outDir = path.resolve(process.cwd(), 'test-results/reports/browser-matrix')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, `${report.browserName}.json`), safeJsonStringify(report))
}

async function captureScreenshot(page: Page, browserName: string, name: string): Promise<string | undefined> {
  const outDir = path.resolve(process.cwd(), 'test-results/reports/browser-matrix/screenshots', browserName)
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, `${sanitizeSegment(name)}.png`)
  await page.screenshot({ path: outPath, fullPage: false }).catch(() => undefined)
  return path.relative(process.cwd(), outPath)
}

async function collectRouteFacts(
  page: Page,
  browserName: string,
  projectName: string,
  route: MatrixRoute,
  groundTruth: ReturnType<typeof collectK8sGroundTruth>,
): Promise<RouteFacts> {
  const bodyText = await readBodyText(page)
  const currentUrl = page.url()
  const routeState = classifyRouteState(currentUrl, bodyText)
  const expectedMarkers = route.expectedMarkers?.(groundTruth) || []
  const missingMarkers = (expectedMarkers || []).filter(marker => markerMissing(bodyText, marker)).map(marker => String(marker))
  const expectedFields = route.expectedFields?.(groundTruth) || {}
  const actualFields = await readGroundtruthFields(page, expectedFields)
  const fieldMismatches = Object.entries(expectedFields)
    .map(([field, expected]) => {
      const actual = actualFields[field]
      if (!actual || actual.reason !== 'ok') {
        return {
          field,
          expected,
          actual: actual?.value ?? null,
          actualValues: actual?.values?.length ? actual.values : [null],
          reason: actual?.reason || 'missing',
        }
      }
      if (actual.value !== expected) {
        return {
          field,
          expected,
          actual: actual.value,
          actualValues: actual.values,
          reason: 'mismatch',
        }
      }
      return null
    })
    .filter((mismatch): mismatch is NonNullable<typeof mismatch> => mismatch !== null)
  const baseline: RouteFacts['baseline'] = { mode: 'disabled', status: 'skipped' }

  if (process.env.BROWSER_MATRIX_BASELINES === 'true') {
    baseline.mode = 'compare'
    try {
      await expect(page).toHaveScreenshot([browserName, `${sanitizeSegment(route.label)}.png`], {
        fullPage: false,
        animations: 'disabled',
        maxDiffPixelRatio: 0.02,
      })
      baseline.status = 'passed'
    } catch (error) {
      baseline.status = 'failed'
      baseline.error = error instanceof Error ? error.message : String(error)
    }
  }

  const layout = await page.evaluate(() => {
    type Box = {
      x: number
      y: number
      width: number
      height: number
    }

    function boxFor(selector: string): Box | null {
      const element = document.querySelector(selector)
      if (!element) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return {
        x: Number(rect.x.toFixed(2)),
        y: Number(rect.y.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
      }
    }

    function visibleTextBoxes(): Array<{ text: string; x: number; y: number; width: number; height: number }> {
      const boxes: Array<{ text: string; x: number; y: number; width: number; height: number }> = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node) {
        const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
        const element = node.parentElement
        if (text.length >= 2 && element) {
          const style = window.getComputedStyle(element)
          const hidden = element.closest('[aria-hidden="true"], [hidden], script, style')
          if (!hidden && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
            const range = document.createRange()
            range.selectNodeContents(node)
            for (const rect of Array.from(range.getClientRects())) {
              const inViewport = rect.width > 4
                && rect.height > 4
                && rect.bottom > 0
                && rect.right > 0
                && rect.top < window.innerHeight
                && rect.left < window.innerWidth
              if (inViewport) {
                boxes.push({
                  text: text.slice(0, 80),
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                })
              }
            }
          }
        }
        node = walker.nextNode()
      }
      return boxes
    }

    function collisionCount(): number {
      const boxes = visibleTextBoxes()
      let count = 0
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]
          const b = boxes[j]
          const overlapWidth = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
          const overlapHeight = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
          const overlapArea = overlapWidth * overlapHeight
          if (overlapArea <= 0) continue
          const smallerArea = Math.min(a.width * a.height, b.width * b.height)
          if (smallerArea > 0 && overlapArea / smallerArea > 0.30) count += 1
        }
      }
      return count
    }

    const clippedElementCount = Array.from(document.querySelectorAll('button, a, input, [role="button"], [role="menuitem"], [data-testid]'))
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        if (rect.width <= 4 || rect.height <= 4 || style.visibility === 'hidden' || style.display === 'none') return false
        return rect.right < -2
          || rect.bottom < -2
          || rect.left > window.innerWidth + 2
          || rect.top > window.innerHeight + 2
      }).length

    return {
      scrollOverflowX: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
      textCollisionCount: collisionCount(),
      clippedElementCount,
      boxes: {
        header: boxFor('header, [data-testid="topbar"], nav'),
        sidebar: boxFor('[data-testid="sidebar"], aside'),
        main: boxFor('main'),
        search: boxFor('input[placeholder*="Search" i], input[type="search"]'),
        filter: boxFor('button[aria-label*="filter" i], button[title*="filter" i]'),
        userMenu: boxFor('button[aria-label*="user" i], button[aria-label*="account" i]'),
        firstCard: boxFor('[data-card-id], [data-testid*="card"], [data-testid^="stat-block-"]'),
      },
    }
  })

  return {
    browserName,
    projectName,
    route: route.route,
    url: currentUrl,
    routeState,
    viewport: page.viewportSize(),
    status: routeState !== 'live' || missingMarkers.length > 0 || fieldMismatches.length > 0 || baseline.status === 'failed' ? 'failed' : 'passed',
    missingMarkers,
    fieldMismatches,
    bodyPreview: bodyText.replace(/\s+/g, ' ').trim().slice(0, 500),
    ...layout,
    baseline,
    screenshotPath: await captureScreenshot(page, browserName, `route-${route.label}`),
  }
}

async function collectTopLayerFact(page: Page) {
  return page.evaluate(() => {
    type Box = {
      x: number
      y: number
      width: number
      height: number
    }

    const semanticCandidates = Array.from(document.querySelectorAll([
      '[role="dialog"]',
      '[role="menu"]',
      '[aria-modal="true"]',
      '[data-radix-popper-content-wrapper]',
      '[class*="popover" i]',
      '[class*="dropdown" i]',
      '[class*="modal" i]',
      '[class*="menu" i]',
    ].join(',')))
    const fixedPanelCandidates = Array.from(document.querySelectorAll('body *')).filter((element) => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      const area = rect.width * rect.height
      const viewportArea = window.innerWidth * window.innerHeight
      return style.position === 'fixed'
        && rect.width >= 240
        && rect.height >= 180
        && area >= viewportArea * 0.08
        && area <= viewportArea * 0.85
        && rect.bottom > 0
        && rect.right > 0
        && rect.top < window.innerHeight
        && rect.left < window.innerWidth
    })
    const candidates = Array.from(new Set([...semanticCandidates, ...fixedPanelCandidates]))

    const visibleCandidates = candidates
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return { element, rect, zIndex: style.zIndex, position: style.position }
      })
      .filter(({ rect, element }) => {
        const style = window.getComputedStyle(element)
        return rect.width > 20
          && rect.height > 20
          && rect.bottom > 0
          && rect.right > 0
          && rect.top < window.innerHeight
          && rect.left < window.innerWidth
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && style.opacity !== '0'
      })
      .sort((a, b) => {
        const zA = Number.parseInt(a.zIndex, 10)
        const zB = Number.parseInt(b.zIndex, 10)
        const rankA = Number.isFinite(zA) ? zA : 0
        const rankB = Number.isFinite(zB) ? zB : 0
        return rankB - rankA || (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height)
      })

    const overlay = visibleCandidates[0]
    if (!overlay) {
      return {
        topmostIsOverlay: false,
        actualTopLayer: 'no visible overlay',
        overlayBox: null,
      }
    }

    const centerX = Math.min(window.innerWidth - 1, Math.max(0, overlay.rect.left + overlay.rect.width / 2))
    const centerY = Math.min(window.innerHeight - 1, Math.max(0, overlay.rect.top + overlay.rect.height / 2))
    const topElement = document.elementFromPoint(centerX, centerY)
    const topmostIsOverlay = Boolean(topElement && (topElement === overlay.element || overlay.element.contains(topElement)))
    const topDescriptor = topElement
      ? [
          topElement.tagName.toLowerCase(),
          topElement.id ? `#${topElement.id}` : '',
          topElement.className ? `.${String(topElement.className).replace(/\s+/g, '.').slice(0, 120)}` : '',
        ].join('')
      : 'none'

    const box: Box = {
      x: Number(overlay.rect.x.toFixed(2)),
      y: Number(overlay.rect.y.toFixed(2)),
      width: Number(overlay.rect.width.toFixed(2)),
      height: Number(overlay.rect.height.toFixed(2)),
    }

    return {
      topmostIsOverlay,
      actualTopLayer: topDescriptor,
      overlayBox: box,
      overlayZIndex: overlay.zIndex,
      overlayPosition: overlay.position,
    }
  })
}

async function exerciseControl(
  page: Page,
  browserName: string,
  route: string,
  control: string,
  locators: Array<ReturnType<Page['locator']>>,
): Promise<InteractionFacts> {
  const locator = await firstVisibleLocator(page, locators, OPTIONAL_INTERACTION_LOOKUP_TIMEOUT_MS)
  if (!locator) {
    return {
      browserName,
      route,
      control,
      status: 'skipped',
      error: 'control was not visible',
    }
  }

  try {
    await locator.click()
    await page.waitForTimeout(700)
    const topLayer = await collectTopLayerFact(page)
    const screenshotPath = await captureScreenshot(page, browserName, `interaction-${control}`)
    await page.keyboard.press('Escape').catch(() => undefined)
    return {
      browserName,
      route,
      control,
      status: topLayer.topmostIsOverlay ? 'passed' : 'failed',
      expectedTopLayer: 'opened overlay/menu/dialog should be topmost at its center point',
      actualTopLayer: topLayer.actualTopLayer,
      topmostIsOverlay: topLayer.topmostIsOverlay,
      overlayBox: topLayer.overlayBox,
      screenshotPath,
      error: topLayer.topmostIsOverlay ? undefined : 'opened overlay was not topmost',
    }
  } catch (error) {
    return {
      browserName,
      route,
      control,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

test('live browser matrix records route and interaction layout facts @intensive @live-site @browser-matrix @invariant:live-browser-matrix', async ({ page, browserName }, testInfo) => {
  test.skip(process.env.LIVE_SITE_TESTS !== 'true', 'browser matrix live checks require LIVE_SITE_TESTS=true')

  const baseUrl = liveCanaryUrl()
  expect(baseUrl, 'live canary URL is required for browser matrix checks').toBeTruthy()

  const projectBrowser = browserName
  const report = {
    browserName: projectBrowser,
    projectName: testInfo.project.name,
    baseUrl,
    viewport: page.viewportSize(),
    runId: process.env.GITHUB_RUN_ID || String(Date.now()),
    routes: [] as RouteFacts[],
    interactions: [] as InteractionFacts[],
    session: { status: 'pending' as 'pending' | 'passed' | 'failed', error: undefined as string | undefined },
  }

  const groundTruth = collectK8sGroundTruth()

  try {
    await establishLiveCanarySession(page, baseUrl!)
    report.session.status = 'passed'
  } catch (error) {
    report.session.status = 'failed'
    report.session.error = error instanceof Error ? error.message : String(error)
  }

  if (report.session.status === 'passed') {
    for (const route of coreRoutes) {
      try {
        const response = await gotoLiveCanaryRoute(page, baseUrl!, route.route)
        await dismissOptionalLiveOverlays(page)
        await page.waitForLoadState('domcontentloaded').catch(() => undefined)
        await waitForRouteHandshakeSettled(page).catch(() => undefined)
        await waitForExpectedMarkers(page, route.expectedMarkers?.(groundTruth) || []).catch(() => undefined)
        await waitForExpectedFields(page, route.expectedFields?.(groundTruth) || {}).catch(() => undefined)
        const facts = await collectRouteFacts(page, projectBrowser, testInfo.project.name, route, groundTruth)
        if (response && !response.ok() && response.status() !== 304) {
          facts.status = 'failed'
          facts.error = `HTTP ${response?.status() ?? 'no response'}`
        }
        report.routes.push(facts)
      } catch (error) {
        report.routes.push({
          browserName: projectBrowser,
          projectName: testInfo.project.name,
          route: route.route,
          url: page.url(),
          routeState: classifyRouteState(page.url(), await readBodyText(page, 1_000)),
          viewport: page.viewportSize(),
          status: 'failed',
          missingMarkers: (route.expectedMarkers?.(groundTruth) || []).map(marker => String(marker)),
          fieldMismatches: Object.entries(route.expectedFields?.(groundTruth) || {})
            .map(([field, expected]) => ({ field, expected, actual: null })),
          bodyPreview: (await readBodyText(page, 1_000)).replace(/\s+/g, ' ').trim().slice(0, 500),
          scrollOverflowX: 0,
          textCollisionCount: 0,
          clippedElementCount: 0,
          boxes: {},
          screenshotPath: await captureScreenshot(page, projectBrowser, `route-${route.label}-error`),
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    await gotoLiveCanaryRoute(page, baseUrl!, '/').catch(() => undefined)
    await dismissOptionalLiveOverlays(page)
    report.interactions.push(await exerciseControl(page, projectBrowser, '/', 'filter', [
      page.getByRole('button', { name: /filter/i }).first(),
      page.locator('button[aria-label*="filter" i]').first(),
      page.locator('button[title*="filter" i]').first(),
    ]))
    report.interactions.push(await exerciseControl(page, projectBrowser, '/', 'stats-settings', [
      page.getByRole('button', { name: /configure stats/i }).first(),
      page.locator('button[title*="configure" i]').first(),
    ]))
    report.interactions.push(await exerciseControl(page, projectBrowser, '/', 'user-menu', [
      page.locator('button').filter({ hasText: /console-live-canary|dev-user|live-canary-ui/i }).first(),
      page.getByRole('button', { name: /console-live-canary|dev-user|live-canary-ui|account|user/i }).first(),
      page.locator('button[aria-label*="user" i], button[aria-label*="account" i]').first(),
    ]))
    report.interactions.push(await exerciseControl(page, projectBrowser, '/', 'alerts-or-issues', [
      page.getByRole('button', { name: /critical|warning|alert|issue/i }).first(),
      page.getByText(/\d+\s+(critical|warnings?|issues?)/i).first(),
    ]))
    report.interactions.push(await exerciseControl(page, projectBrowser, '/', 'ai-missions', [
      page.getByRole('button', { name: /AI Missions/i }).first(),
      page.getByText(/AI Missions/i).first(),
    ]))
  }

  writeBrowserMatrixReport(report)
})
