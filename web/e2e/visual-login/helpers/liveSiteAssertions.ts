import { expect, type Page, type TestInfo } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { safeJsonStringify } from '../../../harness/evidence/sanitizeEvidence'
import type { EvidenceCollectors, LiveUiFailureEvidence } from '../../../harness/evidence/evidenceTypes'
import {
  assertDashboardContentVisible,
  assertNoSevereOverlap,
  assertNotBlank,
  assertNotStuckLoading,
  assertUrlIsNotAuth,
  firstVisibleLocator,
} from './visualLoginAssertions'

export type LiveSiteAuthMode = 'dev' | 'preauthenticated' | 'signed-cookie' | 'none'

const LIVE_CANARY_TEST_USER = {
  id: 'live-canary-ui',
  github_id: 'live-canary-ui',
  github_login: 'live-canary-ui',
  email: 'live-canary-ui@example.invalid',
  avatar_url: 'https://api.dicebear.com/9.x/identicon/svg?seed=live-canary-ui',
  role: 'admin',
  onboarded: true,
} as const

const LIVE_NAVIGATION_ATTEMPTS = 3
const TEXT_COLLISION_RATIO_LIMIT = 0.30
let lastLiveRouteNavigationAt = 0

type LiveApiEndpointFact = {
  status: number | null
  count: number | null
  error?: string
}

export type LiveApiFacts = {
  endpoints: Record<string, LiveApiEndpointFact>
  clusters: {
    total: number | null
    healthy: number | null
    nodesTotal: number | null
    nodesReady: number | null
    podsTotal: number | null
    podsRunning: number | null
  }
  nodes: {
    total: number | null
    ready: number | null
  }
  pods: {
    total: number | null
    running: number | null
    pending: number | null
    crashLoopBackOff: number | null
  }
  deployments: {
    total: number | null
    available: number | null
  }
  namespaces: {
    total: number | null
    partial: boolean
    failedClusters: string[]
  }
}

export type LiveApiFactScope = 'all' | 'dashboard' | 'clusters' | 'nodes' | 'pods' | 'namespaces' | 'deployments' | 'alerts'

type LiveNetworkClassification = {
  classification: string
  method?: string
  status?: number
  url: string
}

type GroundtruthFieldState = {
  field: string
  markerCount: number
  rawValues: string[]
  values: number[]
  reason: 'missing' | 'unparseable' | 'duplicate-disagreement' | 'ok'
  value: number | null
}

const forbiddenLiveUiPatterns = [
  { label: 'demo mode control', source: String.raw`\bDemo Mode\b`, flags: 'i' },
  { label: 'connection log drawer', source: String.raw`\bConnection Log\b`, flags: 'i' },
  { label: 'local agent refresh warning', source: String.raw`Refreshing local agent`, flags: 'i' },
  { label: 'endpoint error summary', source: String.raw`endpoint errors?`, flags: 'i' },
  { label: 'AI prediction load failure', source: String.raw`/predictions/ai\s*-\s*Load failed`, flags: 'i' },
  { label: 'widget install prompt', source: String.raw`\bInstall widget\b`, flags: 'i' },
]

const optionalLiveNetworkPatterns = [
  /\/api\/github\/repos\//i,
  /\/api\/agent\/token(?:[/?]|$)/i,
  /\/api\/agent\/auto-update\//i,
  /\/api\/rewards\//i,
  /\/api\/medium\/blog/i,
  /\/api\/youtube\/playlist/i,
  /\/api\/active-users/i,
  /\/api\/token-usage\//i,
  /\/api\/feedback\//i,
  /\/api\/gitops\//i,
  /\/api\/public\/nightly-e2e\//i,
  /\/api\/mcp\/(?:pod-issues|gpu-nodes)\/stream(?:[/?]|$)/i,
  /\/api\/stellar\/stream(?:[/?]|$)/i,
  /\/api\/stellar\/(?:notifications|actions|tasks|activity|watches|solves)/i,
  /\/api\/kagenti-provider\/status/i,
]

export async function recordLiveUiFailures(page: Page, failures: LiveUiFailureEvidence) {
  await page.evaluate((nextFailures) => {
    const target = window as unknown as { __KC_LIVE_UI_FAILURES__?: LiveUiFailureEvidence }
    const current = target.__KC_LIVE_UI_FAILURES__ || {}
    const merged = { ...current } as Record<string, unknown>
    for (const [key, value] of Object.entries(nextFailures)) {
      if (Array.isArray(value)) {
        const existing = Array.isArray(merged[key]) ? merged[key] as unknown[] : []
        merged[key] = [...existing, ...value]
      } else if (value !== undefined) {
        merged[key] = value
      }
    }
    target.__KC_LIVE_UI_FAILURES__ = merged as LiveUiFailureEvidence
  }, failures).catch(() => undefined)
}

export function normalizeBaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value.replace(/\/+$/, '')
}

export function liveProductionUrl(): string | undefined {
  return normalizeBaseUrl(
    process.env.LIVE_PRODUCTION_CONSOLE_URL
    || process.env.LIVE_SITE_URL
    || process.env.CONSOLE_LIVE_URL,
  )
}

export function liveCanaryUrl(): string | undefined {
  const explicitCanary = normalizeBaseUrl(process.env.LIVE_CANARY_CONSOLE_URL)
  if (explicitCanary) return explicitCanary
  const selfHosted = normalizeBaseUrl(process.env.SELF_HOSTED_CONSOLE_URL)
  if (
    selfHosted
    && isConsoleLiveUrl(selfHosted)
    && !process.env.LIVE_SITE_AUTH_MODE
    && !process.env.LIVE_CANARY_AUTH_MODE
  ) {
    return undefined
  }
  return normalizeBaseUrl(
    selfHosted
    || process.env.VISUAL_LOGIN_BASE_URL
    || process.env.PLAYWRIGHT_BASE_URL,
  )
}

function isConsoleLiveUrl(value: string): boolean {
  try {
    return new URL(value).hostname.toLowerCase() === 'console-live.kubestellar.io'
  } catch {
    return false
  }
}

export function liveCanaryAuthMode(baseUrl?: string): LiveSiteAuthMode {
  const rawValue = (process.env.LIVE_SITE_AUTH_MODE || process.env.LIVE_CANARY_AUTH_MODE || 'dev').toLowerCase()
  if (rawValue === 'preauth' || rawValue === 'preauthenticated' || rawValue === 'storage-state') return 'preauthenticated'
  if (rawValue === 'signed-cookie' || rawValue === 'cookie' || rawValue === 'production-cookie') return 'signed-cookie'
  if (rawValue === 'none' || rawValue === 'unauthenticated') return 'none'
  if (!process.env.LIVE_SITE_AUTH_MODE && !process.env.LIVE_CANARY_AUTH_MODE && baseUrl && isConsoleLiveUrl(baseUrl)) {
    throw new Error('Authenticated live UI tests need LIVE_SITE_AUTH_MODE=signed-cookie, preauthenticated, or none when targeting production OAuth.')
  }
  return 'dev'
}

