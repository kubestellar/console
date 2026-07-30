import { test, expect, request as playwrightRequest, type Page } from '@playwright/test'
import { createHmac, randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ELEMENT_VISIBLE_TIMEOUT_MS } from '../helpers/setup'

const TOKEN_REFRESH_TEST_TIMEOUT_MS = 45_000
const STORAGE_KEY_TOKEN = 'token'
const STORAGE_KEY_HAS_SESSION = 'kc-has-session'
const AUTH_COOKIE_NAME = 'kc_auth'
const DEFAULT_PLAYWRIGHT_BASE_URL = 'http://localhost:8080'
const HALF_LIFE_ELAPSED_TOKEN_AGE_MS = 3 * 60 * 60 * 1000
const HALF_LIFE_ELAPSED_TOKEN_REMAINING_MS = 60 * 60 * 1000
const FRESH_TOKEN_AGE_MS = 30 * 60 * 1000
const FRESH_TOKEN_REMAINING_MS = 90 * 60 * 1000
const CSRF_HEADER_VALUE = 'XMLHttpRequest'

const PLAYWRIGHT_BASE_URL = process.env.PLAYWRIGHT_BASE_URL || DEFAULT_PLAYWRIGHT_BASE_URL
const COOKIE_DOMAIN = new URL(PLAYWRIGHT_BASE_URL).hostname

type HealthResponse = {
  oauth_configured?: boolean
}

type AuthUser = {
  id: string
  github_login: string
  onboarded: boolean
}

type RefreshBody = {
  refreshed?: boolean
  onboarded?: boolean
}

type JwtClaims = {
  sub: string
  jti: string
  iat: number
  exp: number
  user_id: string
  github_login: string
}

type SignedToken = {
  token: string
  claims: JwtClaims
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decodeJwtClaims(token: string): JwtClaims {
  const [, payload = ''] = token.split('.')
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as JwtClaims
}

function signJwt(user: AuthUser, jwtSecret: string, issuedAtMs: number, expiresAtMs: number): SignedToken {
  const claims: JwtClaims = {
    sub: user.id,
    jti: randomUUID(),
    iat: Math.floor(issuedAtMs / 1000),
    exp: Math.floor(expiresAtMs / 1000),
    user_id: user.id,
    github_login: user.github_login,
  }
  const encodedHeader = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const encodedClaims = encodeBase64Url(JSON.stringify(claims))
  const unsignedToken = `${encodedHeader}.${encodedClaims}`
  const signature = createHmac('sha256', jwtSecret).update(unsignedToken).digest('base64url')

  return {
    token: `${unsignedToken}.${signature}`,
    claims,
  }
}

function loadJwtSecret(): string | null {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET
  }

  const specDir = dirname(fileURLToPath(import.meta.url))
  const secretPath = resolve(specDir, '../../.jwt-secret')
  if (!existsSync(secretPath)) {
    return null
  }

  return readFileSync(secretPath, 'utf8').trim() || null
}

async function expectDashboardVisible(page: Page): Promise<void> {
  await expect(page.getByTestId('dashboard-page')).toBeVisible({
    timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
  })
}

async function fetchHealth(page: Page): Promise<HealthResponse | null> {
  return page.request
    .get('/health')
    .then(async (response) => {
      if (!response.ok()) {
        return null
      }
      return (await response.json()) as HealthResponse
    })
    .catch(() => null)
}

async function loginDevUser(page: Page): Promise<AuthUser> {
  await page.goto('/auth/github')
  await expectDashboardVisible(page)

  const meResponse = await page.request.get('/api/me', {
    headers: { 'X-Requested-With': CSRF_HEADER_VALUE },
  })
  expect(meResponse.ok()).toBeTruthy()

  return (await meResponse.json()) as AuthUser
}

