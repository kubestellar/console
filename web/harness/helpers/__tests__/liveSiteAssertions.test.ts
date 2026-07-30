import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@playwright/test', () => ({
  expect: Object.assign(vi.fn(), { poll: vi.fn() }),
}))

vi.mock('../../../e2e/visual-login/helpers/visualLoginAssertions', () => ({
  assertDashboardContentVisible: vi.fn(),
  assertNoSevereOverlap: vi.fn(),
  assertNotBlank: vi.fn(),
  assertNotStuckLoading: vi.fn(),
  assertUrlIsNotAuth: vi.fn(),
  firstVisibleLocator: vi.fn(),
}))

vi.mock('../../../e2e/helpers/setup', () => ({
  setupDemoMode: vi.fn(),
}))

import { normalizeBaseUrl, liveCanaryAuthMode, liveProductionUrl, liveCanaryUrl } from '../../../e2e/visual-login/helpers/liveSiteAssertions'

describe('normalizeBaseUrl', () => {
  it('returns undefined for empty string', () => {
    expect(normalizeBaseUrl('')).toBeUndefined()
  })

  it('returns undefined for undefined', () => {
    expect(normalizeBaseUrl(undefined)).toBeUndefined()
  })

  it('strips trailing slashes', () => {
    expect(normalizeBaseUrl('https://example.com/')).toBe('https://example.com')
  })

  it('strips multiple trailing slashes', () => {
    expect(normalizeBaseUrl('https://example.com///')).toBe('https://example.com')
  })

  it('passes through URL without trailing slash', () => {
    expect(normalizeBaseUrl('https://example.com')).toBe('https://example.com')
  })

  it('preserves path components', () => {
    expect(normalizeBaseUrl('https://example.com/app/')).toBe('https://example.com/app')
  })
})

describe('liveCanaryAuthMode', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.LIVE_SITE_AUTH_MODE
    delete process.env.LIVE_CANARY_AUTH_MODE
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('defaults to dev when no env set', () => {
    expect(liveCanaryAuthMode()).toBe('dev')
  })

  it('returns preauthenticated for preauth value', () => {
    process.env.LIVE_SITE_AUTH_MODE = 'preauth'
    expect(liveCanaryAuthMode()).toBe('preauthenticated')
  })

  it('returns preauthenticated for preauthenticated value', () => {
    process.env.LIVE_SITE_AUTH_MODE = 'preauthenticated'
    expect(liveCanaryAuthMode()).toBe('preauthenticated')
  })

  it('returns preauthenticated for storage-state value', () => {
    process.env.LIVE_CANARY_AUTH_MODE = 'storage-state'
    expect(liveCanaryAuthMode()).toBe('preauthenticated')
  })

  it('returns signed-cookie for signed-cookie value', () => {
    process.env.LIVE_SITE_AUTH_MODE = 'signed-cookie'
    expect(liveCanaryAuthMode()).toBe('signed-cookie')
  })

  it('returns signed-cookie for cookie value', () => {
    process.env.LIVE_SITE_AUTH_MODE = 'cookie'
    expect(liveCanaryAuthMode()).toBe('signed-cookie')
  })

  it('returns signed-cookie for production-cookie value', () => {
    process.env.LIVE_CANARY_AUTH_MODE = 'production-cookie'
    expect(liveCanaryAuthMode()).toBe('signed-cookie')
  })

  it('returns none for none value', () => {
    process.env.LIVE_SITE_AUTH_MODE = 'none'
    expect(liveCanaryAuthMode()).toBe('none')
  })

  it('returns none for unauthenticated value', () => {
    process.env.LIVE_SITE_AUTH_MODE = 'unauthenticated'
    expect(liveCanaryAuthMode()).toBe('none')
  })

  it('throws for production URL without explicit auth mode', () => {
    expect(() => liveCanaryAuthMode('https://console-live.kubestellar.io')).toThrow(
      /Authenticated live UI tests need LIVE_SITE_AUTH_MODE/
    )
  })

  it('does not throw for non-production URL in dev mode', () => {
    expect(liveCanaryAuthMode('https://staging.example.com')).toBe('dev')
  })

  it('LIVE_CANARY_AUTH_MODE takes effect when LIVE_SITE_AUTH_MODE not set', () => {
    process.env.LIVE_CANARY_AUTH_MODE = 'none'
    expect(liveCanaryAuthMode()).toBe('none')
  })

  it('is case insensitive', () => {
    process.env.LIVE_SITE_AUTH_MODE = 'SIGNED-COOKIE'
    expect(liveCanaryAuthMode()).toBe('signed-cookie')
  })
})