async function seedPreauthenticatedLiveCanarySession(page: Page) {
  await page.route('**/api/me', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(LIVE_CANARY_TEST_USER),
    })
  )
  await page.addInitScript((user) => {
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('kc-demo-mode', 'false')
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
    localStorage.setItem('kc-agent-setup-snoozed', String(Date.now() + 24 * 60 * 60 * 1000))
    localStorage.setItem('token', 'live-canary-test-token')
    localStorage.setItem('kc-user-cache', JSON.stringify(user))
    localStorage.setItem('kc-user-cache-validated', String(Date.now()))
  }, LIVE_CANARY_TEST_USER)
}

function liveRouteDelayMs(): number {
  const rawValue = process.env.LIVE_CANARY_ROUTE_DELAY_MS || '15000'
  const parsed = Number(rawValue)
  const configuredDelay = Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  const rawMinimum = process.env.LIVE_CANARY_MIN_ROUTE_DELAY_MS
    || (process.env.LIVE_SITE_TESTS === 'true' || process.env.LIVE_CLUSTER_TESTS === 'true' ? '15000' : '0')
  const minimum = Number(rawMinimum)
  const minimumDelay = Number.isFinite(minimum) && minimum > 0 ? minimum : 0
  return Math.max(configuredDelay, minimumDelay)
}

async function paceLiveRoute(page: Page) {
  const delayMs = liveRouteDelayMs()
  if (delayMs <= 0) return
  const elapsedMs = Date.now() - lastLiveRouteNavigationAt
  if (lastLiveRouteNavigationAt > 0 && elapsedMs < delayMs) {
    await page.waitForTimeout(delayMs - elapsedMs)
  }
  lastLiveRouteNavigationAt = Date.now()
}

function consumeSignedLiveSessionJwtFromFile(): string | undefined {
  const filePath = process.env.CONSOLE_LIVE_TEST_SESSION_JWT_FILE || process.env.LIVE_SITE_TEST_SESSION_JWT_FILE
  if (!filePath) return undefined

  const resolvedPath = path.resolve(filePath)
  const tokens = fs.readFileSync(resolvedPath, 'utf8')
    .split(/\r?\n/)
    .map(token => token.trim())
    .filter(Boolean)
  const token = tokens.shift()
  if (!token) {
    throw new Error(`${path.basename(resolvedPath)} has no remaining live session JWTs. Increase CONSOLE_LIVE_TEST_SESSION_COUNT in the workflow.`)
  }
  fs.writeFileSync(resolvedPath, tokens.length > 0 ? `${tokens.join('\n')}\n` : '')
  return token
}

function signedLiveSessionJwt(): string | undefined {
  return consumeSignedLiveSessionJwtFromFile()
    || process.env.CONSOLE_LIVE_TEST_SESSION_JWT
    || process.env.LIVE_SITE_TEST_SESSION_JWT
}

async function seedSignedLiveCookieSession(page: Page, baseUrl: string) {
  const jwt = signedLiveSessionJwt()
  if (!jwt) {
    throw new Error('LIVE_SITE_AUTH_MODE=signed-cookie requires CONSOLE_LIVE_TEST_SESSION_JWT_FILE, CONSOLE_LIVE_TEST_SESSION_JWT, or LIVE_SITE_TEST_SESSION_JWT.')
  }

  const url = new URL(baseUrl)
  const githubLogin = process.env.CONSOLE_LIVE_TEST_GITHUB_LOGIN || 'console-live-canary'
  const userId = process.env.CONSOLE_LIVE_TEST_USER_ID || 'console-live-test-user'
  const role = process.env.CONSOLE_LIVE_TEST_USER_ROLE || 'admin'
  await page.context().addCookies([{
    name: 'kc_auth',
    value: jwt,
    domain: url.hostname,
    path: '/',
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'Strict',
    expires: Math.floor(Date.now() / 1000) + 1_800,
  }])
  await page.addInitScript((user) => {
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('kc-demo-mode', 'false')
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
    localStorage.setItem('kc-agent-setup-snoozed', String(Date.now() + 24 * 60 * 60 * 1000))
    localStorage.setItem('kc-user-cache', JSON.stringify(user))
    localStorage.setItem('kc-user-cache-validated', String(Date.now()))
    localStorage.removeItem('token')
  }, {
    id: userId,
    github_id: githubLogin,
    github_login: githubLogin,
    email: `${githubLogin}@users.noreply.github.com`,
    avatar_url: '',
    role,
    onboarded: true,
  })
}

export async function dismissOptionalLiveOverlays(page: Page) {
  const dismissCandidates = [
    page.getByRole('button', { name: /remind me later/i }).first(),
    page.getByRole('button', { name: /don't show again|do not show again/i }).first(),
    page.locator('button[aria-label*="close" i], button[title*="close" i]').first(),
  ]
  for (const candidate of dismissCandidates) {
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click().catch(() => undefined)
      await page.waitForTimeout(250)
    }
  }
  await page.keyboard.press('Escape').catch(() => undefined)
}

export async function gotoLiveCanaryRoute(
  page: Page,
  baseUrl: string,
  route: string,
  waitUntil: 'commit' | 'domcontentloaded' = 'domcontentloaded',
) {
  const targetUrl = new URL(route, baseUrl).toString()
  let lastError: unknown
  for (let attempt = 1; attempt <= LIVE_NAVIGATION_ATTEMPTS; attempt += 1) {
    try {
      await paceLiveRoute(page)
      return await page.goto(targetUrl, { waitUntil, timeout: 30_000 })
    } catch (error) {
      lastError = error
      if (attempt === LIVE_NAVIGATION_ATTEMPTS) break
      await page.waitForTimeout(1_000)
    }
  }
  throw lastError
}

export async function establishLiveCanarySession(page: Page, baseUrl: string) {
  const mode = liveCanaryAuthMode(baseUrl)
  if (mode === 'none') return
  if (mode === 'preauthenticated') {
    await seedPreauthenticatedLiveCanarySession(page)
    await gotoLiveCanaryRoute(page, baseUrl, '/clusters')
    await dismissOptionalLiveOverlays(page)
    await expect(page.locator('body'), 'preauthenticated live canary session must render a page body').not.toHaveText('', {
      timeout: 15_000,
    })
    return
  }
  if (mode === 'signed-cookie') {
    await seedSignedLiveCookieSession(page, baseUrl)
    await gotoLiveCanaryRoute(page, baseUrl, '/')
    await dismissOptionalLiveOverlays(page)
    await expect
      .poll(() => page.evaluate(async () => {
        try {
          const response = await fetch('/api/me', { credentials: 'same-origin' })
          return response.status
        } catch {
          return 0
        }
      }), {
        message: 'signed live canary cookie must validate against /api/me before dashboard navigation',
        timeout: 20_000,
      })
      .toBe(200)
    await expect(page.locator('body'), 'signed live canary session must not show login or session-expired UI').not.toContainText(/sign in|session expired/i, {
      timeout: 15_000,
    })
    return
  }

  await gotoLiveCanaryRoute(page, baseUrl, '/auth/github', 'commit')
  await page.waitForURL(url => !url.pathname.startsWith('/auth/callback'), { timeout: 15_000 }).catch(() => undefined)
  await expect
    .poll(() => page.evaluate(async () => {
      try {
        const response = await fetch('/api/me', { credentials: 'same-origin' })
        return response.status
      } catch {
        return 0
      }
    }), {
      message: 'live canary dev session must validate against /api/me before dashboard navigation',
      timeout: 20_000,
    })
    .toBe(200)
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('token')), {
      message: 'live canary dev login should settle into cookie-only auth before loading live data',
      timeout: 20_000,
    })
    .toBeNull()
  await page.waitForTimeout(2_000)
  await page.evaluate(() => {
    localStorage.setItem('kc-has-session', 'true')
    localStorage.setItem('kc-demo-mode', 'false')
    localStorage.setItem('kc-agent-setup-dismissed', 'true')
    localStorage.setItem('kc-agent-setup-snoozed', String(Date.now() + 24 * 60 * 60 * 1000))
    if (localStorage.getItem('token') === 'demo-token') {
      localStorage.removeItem('token')
    }
  })
  await dismissOptionalLiveOverlays(page)
}