async function seedBrowserSession(page: Page, token: string, authCookieValue?: string): Promise<void> {
  await page.context().clearCookies()

  if (authCookieValue) {
    await page.context().addCookies([
      {
        name: AUTH_COOKIE_NAME,
        value: authCookieValue,
        domain: COOKIE_DOMAIN,
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Strict',
      },
    ])
  }

  await page.evaluate(
    ({ tokenKey, tokenValue, sessionKey }) => {
      localStorage.setItem(tokenKey, tokenValue)
      localStorage.setItem(sessionKey, 'true')
    },
    {
      tokenKey: STORAGE_KEY_TOKEN,
      tokenValue: token,
      sessionKey: STORAGE_KEY_HAS_SESSION,
    }
  )
}

async function getAuthCookieValue(page: Page): Promise<string | null> {
  const cookies = await page.context().cookies()
  return cookies.find((cookie) => cookie.name === AUTH_COOKIE_NAME)?.value || null
}

test.describe('JWT token refresh flow - real backend', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeEach(async ({ page }, testInfo) => {
    testInfo.setTimeout(TOKEN_REFRESH_TEST_TIMEOUT_MS)

    const health = await fetchHealth(page)
    test.skip(!health, 'Backend not reachable')
    test.skip(
      health?.oauth_configured === true,
      'This suite seeds dev-mode auth and skips interactive GitHub OAuth backends'
    )

    const jwtSecret = loadJwtSecret()
    test.skip(!jwtSecret, 'JWT secret not available for seeded refresh-flow tokens')
  })

  test('backend emits X-Token-Refresh only after the JWT passes half-life', async ({ page }) => {
    const jwtSecret = loadJwtSecret()
    expect(jwtSecret).not.toBeNull()

    const user = await loginDevUser(page)
    const now = Date.now()
    const agedToken = signJwt(
      user,
      jwtSecret!,
      now - HALF_LIFE_ELAPSED_TOKEN_AGE_MS,
      now + HALF_LIFE_ELAPSED_TOKEN_REMAINING_MS
    )
    const freshToken = signJwt(
      user,
      jwtSecret!,
      now - FRESH_TOKEN_AGE_MS,
      now + FRESH_TOKEN_REMAINING_MS
    )

    const probeContext = await playwrightRequest.newContext({ baseURL: PLAYWRIGHT_BASE_URL })

    const agedResponse = await probeContext.get('/api/dashboards', {
      headers: {
        Authorization: `Bearer ${agedToken.token}`,
        'X-Requested-With': CSRF_HEADER_VALUE,
      },
    })
    expect(agedResponse.ok()).toBeTruthy()
    expect(agedResponse.headers()['x-token-refresh']).toBe('true')

    const freshResponse = await probeContext.get('/api/dashboards', {
      headers: {
        Authorization: `Bearer ${freshToken.token}`,
        'X-Requested-With': CSRF_HEADER_VALUE,
      },
    })
    expect(freshResponse.ok()).toBeTruthy()
    expect(freshResponse.headers()['x-token-refresh']).toBeUndefined()

    await probeContext.dispose()
  })

  test('frontend refreshes the cookie session, rotates the cookie, and revokes the stale token', async ({
    page,
  }) => {
    const jwtSecret = loadJwtSecret()
    expect(jwtSecret).not.toBeNull()

    const user = await loginDevUser(page)
    const now = Date.now()
    const staleToken = signJwt(
      user,
      jwtSecret!,
      now - HALF_LIFE_ELAPSED_TOKEN_AGE_MS,
      now + HALF_LIFE_ELAPSED_TOKEN_REMAINING_MS
    )

    await seedBrowserSession(page, staleToken.token, staleToken.token)

    const refreshRequestPromise = page.waitForRequest((request) => {
      const url = new URL(request.url())
      return url.pathname === '/auth/refresh' && request.method() === 'POST'
    })
    const refreshResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname === '/auth/refresh' && response.request().method() === 'POST'
    })
    const refreshSignalPromise = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname === '/api/dashboards' && response.headers()['x-token-refresh'] === 'true'
    })

    await page.reload()
    await expectDashboardVisible(page)

    const refreshSignalResponse = await refreshSignalPromise
    expect(refreshSignalResponse.ok()).toBeTruthy()
    expect(refreshSignalResponse.headers()['x-token-refresh']).toBe('true')

    const refreshRequest = await refreshRequestPromise
    const refreshHeaders = await refreshRequest.allHeaders()
    expect(refreshHeaders['authorization']).toBeUndefined()
    expect(refreshHeaders['x-requested-with']).toBe(CSRF_HEADER_VALUE)

    const refreshResponse = await refreshResponsePromise
    expect(refreshResponse.status()).toBe(200)
    const refreshBody = (await refreshResponse.json()) as RefreshBody
    expect(refreshBody.refreshed).toBe(true)
    expect(refreshBody.onboarded).toBe(user.onboarded)

    await expect
      .poll(async () => {
        return getAuthCookieValue(page)
      })
      .not.toBe(staleToken.token)

    const rotatedCookie = await getAuthCookieValue(page)
    expect(rotatedCookie).not.toBeNull()

    const rotatedClaims = decodeJwtClaims(rotatedCookie!)
    expect(rotatedClaims.jti).not.toBe(staleToken.claims.jti)
    expect(rotatedClaims.sub).toBe(user.id)

    const revokedProbeContext = await playwrightRequest.newContext({ baseURL: PLAYWRIGHT_BASE_URL })
    const revokedResponse = await revokedProbeContext.get('/api/me', {
      headers: {
        Authorization: `Bearer ${staleToken.token}`,
        'X-Requested-With': CSRF_HEADER_VALUE,
      },
    })
    expect(revokedResponse.status()).toBe(401)
    await revokedProbeContext.dispose()

    await page.reload()
    await expectDashboardVisible(page)
    expect(await getAuthCookieValue(page)).toBe(rotatedCookie)
    expect(
      await page.evaluate((sessionKey) => localStorage.getItem(sessionKey), STORAGE_KEY_HAS_SESSION)
    ).toBe('true')
  })

  test('refresh failures leave the current session usable and do not rotate cookies', async ({ page }) => {
    const jwtSecret = loadJwtSecret()
    expect(jwtSecret).not.toBeNull()

    const user = await loginDevUser(page)
    const now = Date.now()
    const staleToken = signJwt(
      user,
      jwtSecret!,
      now - HALF_LIFE_ELAPSED_TOKEN_AGE_MS,
      now + HALF_LIFE_ELAPSED_TOKEN_REMAINING_MS
    )

    await seedBrowserSession(page, staleToken.token)

    const refreshRequestPromise = page.waitForRequest((request) => {
      const url = new URL(request.url())
      return url.pathname === '/auth/refresh' && request.method() === 'POST'
    })
    const refreshResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname === '/auth/refresh' && response.request().method() === 'POST'
    })
    const refreshSignalPromise = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname === '/api/dashboards' && response.headers()['x-token-refresh'] === 'true'
    })

    await page.reload()
    await expectDashboardVisible(page)

    const refreshSignalResponse = await refreshSignalPromise
    expect(refreshSignalResponse.ok()).toBeTruthy()

    const refreshRequest = await refreshRequestPromise
    const refreshHeaders = await refreshRequest.allHeaders()
    expect(refreshHeaders['authorization']).toBeUndefined()
    expect(refreshHeaders['x-requested-with']).toBe(CSRF_HEADER_VALUE)

    const refreshResponse = await refreshResponsePromise
    expect(refreshResponse.status()).toBe(401)

    await expectDashboardVisible(page)
    expect(await getAuthCookieValue(page)).toBeNull()
    expect(await page.evaluate((tokenKey) => localStorage.getItem(tokenKey), STORAGE_KEY_TOKEN)).toBe(
      staleToken.token
    )

    const bearerOnlyProbe = await playwrightRequest.newContext({ baseURL: PLAYWRIGHT_BASE_URL })
    const meResponse = await bearerOnlyProbe.get('/api/me', {
      headers: {
        Authorization: `Bearer ${staleToken.token}`,
        'X-Requested-With': CSRF_HEADER_VALUE,
      },
    })
    expect(meResponse.ok()).toBeTruthy()
    await bearerOnlyProbe.dispose()

  })
})
