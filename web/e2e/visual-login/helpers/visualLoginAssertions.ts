import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import { setupDemoMode } from '../../helpers/setup'
import type { EvidenceCollectors } from '../../../harness/evidence/evidenceTypes'

const CONTENT_TIMEOUT_MS = 10_000
const LOADING_SETTLE_MS = 1_500
const OVERLAP_RATIO_LIMIT = 0.18
const EXPECTED_CONSOLE_NOISE = [
  /ResizeObserver loop/i,
  /Failed to fetch/i,
  /localhost:8585|127\.0\.0\.1:8585/i,
  /\[mockApiFallback\]/i,
  /WebSocket/i,
  /ERR_CONNECTION_REFUSED/i,
  /sqlite/i,
  /Failed to load resource: the server responded with a status of (?:404|503)/i,
]

export function annotateInvariants(testInfo: TestInfo, invariantIds: string[]) {
  for (const invariantId of invariantIds) {
    testInfo.annotations.push({ type: 'invariant', description: invariantId })
  }
}

export async function setupLocalDemo(page: Page, route = '/') {
  await setupDemoMode(page)
  await page.goto(route, { waitUntil: 'domcontentloaded' })
}

export async function openDemoEntry(page: Page, route = '/') {
  if (process.env.PR_VISUAL_USE_HOSTED_DEMO === 'true') {
    const hostedUrl = process.env.HOSTED_DEMO_URL || 'https://console.kubestellar.io'
    await page.goto(hostedUrl, { waitUntil: 'domcontentloaded' })
    return 'hosted-demo'
  }
  await setupLocalDemo(page, route)
  return 'local-demo'
}

export async function assertNoBlockingGithubLogin(page: Page) {
  const blockers = [
    page.getByTestId('github-login-button'),
    page.getByRole('button', { name: /continue with github|sign in with github|github login/i }),
    page.getByRole('link', { name: /continue with github|sign in with github|github login/i }),
  ]
  for (const blocker of blockers) {
    const count = await blocker.count().catch(() => 0)
    for (let index = 0; index < count; index += 1) {
      await expect(blocker.nth(index), 'blocking GitHub sign-in must not be visible in demo mode').not.toBeVisible()
    }
  }
}

export async function assertUrlIsNotAuth(page: Page) {
  await expect(page, 'demo route must not land on login/signin/auth URL').not.toHaveURL(
    /\/(?:login|signin|auth)(?:$|[/?#])/i,
    { timeout: CONTENT_TIMEOUT_MS },
  )
}

export async function assertNotBlank(page: Page) {
  const result = await page.evaluate(() => {
    const root = document.querySelector('#root') || document.body
    const text = (document.body.textContent || '').replace(/\s+/g, ' ').trim()
    return {
      textLength: text.length,
      rootChildCount: root.childElementCount,
      bodyChildCount: document.body.childElementCount,
    }
  })
  expect(result.bodyChildCount, 'document body must contain rendered content').toBeGreaterThan(0)
  expect(result.rootChildCount, 'app root must contain rendered content').toBeGreaterThan(0)
  expect(result.textLength, 'page must contain meaningful visible text').toBeGreaterThan(40)
}

export async function firstVisibleLocator(page: Page, candidates: Locator[], timeoutMs = CONTENT_TIMEOUT_MS): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const candidate of candidates) {
      const count = await candidate.count().catch(() => 0)
      for (let index = 0; index < count; index += 1) {
        const item = candidate.nth(index)
        if (await item.isVisible().catch(() => false)) return item
      }
    }
    await page.waitForTimeout(250)
  }
  return null
}

export async function assertDashboardContentVisible(page: Page) {
  const visible = await firstVisibleLocator(page, [
    page.getByTestId('dashboard-header'),
    page.getByTestId('dashboard-title'),
    page.locator('main#main-content'),
    page.locator('[data-testid*="dashboard"]'),
    page.getByRole('heading', { name: /kubestellar|dashboard|clusters|workloads|missions/i }),
    page.getByText(/KubeStellar|Dashboard|Clusters|Workloads|Pods|Nodes|AI Missions/i),
  ])
  expect(visible, 'recognizable demo/dashboard content must be visible').not.toBeNull()
  if (visible) await expect(visible).toBeVisible()
}