export async function assertLiveDashboardShell(page: Page, route = 'live-shell') {
  const bodyText = await page.locator('body').innerText({ timeout: 2_000 }).catch(() => '')
  if (/infrastructure connection error|rate limited|too many requests|http 429/i.test(bodyText)) {
    markLiveRateLimitDataLoss(route, [{
      classification: 'live-rate-limit-data-loss',
      status: 429,
      url: 'visible-live-rate-limit-screen',
    }])
  }
  await assertUrlIsNotAuth(page)
  await assertDashboardContentVisible(page)
  await assertNotBlank(page)
  await assertNotStuckLoading(page)
  await expect(page.locator('[data-testid="login-page"]'), 'authenticated live UI must not show the login page').toHaveCount(0)
}

export async function assertLiveLayoutStable(page: Page) {
  const root = await page.evaluate(() => {
    const documentElement = document.documentElement
    const body = document.body
    return {
      scrollWidth: Math.max(documentElement.scrollWidth, body.scrollWidth),
      clientWidth: documentElement.clientWidth,
      blankCards: Array.from(document.querySelectorAll('[class*="card"], .glass, [data-card-id]')).filter((element) => {
        const rect = element.getBoundingClientRect()
        const text = (element.textContent || '').replace(/\s+/g, '').trim()
        const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0))
        const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0))
        const visibleArea = visibleWidth * visibleHeight
        const totalArea = rect.width * rect.height
        const visibleRatio = totalArea > 0 ? visibleArea / totalArea : 0
        return rect.width > 80 && rect.height > 40 && visibleRatio >= 0.7 && text.length === 0
      }).length,
      stuckLoaders: Array.from(document.querySelectorAll('[role="status"], .animate-spin')).filter((element) => {
        const rect = element.getBoundingClientRect()
        const text = (element.textContent || '').replace(/\s+/g, ' ').trim()
        const ariaLabel = element.getAttribute('aria-label') || ''
        const className = element.getAttribute('class') || ''
        const statusText = `${text} ${ariaLabel} ${className}`
        const inViewport = rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
        const screenReaderOnly = rect.width <= 1 && rect.height <= 1
        const benignStatus = /page tip|last updated|not yet updated/i.test(statusText)
        const loadingLike = /loading|collecting|refresh|sync|pending|animate-spin/i.test(statusText)
        return inViewport && !screenReaderOnly && !benignStatus && loadingLike
      }).length,
    }
  })

  expect(root.scrollWidth, 'live UI must not create horizontal page overflow').toBeLessThanOrEqual(root.clientWidth + 2)
  expect(root.blankCards, 'live UI must not render blank card shells after data load').toBe(0)
  expect(root.stuckLoaders, 'live UI must not leave visible loading spinners after the settle window').toBeLessThanOrEqual(2)

  const repeatedCards = page.locator('[data-card-id], [data-testid*="card"], [data-testid*="tile"]')
  if (await repeatedCards.count().catch(() => 0) > 1) {
    await assertNoSevereOverlap(page, repeatedCards)
  }
}

export async function assertNoForbiddenLiveUi(page: Page) {
  await page.waitForTimeout(2_000)
  const state = await page.evaluate((patterns) => {
    const compiled = patterns.map(pattern => ({
      label: pattern.label,
      regex: new RegExp(pattern.source, pattern.flags),
    }))

    function visibleTextNodes() {
      const nodes: Array<{ text: string; rect: DOMRect }> = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node) {
        const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
        const element = node.parentElement
        if (text && element) {
          const style = window.getComputedStyle(element)
          const hidden = element.closest('[aria-hidden="true"], [hidden]')
          if (!hidden && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
            const range = document.createRange()
            range.selectNodeContents(node)
            for (const rect of Array.from(range.getClientRects())) {
              const inViewport = rect.width > 1
                && rect.height > 1
                && rect.bottom > 0
                && rect.right > 0
                && rect.top < window.innerHeight
                && rect.left < window.innerWidth
              if (inViewport) nodes.push({ text, rect })
            }
          }
        }
        node = walker.nextNode()
      }
      return nodes
    }

    const textNodes = visibleTextNodes()
    const forbiddenMatches = compiled.flatMap(pattern =>
      textNodes
        .filter(node => pattern.regex.test(node.text))
        .map(node => ({ label: pattern.label, text: node.text.slice(0, 160) }))
    )
    const agentStatusText = document.querySelector('[data-testid="navbar-agent-status-btn"]')?.textContent || ''
    if (/\boffline\b/i.test(agentStatusText)) {
      forbiddenMatches.push({
        label: 'offline live navbar status',
        text: agentStatusText.replace(/\s+/g, ' ').trim().slice(0, 160),
      })
    }
    const warningBadges = textNodes
      .map(node => {
        const match = node.text.match(/\b(\d+)\s+warnings?\b/i)
        return match ? { text: node.text.slice(0, 160), count: Number(match[1]) } : null
      })
      .filter((entry): entry is { text: string; count: number } => Boolean(entry && entry.count > 0))

    return {
      demoModeStorage: localStorage.getItem('kc-demo-mode'),
      forbiddenMatches,
      warningBadges,
    }
  }, forbiddenLiveUiPatterns)

  await recordLiveUiFailures(page, {
    forbiddenMatches: state.forbiddenMatches,
    warningBadges: process.env.LIVE_UI_ALLOW_WARNING_BADGES === 'true' ? [] : state.warningBadges,
  })
  expect(state.demoModeStorage, 'live UI must not keep demo mode enabled in localStorage').not.toBe('true')
  expect(state.forbiddenMatches, 'live UI must not show demo/local-agent/error drawer artifacts').toEqual([])
  if (process.env.LIVE_UI_ALLOW_WARNING_BADGES !== 'true') {
    expect(state.warningBadges, 'live UI must not show nonzero warning badges after settling').toEqual([])
  }
}

