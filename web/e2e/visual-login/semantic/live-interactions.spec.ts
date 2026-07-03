import { test, expect, type Locator, type Page } from '@playwright/test'
import { attachEvidenceOnFailure } from '../../../harness/evidence/attachEvidence'
import { installEvidenceCollectors } from '../../../harness/evidence/collectEvidence'
import { assertNoCriticalRuntimeErrors, firstVisibleLocator } from '../helpers/visualLoginAssertions'
import {
  annotateLiveInvariant,
  assertLiveDashboardShell,
  assertLiveLayoutStable,
  assertNoUnexpectedLiveNetworkErrors,
  assertNoVisibleTextCollisions,
  dismissOptionalLiveOverlays,
  establishLiveCanarySession,
  gotoLiveCanaryRoute,
  liveCanaryUrl,
  liveRateLimitDataLossSkipReason,
  recordLiveUiFailures,
  writeLiveRouteEvidence,
  writeLiveSiteReport,
} from '../helpers/liveSiteAssertions'

const invariantIds = [
  'live-interactive-surfaces-work',
  'live-canary-ui-layout-stable',
  'live-ui-no-text-collisions',
  'live-ui-no-unexpected-network-errors',
  'no-critical-runtime-errors',
]

const liveInteractionExpectedConsoleNoise = [
  /Failed to load resource: the server responded with a status of 401 \([^)]*\)/i,
  /\[Missions\] Failed to connect to agent: Error: CONNECTION_FAILED/i,
]

async function requiredControl(page: Page, route: string, control: string, candidates: Locator[]): Promise<Locator> {
  const locator = await firstVisibleLocator(page, candidates)
  if (!locator) {
    await recordLiveUiFailures(page, {
      interactiveFailures: [{ control, route, reason: 'required interactive control was not visible' }],
    })
    writeLiveRouteEvidence({ route, kind: 'interactive-control-missing', control })
  }
  expect(locator, `live ${route} must expose ${control}`).not.toBeNull()
  return locator!
}

async function clickRequiredControl(page: Page, route: string, control: string, candidates: Locator[]) {
  const locator = await requiredControl(page, route, control, candidates)
  await locator.click()
  await page.waitForTimeout(500)
  writeLiveRouteEvidence({ route, kind: 'interactive-control-clicked', control })
  await expect(page.locator('body'), `live ${route} must remain rendered after ${control}`).not.toHaveText('')
}

