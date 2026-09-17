import { expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

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
let lastLiveRouteNavigationAt = 0

// Runs fetch('/api/me') inside the page so the check exercises the real
// browser cookie jar + same-origin credentials path. fetch() rejections inside
// the page map to 0; an evaluate torn down by a navigation maps to the
// POLL_EVAL_CONTEXT_DESTROYED sentinel so expect.poll keeps retrying.
const POLL_EVAL_CONTEXT_DESTROYED = -1
function pollApiMeStatus(page: Page): Promise<number> {
  return page.evaluate(async () => {
    try {
      const response = await fetch('/api/me', { credentials: 'same-origin' })
      return response.status
    } catch {
      return 0
    }
  }).catch(() => POLL_EVAL_CONTEXT_DESTROYED)
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
  const cookieDomain = url.hostname === '127.0.0.1' || url.hostname === 'localhost' 
    ? undefined 
    : url.hostname
  await page.context().addCookies([{
    name: 'kc_auth',
    value: jwt,
    domain: cookieDomain,
    path: '/',
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'Lax',
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
      .poll(() => pollApiMeStatus(page), {
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
    .poll(() => pollApiMeStatus(page), {
      message: 'live canary dev session must validate against /api/me before dashboard navigation',
      timeout: 20_000,
    })
    .toBe(200)
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('token')).catch(() => 'poll-eval-context-destroyed'), {
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