export async function assertNoVisibleTextCollisions(page: Page) {
  const collisions = await page.evaluate((ratioLimit) => {
    type TextBox = {
      text: string
      element: Element
      x: number
      y: number
      width: number
      height: number
    }

    function visibleTextBoxes(): TextBox[] {
      const boxes: TextBox[] = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node) {
        const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
        const element = node.parentElement
        if (text.length >= 2 && element) {
          const style = window.getComputedStyle(element)
          const hidden = element.closest('[aria-hidden="true"], [hidden], script, style, .sr-only, [data-groundtruth-field]')
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
                  element,
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

    const boxes = visibleTextBoxes()
    const failures: Array<{ first: string; second: string; ratio: number }> = []
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]
        const b = boxes[j]
        if (a.element === b.element || a.element.contains(b.element) || b.element.contains(a.element)) continue
        const overlapWidth = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
        const overlapHeight = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
        const overlapArea = overlapWidth * overlapHeight
        if (overlapArea <= 0) continue
        const smallerArea = Math.min(a.width * a.height, b.width * b.height)
        const ratio = smallerArea > 0 ? overlapArea / smallerArea : 0
        if (ratio > ratioLimit) {
          failures.push({ first: a.text, second: b.text, ratio: Number(ratio.toFixed(2)) })
          if (failures.length >= 12) return failures
        }
      }
    }
    return failures
  }, TEXT_COLLISION_RATIO_LIMIT)

  await recordLiveUiFailures(page, { textCollisions: collisions })
  expect(collisions, 'live UI visible text must not severely overlap').toEqual([])
}

async function successfulLiveApiEndpointKeys(page: Page, origin: string): Promise<Set<string>> {
  const endpointKeys = await page.evaluate(() =>
    ((window as unknown as { __KC_LIVE_SUCCESSFUL_API_ENDPOINTS__?: string[] }).__KC_LIVE_SUCCESSFUL_API_ENDPOINTS__ || [])
  ).catch(() => [])
  return new Set(endpointKeys.map(endpoint => normalizeEndpointKey(endpoint, origin)))
}

async function liveSessionStillValid(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    try {
      const response = await fetch('/api/me', { credentials: 'include' })
      return response.status === 200
    } catch {
      return false
    }
  }).catch(() => false)
}

function normalizeEndpointKey(rawUrl: string, origin: string): string {
  try {
    const url = new URL(rawUrl, origin)
    return `${url.pathname}${url.search}`
  } catch {
    return rawUrl.replace(/^https?:\/\/[^/]+/i, '')
  }
}

function isRecoveredAuthBoundaryResponse(
  entry: { status?: number; url: string },
  successfulEndpoints: Set<string>,
  origin: string,
  sessionStillValid = false,
): boolean {
  if (entry.status !== 401) return false
  const endpointKey = normalizeEndpointKey(entry.url, origin)
  if (successfulEndpoints.has(endpointKey)) return true
  return sessionStillValid && endpointKey.startsWith('/api/mcp/')
}

export async function assertNoUnexpectedLiveNetworkErrors(
  page: Page,
  collectors: EvidenceCollectors,
  baseUrl: string,
  additionalAllowed: RegExp[] = [],
  route = 'network-check',
) {
  const origin = new URL(baseUrl).origin
  const allowed = [
    /\/favicon\.ico$/i,
    ...optionalLiveNetworkPatterns,
    ...additionalAllowed,
  ]
  const successfulEndpoints = await successfulLiveApiEndpointKeys(page, origin)
  const sessionStillValid = await liveSessionStillValid(page)
  const recoveredAuthResponses = collectors.errorResponses
    .filter(entry => {
      try {
        return new URL(entry.url).origin === origin
      } catch {
        return false
      }
    })
    .filter(entry => isRecoveredAuthBoundaryResponse(entry, successfulEndpoints, origin, sessionStillValid))
    .map(entry => `${entry.method} ${entry.status} ${entry.url}`)
  const unexpectedResponses = collectors.errorResponses
    .filter(entry => {
      try {
        return new URL(entry.url).origin === origin
      } catch {
        return false
      }
    })
    .filter(entry => !isRecoveredAuthBoundaryResponse(entry, successfulEndpoints, origin, sessionStillValid))
    .filter(entry => !allowed.some(pattern => pattern.test(entry.url)))
    .map(entry => `${entry.method} ${entry.status} ${entry.url}`)
  const unexpectedFailures = collectors.failedRequests
    .filter(entry => {
      try {
        return new URL(entry.url).origin === origin
      } catch {
        return false
      }
    })
    .filter(entry => !allowed.some(pattern => pattern.test(entry.url)))
    .filter(entry => !/net::ERR_ABORTED/i.test(entry.failureText || ''))
    .map(entry => `${entry.method} ${entry.url} ${entry.failureText || ''}`.trim())

  const networkClassifications = collectors.errorResponses
    .filter(entry => {
      try {
        return new URL(entry.url).origin === origin
      } catch {
        return false
      }
    })
    .flatMap(entry => {
      if (isRecoveredAuthBoundaryResponse(entry, successfulEndpoints, origin, sessionStillValid)) {
        return [{
          classification: 'auth-boundary-recovered',
          method: entry.method,
          status: entry.status,
          url: entry.url,
        }]
      }
      const classification = networkClassification(entry.status, entry.url)
      return classification
        ? [{ classification, method: entry.method, status: entry.status, url: entry.url }]
        : []
    })
  const rateLimitDataLoss = networkClassifications.filter(item => item.classification === 'live-rate-limit-data-loss')
  if (rateLimitDataLoss.length > 0) {
    markLiveRateLimitDataLoss(route, rateLimitDataLoss)
  }

  collectors.liveUiFailures = {
    ...(collectors.liveUiFailures || {}),
    unexpectedNetworkResponses: unexpectedResponses,
    unexpectedRequestFailures: unexpectedFailures,
    recoveredAuthBoundaryResponses: recoveredAuthResponses,
    networkClassifications: [
      ...((collectors.liveUiFailures || {}).networkClassifications || []),
      ...networkClassifications,
    ],
  }
  expect(unexpectedResponses, 'live UI must not produce unexpected app-origin 4xx/5xx responses').toEqual([])
  expect(unexpectedFailures, 'live UI must not produce unexpected app-origin request failures').toEqual([])
}