test('live interactive surfaces work @intensive @live-site @interactions @invariant:live-interactive-surfaces-work', async ({ page }, testInfo) => {
  invariantIds.forEach(id => annotateLiveInvariant(testInfo, id))
  const rateLimitSkipReason = liveRateLimitDataLossSkipReason()
  if (rateLimitSkipReason) test.skip(true, rateLimitSkipReason)
  const collectors = installEvidenceCollectors(page)
  const baseUrl = liveCanaryUrl()
  const liveChecksRequired = process.env.LIVE_SITE_TESTS === 'true' || process.env.LIVE_CLUSTER_TESTS === 'true'

  if (!baseUrl) {
    testInfo.annotations.push({ type: 'config-dependent-skip', description: 'LIVE_CANARY_CONSOLE_URL, SELF_HOSTED_CONSOLE_URL, VISUAL_LOGIN_BASE_URL, or PLAYWRIGHT_BASE_URL is not configured.' })
    if (!liveChecksRequired) test.skip(true, 'live canary URL is not configured')
    expect(baseUrl, 'live canary URL is required when LIVE_SITE_TESTS or LIVE_CLUSTER_TESTS is true').toBeTruthy()
    return
  }

  try {
    await establishLiveCanarySession(page, baseUrl)
    collectors.consoleErrors.length = 0
    collectors.consoleWarnings.length = 0
    collectors.pageErrors.length = 0
    collectors.failedRequests.length = 0
    collectors.errorResponses.length = 0

    const response = await gotoLiveCanaryRoute(page, baseUrl, '/')
    expect(response?.ok(), 'live canary Dashboard route must be reachable for interaction checks').toBeTruthy()
    await dismissOptionalLiveOverlays(page)
    await assertLiveDashboardShell(page, '/')

    await test.step('global search accepts live queries', async () => {
      const search = await requiredControl(page, '/', 'global search', [
        page.getByPlaceholder(/search/i).first(),
        page.getByRole('textbox', { name: /search/i }).first(),
        page.locator('input[type="search"]').first(),
      ])
      await search.click()
      await search.fill('pods')
      await expect(search, 'global search should retain typed query').toHaveValue(/pods/i)
      writeLiveRouteEvidence({ route: '/', kind: 'interactive-search', query: 'pods' })
      await page.keyboard.press('Escape').catch(() => undefined)
    })

    await test.step('filter control opens without breaking the page', async () => {
      await clickRequiredControl(page, '/', 'filter control', [
        page.getByRole('button', { name: /filter/i }).first(),
        page.locator('button[aria-label*="filter" i]').first(),
        page.locator('button[title*="filter" i]').first(),
      ])
      await page.keyboard.press('Escape').catch(() => undefined)
    })

    await test.step('stats settings opens and closes', async () => {
      await clickRequiredControl(page, '/', 'stats settings', [
        page.getByRole('button', { name: /configure stats/i }).first(),
        page.locator('button[title*="configure" i]').first(),
      ])
      await expect(page.locator('body'), 'stats settings should expose a configuration surface').toContainText(/configure|stats/i)
      await page.keyboard.press('Escape').catch(() => undefined)
    })

    await test.step('sidebar collapse control works', async () => {
      await clickRequiredControl(page, '/', 'sidebar collapse', [
        page.getByRole('button', { name: /collapse|expand|sidebar/i }).first(),
        page.locator('button[aria-label*="sidebar" i]').first(),
        page.locator('button[title*="sidebar" i]').first(),
      ])
    })

    await test.step('user menu opens', async () => {
      await clickRequiredControl(page, '/', 'user menu', [
        page.locator('button').filter({ hasText: /console-live-canary|live-canary-ui/i }).first(),
        page.getByRole('button', { name: /console-live-canary|live-canary-ui|account|user/i }).first(),
        page.locator('button[aria-label*="user" i], button[aria-label*="account" i]').first(),
      ])
      await expect(page.locator('body'), 'user menu should expose account actions').toContainText(/profile|settings|sign out|logout|console-live-canary|live-canary-ui/i)
      await page.keyboard.press('Escape').catch(() => undefined)
    })

    await test.step('alert or issue surface opens when present', async () => {
      const alertControl = await firstVisibleLocator(page, [
        page.getByRole('button', { name: /critical|warning|alert|issue/i }).first(),
        page.getByText(/\d+\s+(critical|warnings?|issues?)/i).first(),
      ])
      if (alertControl) {
        await alertControl.click()
        await page.waitForTimeout(500)
        writeLiveRouteEvidence({ route: '/', kind: 'interactive-control-clicked', control: 'alert or issue surface' })
      }
    })

    await test.step('AI Missions panel opens when present', async () => {
      const missions = await firstVisibleLocator(page, [
        page.getByRole('button', { name: /AI Missions/i }).first(),
        page.getByText(/AI Missions/i).first(),
      ])
      if (missions) {
        await missions.click()
        await page.waitForTimeout(500)
        writeLiveRouteEvidence({ route: '/', kind: 'interactive-control-clicked', control: 'AI Missions panel' })
        await dismissOptionalLiveOverlays(page)
      }
    })

    await dismissOptionalLiveOverlays(page)
    await assertLiveLayoutStable(page)
    await assertNoVisibleTextCollisions(page)
    await assertNoUnexpectedLiveNetworkErrors(page, collectors, baseUrl, [], '/')
    await assertNoCriticalRuntimeErrors(collectors, liveInteractionExpectedConsoleNoise)

    writeLiveSiteReport({
      target: 'canary',
      route: '/',
      checks: {
        interactions: 'ok',
        layout: 'ok',
        networkErrors: 'ok',
      },
    })
  } finally {
    await attachEvidenceOnFailure({
      page,
      testInfo,
      invariantIds,
      collectors,
      appMode: 'live-interactions',
      boundingBoxes: [
        { label: 'main', locator: page.locator('main') },
      ],
    })
  }
})
