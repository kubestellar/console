import { test, expect } from '@playwright/test'
import { attachEvidenceOnFailure } from '../../../harness/evidence/attachEvidence'
import { installEvidenceCollectors } from '../../../harness/evidence/collectEvidence'
import { collectK8sGroundTruth } from '../../../harness/groundtruth/collectK8sGroundTruth'
import { assertNoCriticalRuntimeErrors } from '../helpers/visualLoginAssertions'
import {
  annotateLiveInvariant,
  assertGroundtruthFields,
  assertLiveApiUiFields,
  assertLiveDashboardShell,
  assertLiveLayoutStable,
  assertNoPositiveLiveCountContradictions,
  assertNoUnexpectedLiveNetworkErrors,
  assertNoVisibleTextCollisions,
  collectLiveApiFacts,
  dismissOptionalLiveOverlays,
  establishLiveCanarySession,
  gotoLiveCanaryRoute,
  liveCanaryUrl,
  liveRateLimitDataLossSkipReason,
  writeLiveSiteReport,
} from '../helpers/liveSiteAssertions'

const invariantIds = [
  'live-dashboard-groundtruth-match',
  'live-canary-ui-layout-stable',
  'live-ui-no-text-collisions',
  'live-ui-no-unexpected-network-errors',
  'no-critical-runtime-errors',
]

const liveDashboardExpectedConsoleNoise = [
  /Failed to load resource: the server responded with a status of 401 \([^)]*\)/i,
  /\[Missions\] Failed to connect to agent: Error: CONNECTION_FAILED/i,
]

test('live dashboard stats match Kubernetes groundtruth @intensive @live-site @groundtruth @invariant:live-dashboard-groundtruth-match', async ({ page }, testInfo) => {
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

  const groundTruth = collectK8sGroundTruth()

  try {
    if (groundTruth.skipped) {
      testInfo.annotations.push({ type: 'config-dependent-skip', description: groundTruth.skipped })
      if (!liveChecksRequired) test.skip(true, groundTruth.skipped)
      expect(groundTruth.skipped, 'live ground truth must be configured when live checks are required').toBeUndefined()
    }

    await establishLiveCanarySession(page, baseUrl)
    collectors.consoleErrors.length = 0
    collectors.consoleWarnings.length = 0
    collectors.pageErrors.length = 0
    collectors.failedRequests.length = 0
    collectors.errorResponses.length = 0

    const response = await gotoLiveCanaryRoute(page, baseUrl, '/')
    expect(response?.ok(), 'live canary Dashboard route must be reachable').toBeTruthy()
    await dismissOptionalLiveOverlays(page)
    await assertLiveDashboardShell(page, '/')
    await assertGroundtruthFields(page, {
      'dashboard-clusters-total': groundTruth.contexts.reachable,
      'dashboard-healthy-clusters': groundTruth.contexts.reachable,
      'dashboard-error-clusters': 0,
      'dashboard-nodes-total': groundTruth.nodes.total,
      'dashboard-pods-total': groundTruth.pods.total,
      'dashboard-namespaces-total': groundTruth.namespaces.total,
    }, '/')
    const apiFacts = await collectLiveApiFacts(page, 'dashboard')
    await assertLiveApiUiFields(page, apiFacts, '/', {
      'dashboard-clusters-total': apiFacts.clusters.total,
      'dashboard-healthy-clusters': apiFacts.clusters.healthy,
      'dashboard-nodes-total': apiFacts.clusters.nodesTotal,
      'dashboard-pods-total': apiFacts.clusters.podsTotal,
      'dashboard-namespaces-total': apiFacts.namespaces.total,
    })
    await assertNoPositiveLiveCountContradictions(page, '/', {
      clusters: groundTruth.contexts.reachable,
      namespaces: groundTruth.namespaces.total,
      deployments: groundTruth.deployments.total,
    })
    await assertLiveLayoutStable(page)
    await assertNoVisibleTextCollisions(page)
    await assertNoUnexpectedLiveNetworkErrors(page, collectors, baseUrl, [/\/api\/agent\/auto-update\/status$/i], '/')
    await assertNoCriticalRuntimeErrors(collectors, liveDashboardExpectedConsoleNoise)

    writeLiveSiteReport({
      target: 'canary',
      url: baseUrl,
      checks: {
        dashboardGroundtruth: 'ok',
        layout: 'ok',
        networkErrors: 'ok',
      },
      expected: {
        contexts: groundTruth.contexts.reachable,
        healthyClusters: groundTruth.contexts.reachable,
        errorClusters: 0,
        nodes: groundTruth.nodes.total,
        pods: groundTruth.pods.total,
        namespaces: groundTruth.namespaces.total,
      },
    })
  } finally {
    await attachEvidenceOnFailure({
      page,
      testInfo,
      invariantIds,
      collectors,
      appMode: 'live-dashboard-groundtruth',
      boundingBoxes: [
        { label: 'main', locator: page.locator('main') },
        { label: 'dashboard-page', locator: page.locator('[data-testid="dashboard-page"]') },
      ],
    })
  }
})