export async function assertProductionOAuthBoundary(page: Page, baseUrl: string) {
  const health = await page.request.get(new URL('/health', baseUrl).toString()).catch(() => null)
  const healthz = health?.ok() ? health : await page.request.get(new URL('/healthz', baseUrl).toString()).catch(() => null)
  expect(healthz?.ok(), 'production live health endpoint must be reachable').toBeTruthy()

  const apiMe = await page.request.get(new URL('/api/me', baseUrl).toString(), { failOnStatusCode: false })
  expect(apiMe.status(), 'production live /api/me must require authentication').toBe(401)

  const oauth = await page.request.get(new URL('/auth/github', baseUrl).toString(), {
    failOnStatusCode: false,
    maxRedirects: 0,
  })
  expect([302, 303, 307, 308], 'production live /auth/github must redirect to OAuth').toContain(oauth.status())
  const location = oauth.headers().location || ''
  expect(location, 'production live OAuth redirect must target a GitHub-style authorize endpoint').toMatch(/\/login\/oauth\/authorize|github\.com/i)
}

export async function assertFixtureNamesVisible(page: Page, names: string[]) {
  for (const name of names) {
    const visible = await firstVisibleLocator(page, [
      page.getByText(name, { exact: false }),
      page.locator(`[aria-label*="${name}"]`),
    ])
    expect(visible, `live fixture ${name} should be visible in the authenticated UI`).not.toBeNull()
  }
}

export function writeLiveSiteReport(entry: Record<string, unknown>) {
  const outDir = path.resolve(process.cwd(), 'test-results/reports')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'live-site.json')
  const existing = readJsonArrayFile<Record<string, unknown>>(outPath)
  existing.push({ timestamp: new Date().toISOString(), ...entry })
  fs.writeFileSync(outPath, safeJsonStringify(existing))
}

export function writeLiveRouteEvidence(entry: Record<string, unknown>) {
  const outDir = path.resolve(process.cwd(), 'test-results/reports')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'live-routes.json')
  const existing = readJsonArrayFile<Record<string, unknown>>(outPath)
  existing.push({ timestamp: new Date().toISOString(), ...entry })
  fs.writeFileSync(outPath, safeJsonStringify(existing))
}

function readJsonArrayFile<T>(filePath: string): T[] {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T[]
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error
}

function liveRateLimitDataLossPath() {
  const outDir = process.env.RUNNER_TEMP
    ? path.resolve(process.env.RUNNER_TEMP, 'console-live')
    : path.resolve(process.cwd(), 'test-results/reports')
  fs.mkdirSync(outDir, { recursive: true })
  return path.join(outDir, 'live-rate-limit-data-loss.json')
}

function markLiveRateLimitDataLoss(route: string, classifications: LiveNetworkClassification[]) {
  const details = {
    timestamp: new Date().toISOString(),
    runId: process.env.GITHUB_RUN_ID || null,
    route,
    classifications,
  }
  fs.writeFileSync(liveRateLimitDataLossPath(), safeJsonStringify(details))
}

export function liveRateLimitDataLossSkipReason(): string | null {
  const markerPath = liveRateLimitDataLossPath()
  try {
    const details = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as { route?: string; classifications?: LiveNetworkClassification[] }
    const endpoints = (details.classifications || [])
      .map(item => `${item.url}${item.status ? ` (${item.status})` : ''}`)
      .join(', ')
    return `Skipping after core live Kubernetes API rate limit on ${details.route || 'an earlier route'}${endpoints ? `: ${endpoints}` : ''}.`
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return null
    }
    return 'Skipping after an earlier core live Kubernetes API rate-limit event.'
  }
}

function parseVisibleNumber(value: string | null): number | null {
  if (!value) return null
  const match = value.replace(/,/g, '').match(/-?\d+/)
  return match ? Number(match[0]) : null
}

const liveRateLimitDataLossEndpointPattern = /\/api\/(?:mcp\/)?(?:namespaces|nodes|pods|deployments|clusters)|\/api\/namespaces|\/api\/stellar\/state|\/api\/kagent\/status/i

function networkClassification(status: number | undefined, url: string): string | null {
  if (status === 429 && liveRateLimitDataLossEndpointPattern.test(url)) {
    return 'live-rate-limit-data-loss'
  }
  if (status === 502 && /\/api\/agent\/auto-update\/status/i.test(url)) {
    return 'local-agent-status-unreachable'
  }
  if (status && status >= 400 && optionalLiveNetworkPatterns.some(pattern => pattern.test(url))) {
    return 'optional-live-integration-unreachable'
  }
  if (status === 401) return 'auth-boundary'
  if (status && status >= 400) return 'live-network-error'
  return null
}

