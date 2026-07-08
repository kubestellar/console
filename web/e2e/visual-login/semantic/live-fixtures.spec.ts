import { test, expect } from '@playwright/test'
import { attachEvidenceOnFailure } from '../../../harness/evidence/attachEvidence'
import { installEvidenceCollectors } from '../../../harness/evidence/collectEvidence'
import {
  applyLiveFixtures,
  cleanupLiveFixtures,
  collectLiveFixtureState,
} from '../../../harness/groundtruth/liveFixtureManager'
import { assertNoCriticalRuntimeErrors } from '../helpers/visualLoginAssertions'
import {
  annotateLiveInvariant,
  assertFixtureNamesVisible,
  assertLiveDashboardShell,
  assertLiveLayoutStable,
  dismissOptionalLiveOverlays,
  establishLiveCanarySession,
  gotoLiveCanaryRoute,
  liveCanaryUrl,
  recordLiveUiFailures,
  writeLiveSiteReport,
} from '../helpers/liveSiteAssertions'

const invariantIds = [
  'live-fixture-ui-match',
  'live-canary-ui-layout-stable',
  'no-critical-runtime-errors',
]

test('live canary UI surfaces injected Kubernetes fixture states @intensive @live-site @fixture @invariant:live-fixture-ui-match', async ({ page }, testInfo) => {
  invariantIds.forEach(id => annotateLiveInvariant(testInfo, id))
  const collectors = installEvidenceCollectors(page)
  const baseUrl = liveCanaryUrl()

  if (process.env.LIVE_CLUSTER_FIXTURES !== 'true') {
    testInfo.annotations.push({ type: 'config-dependent-skip', description: 'LIVE_CLUSTER_FIXTURES is not true.' })
    test.skip(true, 'live fixture injection is not enabled')
  }

  if (!baseUrl) {
    testInfo.annotations.push({ type: 'config-dependent-skip', description: 'LIVE_CANARY_CONSOLE_URL, SELF_HOSTED_CONSOLE_URL, VISUAL_LOGIN_BASE_URL, or PLAYWRIGHT_BASE_URL is not configured.' })
    expect(baseUrl, 'live canary URL is required for fixture UI checks').toBeTruthy()
    return
  }

  let applied = false
  try {
    const fixture = applyLiveFixtures()
    applied = fixture.enabled
    expect(fixture.enabled, 'live fixture manager must apply controlled resources').toBe(true)

    await expect
      .poll(() => collectLiveFixtureState().observed, {
        message: 'live fixtures should reach observable Kubernetes states',
        timeout: 120_000,
      })
      .toEqual(expect.objectContaining({
        deploymentAvailable: true,
        pods: expect.arrayContaining([
          expect.objectContaining({ name: fixture.resources.imagePullPod, reason: expect.stringMatching(/ImagePullBackOff|ErrImagePull/) }),
          expect.objectContaining({ name: fixture.resources.pendingPod, phase: 'Pending' }),
          expect.objectContaining({ name: fixture.resources.crashLoopPod, reason: expect.stringMatching(/CrashLoopBackOff|Error/) }),
        ]),
      }))
    const observed = collectLiveFixtureState().observed

    await establishLiveCanarySession(page, baseUrl)

    await gotoLiveCanaryRoute(page, baseUrl, '/pods')
    await dismissOptionalLiveOverlays(page)
    await assertLiveDashboardShell(page)
    await assertFixtureNamesVisible(page, [fixture.resources.imagePullPod, fixture.resources.pendingPod, fixture.resources.crashLoopPod])
    await assertLiveLayoutStable(page)

    await gotoLiveCanaryRoute(page, baseUrl, '/deployments')
    await dismissOptionalLiveOverlays(page)
    await assertLiveDashboardShell(page)
    await assertFixtureNamesVisible(page, [fixture.resources.healthyDeployment])
    await assertNoCriticalRuntimeErrors(collectors)

    await gotoLiveCanaryRoute(page, baseUrl, '/workloads')
    await dismissOptionalLiveOverlays(page)
    await assertLiveDashboardShell(page)
    await assertFixtureNamesVisible(page, [fixture.resources.healthyDeployment])
    await assertLiveLayoutStable(page)

    await gotoLiveCanaryRoute(page, baseUrl, '/namespaces')
    await dismissOptionalLiveOverlays(page)
    await assertLiveDashboardShell(page)
    await assertFixtureNamesVisible(page, [fixture.namespace])
    await assertLiveLayoutStable(page)

    await gotoLiveCanaryRoute(page, baseUrl, '/alerts')
    await dismissOptionalLiveOverlays(page)
    await assertLiveDashboardShell(page)
    const alertText = await page.locator('body').innerText().catch(() => '')
    const alertHasFixtureState = [
      fixture.resources.imagePullPod,
      fixture.resources.crashLoopPod,
      'ImagePullBackOff',
      'CrashLoopBackOff',
    ].some(text => alertText.includes(text))
    if (!alertHasFixtureState) {
      await recordLiveUiFailures(page, {
        fixtureMismatches: [{
          resource: `${fixture.resources.imagePullPod},${fixture.resources.crashLoopPod}`,
          expected: 'fixture image-pull or crashloop state visible on /alerts',
          actual: alertText.slice(0, 500),
          route: '/alerts',
        }],
      })
    }
    expect(alertHasFixtureState, 'alerts should surface fixture image-pull or crashloop state').toBe(true)

    writeLiveSiteReport({
      target: 'canary',
      checks: {
        fixtureInjection: 'ok',
        fixtureUi: 'ok',
      },
      namespace: fixture.namespace,
      resources: fixture.resources,
      observed,
    })
  } finally {
    if (applied) cleanupLiveFixtures()
    await attachEvidenceOnFailure({
      page,
      testInfo,
      invariantIds,
      collectors,
      appMode: 'live-canary-fixtures',
      boundingBoxes: [
        { label: 'main', locator: page.locator('main') },
        { label: 'dashboard-page', locator: page.locator('[data-testid="dashboard-page"]') },
      ],
    })
  }
})