describe('liveProductionUrl', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.LIVE_PRODUCTION_CONSOLE_URL
    delete process.env.LIVE_SITE_URL
    delete process.env.CONSOLE_LIVE_URL
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns undefined when no env vars set', () => {
    expect(liveProductionUrl()).toBeUndefined()
  })

  it('reads LIVE_PRODUCTION_CONSOLE_URL first', () => {
    process.env.LIVE_PRODUCTION_CONSOLE_URL = 'https://prod.example.com/'
    process.env.LIVE_SITE_URL = 'https://other.example.com'
    expect(liveProductionUrl()).toBe('https://prod.example.com')
  })

  it('falls back to LIVE_SITE_URL', () => {
    process.env.LIVE_SITE_URL = 'https://site.example.com/'
    expect(liveProductionUrl()).toBe('https://site.example.com')
  })

  it('falls back to CONSOLE_LIVE_URL', () => {
    process.env.CONSOLE_LIVE_URL = 'https://console.example.com/'
    expect(liveProductionUrl()).toBe('https://console.example.com')
  })
})

describe('liveCanaryUrl', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.LIVE_CANARY_CONSOLE_URL
    delete process.env.SELF_HOSTED_CONSOLE_URL
    delete process.env.VISUAL_LOGIN_BASE_URL
    delete process.env.PLAYWRIGHT_BASE_URL
    delete process.env.LIVE_SITE_AUTH_MODE
    delete process.env.LIVE_CANARY_AUTH_MODE
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns undefined when no env vars set', () => {
    expect(liveCanaryUrl()).toBeUndefined()
  })

  it('reads LIVE_CANARY_CONSOLE_URL first', () => {
    process.env.LIVE_CANARY_CONSOLE_URL = 'https://canary.example.com/'
    process.env.SELF_HOSTED_CONSOLE_URL = 'https://self.example.com'
    expect(liveCanaryUrl()).toBe('https://canary.example.com')
  })

  it('returns undefined for self-hosted production URL without auth mode', () => {
    process.env.SELF_HOSTED_CONSOLE_URL = 'https://console-live.kubestellar.io/'
    expect(liveCanaryUrl()).toBeUndefined()
  })

  it('returns self-hosted production URL when auth mode is set', () => {
    process.env.SELF_HOSTED_CONSOLE_URL = 'https://console-live.kubestellar.io/'
    process.env.LIVE_SITE_AUTH_MODE = 'signed-cookie'
    expect(liveCanaryUrl()).toBe('https://console-live.kubestellar.io')
  })

  it('uses SELF_HOSTED_CONSOLE_URL for non-production domains', () => {
    process.env.SELF_HOSTED_CONSOLE_URL = 'https://staging.example.com/'
    expect(liveCanaryUrl()).toBe('https://staging.example.com')
  })

  it('falls back to VISUAL_LOGIN_BASE_URL', () => {
    process.env.VISUAL_LOGIN_BASE_URL = 'https://visual.example.com/'
    expect(liveCanaryUrl()).toBe('https://visual.example.com')
  })

  it('falls back to PLAYWRIGHT_BASE_URL', () => {
    process.env.PLAYWRIGHT_BASE_URL = 'https://playwright.example.com/'
    expect(liveCanaryUrl()).toBe('https://playwright.example.com')
  })
})