export async function collectLiveApiFacts(page: Page, scope: LiveApiFactScope = 'all'): Promise<LiveApiFacts> {
  return page.evaluate(async (factScope: LiveApiFactScope) => {
    type EndpointFact = { status: number | null; count: number | null; error?: string }
    const endpoints: Record<string, EndpointFact> = {}
    const successfulEndpointKeys = new Set(
      ((window as unknown as { __KC_LIVE_SUCCESSFUL_API_ENDPOINTS__?: string[] }).__KC_LIVE_SUCCESSFUL_API_ENDPOINTS__ || [])
    )
    const rememberSuccessfulEndpoint = (endpoint: string) => {
      const url = new URL(endpoint, window.location.origin)
      successfulEndpointKeys.add(`${url.pathname}${url.search}`)
      ;(window as unknown as { __KC_LIVE_SUCCESSFUL_API_ENDPOINTS__?: string[] }).__KC_LIVE_SUCCESSFUL_API_ENDPOINTS__ = [...successfulEndpointKeys]
    }
    const shouldFetch = (endpointScope: LiveApiFactScope) =>
      factScope === 'all'
      || factScope === endpointScope
      || (factScope === 'dashboard' && (endpointScope === 'clusters' || endpointScope === 'namespaces'))
    const retryAfterMs = (response: Response) => {
      const rawValue = response.headers.get('retry-after')
      const jitterMs = Math.floor(Math.random() * 1_000)
      if (!rawValue) return 2_000 + jitterMs
      const seconds = Number(rawValue)
      if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1_000, 1_000), 65_000) + jitterMs
      const dateMs = Date.parse(rawValue)
      if (Number.isFinite(dateMs)) return Math.min(Math.max(dateMs - Date.now(), 1_000), 65_000) + jitterMs
      return 2_000 + jitterMs
    }
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    async function getJson(endpoint: string): Promise<{ status: number | null; data: unknown; count: number | null; error?: string }> {
      try {
        let response = await fetch(endpoint, { credentials: 'include', headers: { Accept: 'application/json' } })
        if (response.status === 429) {
          await sleep(retryAfterMs(response))
          response = await fetch(endpoint, { credentials: 'include', headers: { Accept: 'application/json' } })
        }
        const text = await response.text()
        let data: unknown = null
        try {
          data = text ? JSON.parse(text) : null
        } catch {
          data = text
        }
        const count = Array.isArray(data)
          ? data.length
          : Array.isArray((data as { clusters?: unknown[] } | null)?.clusters)
            ? (data as { clusters: unknown[] }).clusters.length
            : Array.isArray((data as { nodes?: unknown[] } | null)?.nodes)
              ? (data as { nodes: unknown[] }).nodes.length
              : Array.isArray((data as { pods?: unknown[] } | null)?.pods)
                ? (data as { pods: unknown[] }).pods.length
                : Array.isArray((data as { deployments?: unknown[] } | null)?.deployments)
                  ? (data as { deployments: unknown[] }).deployments.length
                  : Array.isArray((data as { namespaces?: unknown[] } | null)?.namespaces)
                    ? (data as { namespaces: unknown[] }).namespaces.length
                    : null
        endpoints[endpoint] = { status: response.status, count }
        if (response.ok) {
          rememberSuccessfulEndpoint(endpoint)
        }
        return { status: response.status, data, count }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        endpoints[endpoint] = { status: null, count: null, error: message }
        return { status: null, data: null, count: null, error: message }
      }
    }

    const needsClusterSummary = shouldFetch('clusters') || factScope === 'namespaces'
    const clustersResponse = needsClusterSummary
      ? await getJson('/api/mcp/clusters')
      : { status: null, data: null, count: null }
    const clusters = Array.isArray((clustersResponse.data as { clusters?: unknown[] } | null)?.clusters)
      ? (clustersResponse.data as { clusters: Array<Record<string, unknown>> }).clusters
      : []
    const clusterNames = clusters.map(cluster =>
      String(cluster.context || cluster.name || '')
    ).filter(Boolean)
    const healthyClusters = clusters.filter(cluster => cluster.reachable !== false && cluster.healthy !== false)
    const clusterNodesTotal = clusters.reduce((sum, cluster) => sum + Number(cluster.nodeCount || 0), 0)
    const clusterNodesReady = clusters.reduce((sum, cluster) => sum + Number(cluster.readyNodes ?? cluster.nodeCount ?? 0), 0)
    const clusterPodsTotal = clusters.reduce((sum, cluster) => sum + Number(cluster.podCount || 0), 0)
    const clustersWithRunningPods = clusters.filter(cluster => typeof cluster.runningPods === 'number')
    const clusterPodsRunning = clustersWithRunningPods.length === clusters.length
      ? clustersWithRunningPods.reduce((sum, cluster) => sum + Number(cluster.runningPods || 0), 0)
      : null

    const nodesResponse = shouldFetch('nodes')
      ? await getJson('/api/mcp/nodes')
      : { status: null, data: null, count: null }
    const nodes = Array.isArray((nodesResponse.data as { nodes?: unknown[] } | null)?.nodes)
      ? (nodesResponse.data as { nodes: Array<Record<string, unknown>> }).nodes
      : []
    const readyNodes = nodes.filter(node =>
      String(node.status || '').toLowerCase() === 'ready'
      || (Array.isArray(node.conditions) && node.conditions.some((condition: Record<string, unknown>) =>
        condition.type === 'Ready' && condition.status === 'True'
      ))
    ).length

    const podsResponse = shouldFetch('pods')
      ? await getJson('/api/mcp/pods')
      : { status: null, data: null, count: null }
    const pods = Array.isArray((podsResponse.data as { pods?: unknown[] } | null)?.pods)
      ? (podsResponse.data as { pods: Array<Record<string, unknown>> }).pods
      : []
    const runningPods = pods.filter(pod => String(pod.status || '').toLowerCase() === 'running').length
    const pendingPods = pods.filter(pod => String(pod.status || '').toLowerCase() === 'pending').length
    const crashLoopPods = pods.filter(pod => /crashloopbackoff/i.test(String(pod.reason || pod.status || ''))).length

    const deploymentsResponse = shouldFetch('deployments')
      ? await getJson('/api/mcp/deployments')
      : { status: null, data: null, count: null }
    const deployments = Array.isArray((deploymentsResponse.data as { deployments?: unknown[] } | null)?.deployments)
      ? (deploymentsResponse.data as { deployments: Array<Record<string, unknown>> }).deployments
      : []
    const availableDeployments = deployments.filter(deployment =>
      String(deployment.status || '').toLowerCase() === 'running'
      || Number(deployment.availableReplicas || 0) > 0
      || (Number(deployment.readyReplicas || 0) === Number(deployment.replicas || 0) && Number(deployment.replicas || 0) > 0)
    ).length

    let namespacesTotal = 0
    let namespacesSucceeded = 0
    const namespaceFailedClusters: string[] = []
    if (shouldFetch('namespaces')) {
      for (const clusterName of clusterNames) {
        const namespaceResponse = await getJson(`/api/namespaces?cluster=${encodeURIComponent(clusterName)}`)
        if (namespaceResponse.status && namespaceResponse.status >= 200 && namespaceResponse.status < 300) {
          namespacesTotal += namespaceResponse.count || 0
          namespacesSucceeded += 1
        } else {
          namespaceFailedClusters.push(clusterName)
        }
      }
    }

    return {
      endpoints,
      clusters: {
        total: clustersResponse.status && clustersResponse.status < 400 ? clusters.length : null,
        healthy: clustersResponse.status && clustersResponse.status < 400 ? healthyClusters.length : null,
        nodesTotal: clustersResponse.status && clustersResponse.status < 400 ? clusterNodesTotal : null,
        nodesReady: clustersResponse.status && clustersResponse.status < 400 ? clusterNodesReady : null,
        podsTotal: clustersResponse.status && clustersResponse.status < 400 ? clusterPodsTotal : null,
        podsRunning: clustersResponse.status && clustersResponse.status < 400 ? clusterPodsRunning : null,
      },
      nodes: {
        total: nodesResponse.status && nodesResponse.status < 400 ? nodes.length : null,
        ready: nodesResponse.status && nodesResponse.status < 400 ? readyNodes : null,
      },
      pods: {
        total: podsResponse.status && podsResponse.status < 400 ? pods.length : null,
        running: podsResponse.status && podsResponse.status < 400 ? runningPods : null,
        pending: podsResponse.status && podsResponse.status < 400 ? pendingPods : null,
        crashLoopBackOff: podsResponse.status && podsResponse.status < 400 ? crashLoopPods : null,
      },
      deployments: {
        total: deploymentsResponse.status && deploymentsResponse.status < 400 ? deployments.length : null,
        available: deploymentsResponse.status && deploymentsResponse.status < 400 ? availableDeployments : null,
      },
      namespaces: {
        total: namespaceFailedClusters.length > 0 || (clusterNames.length > 0 && namespacesSucceeded === 0)
          ? null
          : namespacesTotal,
        partial: namespaceFailedClusters.length > 0 && namespacesSucceeded > 0,
        failedClusters: namespaceFailedClusters,
      },
    }
  }, scope)
}