export async function assertNotStuckLoading(page: Page) {
  await page.waitForTimeout(LOADING_SETTLE_MS)
  const contentVisible = await firstVisibleLocator(page, [
    page.getByTestId('dashboard-header'),
    page.getByTestId('dashboard-title'),
    page.locator('main#main-content >> text=/Dashboard|Clusters|Workloads|KubeStellar/i'),
  ])
  if (contentVisible) return
  const loading = page.locator('[role="status"], .animate-spin, text=/loading/i')
  const loadingCount = await loading.count().catch(() => 0)
  expect(loadingCount, 'page must not remain in an unrecoverable loading state').toBe(0)
}

export async function assertHostedDemoNoLoginInvariant(page: Page) {
  await assertUrlIsNotAuth(page)
  await assertNoBlockingGithubLogin(page)
  await assertNotBlank(page)
  await assertNotStuckLoading(page)
  await assertDashboardContentVisible(page)
}

export async function assertNoCriticalRuntimeErrors(collectors: EvidenceCollectors, additionalExpectedNoise: RegExp[] = []) {
  const expectedNoise = [...EXPECTED_CONSOLE_NOISE, ...additionalExpectedNoise]
  const unexpectedConsoleErrors = collectors.consoleErrors
    .map(entry => entry.text)
    .filter(text => !expectedNoise.some(pattern => pattern.test(text)))
  const unexpectedPageErrors = collectors.pageErrors
    .filter(text => !expectedNoise.some(pattern => pattern.test(text)))
  expect(unexpectedConsoleErrors, 'no critical console errors during visual/login startup').toEqual([])
  expect(unexpectedPageErrors, 'no uncaught page errors during visual/login startup').toEqual([])
}

export async function assertLocatorInsideViewport(page: Page, locator: Locator, label: string) {
  await expect(locator.first(), `${label} must be visible`).toBeVisible({ timeout: CONTENT_TIMEOUT_MS })
  const box = await locator.first().boundingBox()
  const viewport = page.viewportSize()
  expect(box, `${label} must have a layout box`).not.toBeNull()
  expect(viewport, 'viewport must be known').not.toBeNull()
  if (!box || !viewport) return
  expect(box.x, `${label} must not be clipped left`).toBeGreaterThanOrEqual(0)
  expect(box.y, `${label} must not be clipped top`).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width, `${label} must not be clipped right`).toBeLessThanOrEqual(viewport.width + 1)
  expect(box.y + box.height, `${label} must not be clipped bottom`).toBeLessThanOrEqual(viewport.height + 1)
}

export async function assertNoSevereOverlap(page: Page, locator: Locator) {
  const boxes = await locator.evaluateAll(elements => elements.map((element, index) => {
    const rect = element.getBoundingClientRect()
    const contains = elements
      .map((other, otherIndex) => index !== otherIndex && element.contains(other) ? otherIndex : -1)
      .filter(otherIndex => otherIndex >= 0)
    return { index, x: rect.x, y: rect.y, width: rect.width, height: rect.height, contains }
  }).filter((box) => {
    const meaningfulSize = box.width > 4 && box.height > 4
    const inViewport = box.x + box.width > 0
      && box.y + box.height > 0
      && box.x < window.innerWidth
      && box.y < window.innerHeight
    return meaningfulSize && inViewport
  }))
  if (boxes.length < 2) return
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]
      const b = boxes[j]
      if (a.contains.includes(b.index) || b.contains.includes(a.index)) continue
      const overlapWidth = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
      const overlapHeight = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
      const overlapArea = overlapWidth * overlapHeight
      const smallerArea = Math.min(a.width * a.height, b.width * b.height)
      const ratio = smallerArea > 0 ? overlapArea / smallerArea : 0
      expect(ratio, 'dashboard cards/primary controls must not severely overlap').toBeLessThan(OVERLAP_RATIO_LIMIT)
    }
  }
}

export function authModeFromEnv(): 'demo' | 'oauth' | 'unknown' {
  const configured = (process.env.VISUAL_LOGIN_AUTH_MODE || process.env.VITE_DEMO_MODE || '').toLowerCase()
  if (configured === 'demo' || configured === 'mock' || configured === 'true') return 'demo'
  if (configured === 'oauth' || configured === 'auth' || configured === 'full') return 'oauth'
  return 'unknown'
}