function liveRouteMarkerMissing(bodyText: string, marker: string | RegExp): boolean {
  return typeof marker === 'string' ? !bodyText.includes(marker) : !marker.test(bodyText)
}

async function readGroundtruthFieldState(page: Page, field: string): Promise<GroundtruthFieldState> {
  const selector = `[data-groundtruth-field="${field}"]`
  const rawValues = await page.locator(selector).evaluateAll(elements =>
    elements.map(element => element.textContent || '')
  ).catch(() => [])
  const values = rawValues
    .map(value => parseVisibleNumber(value))
    .filter((value): value is number => value !== null)
  const uniqueValues = [...new Set(values)]
  const reason: GroundtruthFieldState['reason'] = rawValues.length === 0
    ? 'missing'
    : values.length !== rawValues.length || values.length === 0
      ? 'unparseable'
      : uniqueValues.length > 1
        ? 'duplicate-disagreement'
        : 'ok'
  return {
    field,
    markerCount: rawValues.length,
    rawValues,
    values,
    reason,
    value: reason === 'ok' ? uniqueValues[0] : null,
  }
}

export async function readGroundtruthFieldNumbers(page: Page, field: string): Promise<number[]> {
  return (await readGroundtruthFieldState(page, field)).values
}

export async function readGroundtruthFieldNumber(page: Page, field: string): Promise<number | null> {
  return (await readGroundtruthFieldState(page, field)).value
}

function groundtruthFieldMismatch(
  state: GroundtruthFieldState,
  expected: number,
  route: string,
): { field: string; expected: number; actual: number | null; actualValues: Array<number | null>; markerCount: number; route: string; reason: string } | null {
  if (state.reason !== 'ok') {
    return {
      field: state.field,
      expected,
      actual: state.value,
      actualValues: state.values.length > 0 ? state.values : [null],
      markerCount: state.markerCount,
      route,
      reason: state.reason,
    }
  }
  if (state.value !== expected) {
    return {
      field: state.field,
      expected,
      actual: state.value,
      actualValues: state.values,
      markerCount: state.markerCount,
      route,
      reason: 'mismatch',
    }
  }
  return null
}

export async function readLiveRouteState(page: Page): Promise<string | null> {
  return page.locator('[data-live-route-state]').first().getAttribute('data-live-route-state').catch(() => null)
}

export async function assertLiveRouteStateLoaded(page: Page, route: string) {
  const state = await readLiveRouteState(page)
  const bodyText = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '')
  const unavailable = state === 'unavailable'
    || state === 'partial'
    || /Unable to connect to clusters|Data unavailable/i.test(bodyText)
  if (unavailable) {
    await recordLiveUiFailures(page, {
      routeFailures: [{
        route,
        reason: `route rendered incomplete live data state${state ? ` (${state})` : ''}`,
        actual: bodyText.slice(0, 500),
      }],
    })
  }
  expect(unavailable, `live ${route} must render fully loaded live data state`).toBe(false)
}

export async function assertGroundtruthFields(page: Page, expected: Record<string, number>, route: string) {
  const readStates = async (): Promise<Record<string, GroundtruthFieldState>> => {
    const states: Record<string, GroundtruthFieldState> = {}
    for (const field of Object.keys(expected)) {
      states[field] = await readGroundtruthFieldState(page, field)
    }
    return states
  }

  await expect.poll(async () => {
    const current = await readStates()
    return Object.entries(expected)
      .map(([field, expectedValue]) => groundtruthFieldMismatch(current[field], expectedValue, route))
      .filter((mismatch): mismatch is NonNullable<typeof mismatch> => mismatch !== null)
      .map(mismatch => `${mismatch.field}: ${mismatch.reason}; expected ${mismatch.expected}, got ${mismatch.actualValues.join(', ')}`)
  }, {
    message: `live ${route} stats should hydrate to Kubernetes ground truth`,
    timeout: 30_000,
  }).toEqual([]).catch(() => undefined)

  const states = await readStates()
  const actual = Object.fromEntries(Object.entries(states).map(([field, state]) => [field, state.value]))

  const dashboardMismatches = Object.entries(expected)
    .map(([field, expectedValue]) => groundtruthFieldMismatch(states[field], expectedValue, route))
    .filter((mismatch): mismatch is NonNullable<typeof mismatch> => mismatch !== null)

  if (dashboardMismatches.length > 0) {
    await recordLiveUiFailures(page, { dashboardMismatches })
  }
  writeLiveRouteEvidence({
    route,
    kind: 'groundtruth-fields',
    expected,
    actual,
    mismatches: dashboardMismatches,
  })
  expect(dashboardMismatches, `live ${route} stats must match Kubernetes ground truth`).toEqual([])
}

export async function assertLiveApiUiFields(page: Page, apiFacts: LiveApiFacts, route: string, expected: Record<string, number | null>) {
  const expectedComparable = Object.fromEntries(
    Object.entries(expected).filter(([, expectedValue]) => expectedValue !== null)
  ) as Record<string, number>
  const readStates = async (): Promise<Record<string, GroundtruthFieldState>> => {
    const stateEntries = await Promise.all(
      Object.keys(expected).map(async field => [field, await readGroundtruthFieldState(page, field)] as const)
    )
    return Object.fromEntries(stateEntries)
  }

  await expect.poll(async () => {
    const current = await readStates()
    return Object.entries(expectedComparable)
      .map(([field, expectedValue]) => groundtruthFieldMismatch(current[field], expectedValue, route))
      .filter((mismatch): mismatch is NonNullable<typeof mismatch> => mismatch !== null)
      .map(mismatch => `${mismatch.field}: ${mismatch.reason}; expected ${mismatch.expected}, got ${mismatch.actualValues.join(', ')}`)
  }, {
    message: `live ${route} UI fields should hydrate to authenticated API data`,
    timeout: 20_000,
  }).toEqual([]).catch(() => undefined)

  const states = await readStates()
  const actual = Object.fromEntries(Object.entries(states).map(([field, state]) => [field, state.value]))
  const mismatches = Object.entries(expectedComparable)
    .map(([field, expectedValue]) => groundtruthFieldMismatch(states[field], expectedValue, route))
    .filter((mismatch): mismatch is NonNullable<typeof mismatch> => mismatch !== null)

  const networkClassifications: LiveNetworkClassification[] = Object.entries(apiFacts.endpoints)
    .flatMap(([url, fact]) => {
      const classification = networkClassification(fact.status ?? undefined, url)
      return classification ? [{ classification, status: fact.status ?? undefined, url }] : []
    })
  const rateLimitDataLoss = networkClassifications
    .filter(item => item.classification === 'live-rate-limit-data-loss')
  if (rateLimitDataLoss.length > 0) {
    markLiveRateLimitDataLoss(route, rateLimitDataLoss)
  }

  if (mismatches.length || networkClassifications.length) {
    await recordLiveUiFailures(page, {
      apiUiMismatches: mismatches,
      networkClassifications,
    })
  }
  writeLiveRouteEvidence({
    route,
    kind: 'api-ui-fields',
    expected,
    actual,
    api: apiFacts,
    mismatches,
    networkClassifications,
  })
  const blockingNetworkClassifications = networkClassifications.filter(item =>
    item.classification !== 'local-agent-status-unreachable'
    && item.classification !== 'optional-live-integration-unreachable'
  )
  expect(mismatches, `live ${route} UI fields must match authenticated API data`).toEqual([])
  expect(blockingNetworkClassifications, `live ${route} authenticated resource APIs must not return blocking 4xx/5xx responses`).toEqual([])
}

export async function assertNoPositiveLiveCountContradictions(page: Page, route: string, expected: Record<string, number | null>) {
  const routeSurfaceText = await page.locator('[data-live-route-state]').first().innerText({ timeout: 5_000 }).catch(() => '')
  const bodyText = routeSurfaceText || await page.locator('main').innerText({ timeout: 5_000 }).catch(() => '')
  const checks: Array<{ field: string; value: number | null | undefined; pattern: RegExp; description: string }> = [
    {
      field: 'clusters',
      value: expected.clusters ?? expected['dashboard-clusters-total'] ?? expected['clusters-total'],
      pattern: /\b(?:0|no)[^\S\r\n]+clusters?[^\S\r\n]+(?:detected|found)\b/i,
      description: 'UI says no clusters are detected while live clusters exist',
    },
    {
      field: 'namespaces',
      value: expected.namespaces ?? expected['dashboard-namespaces-total'] ?? expected['namespaces-total'],
      pattern: /\b(?:0|no)[^\S\r\n]+namespaces?\b/i,
      description: 'UI says no namespaces exist while live namespaces exist',
    },
    {
      field: 'deployments',
      value: route === '/deployments'
        ? expected.deployments ?? expected['deployments-total']
        : expected['dashboard-deployments-total'] ?? null,
      pattern: /\b(?:0[^\S\r\n]+deployments|no[^\S\r\n]+deployments[^\S\r\n]+found)\b/i,
      description: 'UI says no deployments exist while live deployments exist',
    },
  ]

  const contradictions = checks
    .filter(check => typeof check.value === 'number' && check.value > 0 && check.pattern.test(bodyText))
    .map(check => ({
      route,
      field: check.field,
      expected: check.value as number,
      actual: check.description,
    }))

  if (contradictions.length) {
    await recordLiveUiFailures(page, {
      apiUiMismatches: contradictions,
      routeFailures: contradictions.map(item => ({
        route,
        reason: item.actual,
        expected: `${item.field} > 0`,
        actual: bodyText.slice(0, 500),
      })),
    })
    writeLiveRouteEvidence({
      route,
      kind: 'positive-count-contradiction',
      contradictions,
      bodyPreview: bodyText.slice(0, 1_000),
    })
  }
  expect(contradictions, `live ${route} must not show empty-state text for resources that exist`).toEqual([])
}

export async function assertLiveRouteContainsAny(page: Page, route: string, expected: Array<string | RegExp>) {
  await expect.poll(async () => {
    const text = await page.locator('body').innerText({ timeout: 500 }).catch(() => '')
    return expected.some(item => !liveRouteMarkerMissing(text, item))
  }, {
    message: `live route ${route} should hydrate at least one expected live-data marker`,
    timeout: 30_000,
  }).toBe(true).catch(() => undefined)

  const bodyText = await page.locator('body').innerText({ timeout: 10_000 }).catch(() => '')
  const matched = expected.some(item => typeof item === 'string' ? bodyText.includes(item) : item.test(bodyText))
  if (!matched) {
    const reason = `none of the expected markers were visible: ${expected.map(item => String(item)).join(', ')}`
    await recordLiveUiFailures(page, {
      routeFailures: [{ route, reason, expected: expected.map(item => String(item)).join(', '), actual: bodyText.slice(0, 500) }],
    })
  }
  writeLiveRouteEvidence({
    route,
    kind: 'route-content',
    expected: expected.map(item => String(item)),
    matched,
    bodyPreview: bodyText.slice(0, 500),
  })
  expect(matched, `live route ${route} must render expected live-data markers`).toBe(true)
}

export async function assertLiveRouteContainsAll(page: Page, route: string, expected: Array<string | RegExp>) {
  await expect.poll(async () => {
    const text = await page.locator('body').innerText({ timeout: 500 }).catch(() => '')
    return expected.filter(item => liveRouteMarkerMissing(text, item)).map(item => String(item))
  }, {
    message: `live route ${route} should hydrate all expected live-data markers`,
    timeout: 30_000,
  }).toEqual([]).catch(() => undefined)

  const bodyText = await page.locator('body').innerText({ timeout: 10_000 }).catch(() => '')
  const missing = expected.filter(item => liveRouteMarkerMissing(bodyText, item))
  if (missing.length > 0) {
    const reason = `missing expected markers: ${missing.map(item => String(item)).join(', ')}`
    await recordLiveUiFailures(page, {
      routeFailures: [{ route, reason, expected: expected.map(item => String(item)).join(', '), actual: bodyText.slice(0, 500) }],
    })
  }
  writeLiveRouteEvidence({
    route,
    kind: 'route-content',
    expected: expected.map(item => String(item)),
    missing: missing.map(item => String(item)),
    matched: missing.length === 0,
    bodyPreview: bodyText.slice(0, 500),
  })
  expect(missing, `live route ${route} must render all expected live-data markers`).toEqual([])
}

export function annotateLiveInvariant(testInfo: TestInfo, id: string) {
  testInfo.annotations.push({ type: 'invariant', description: id })
}
