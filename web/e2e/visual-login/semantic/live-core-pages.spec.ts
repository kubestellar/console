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
  assertLiveRouteStateLoaded,
  assertNoForbiddenLiveUi,
  assertNoPositiveLiveCountContradictions,
  assertNoUnexpectedLiveNetworkErrors,
  assertNoVisibleTextCollisions,
  collectLiveApiFacts,
  dismissOptionalLiveOverlays,
  establishLiveCanarySession,
  gotoLiveCanaryRoute,
  type LiveApiFactScope,
  liveCanaryUrl,
  liveRateLimitDataLossSkipReason,
  recordLiveUiFailures,
  writeLiveRouteEvidence,
  writeLiveSiteReport,
} from '../helpers/liveSiteAssertions'

const invariantIds = [
  'live-core-pages-render-real-data',
  'live-canary-ui-layout-stable',
  'live-ui-no-demo-artifacts',
  'live-ui-no-text-collisions',
  'live-ui-no-unexpected-network-errors',
  'no-critical-runtime-errors',
]

const liveCorePageExpectedConsoleNoise = [
  /Failed to load resource: the server responded with a status of 401 \([^)]*\)/i,
  /Failed to load resource: the server responded with a status of 403 \(Forbidden\)/i,
  /Failed to load resource: the server responded with a status of 405 \(Method Not Allowed\)/i,
  /\[Missions\] Failed to connect to agent: Error: CONNECTION_FAILED/i,
]

type CoreRoute = {
  route: string
  label: string
  apiScope: LiveApiFactScope
  expectedFields: (groundTruth: ReturnType<typeof collectK8sGroundTruth>) => Record<string, number>
  apiFields: (apiFacts: Awaited<ReturnType<typeof collectLiveApiFacts>>) => Record<string, number | null>
}

const coreRoutes: CoreRoute[] = [
  {
    route: '/clusters',
    label: 'clusters',
    apiScope: 'clusters',
    expectedFields: groundTruth => ({
      'clusters-total': groundTruth.contexts.reachable,
      'nodes-total': groundTruth.nodes.total,
      'nodes-ready': groundTruth.nodes.ready,
      'pods-total': groundTruth.pods.total,
    }),
    apiFields: apiFacts => ({
      'clusters-total': apiFacts.clusters.total,
      'nodes-total': apiFacts.clusters.nodesTotal,
      'nodes-ready': apiFacts.clusters.nodesReady,
      'pods-total': apiFacts.clusters.podsTotal,
    }),
  },
  {
    route: '/nodes',
    label: 'nodes',
    apiScope: 'nodes',
    expectedFields: groundTruth => ({
      'nodes-total': groundTruth.nodes.total,
      'nodes-ready': groundTruth.nodes.ready,
    }),
    apiFields: apiFacts => ({
      'nodes-total': apiFacts.nodes.total,
      'nodes-ready': apiFacts.nodes.ready,
    }),
  },
  {
    route: '/pods',
    label: 'pods',
    apiScope: 'pods',
    expectedFields: groundTruth => ({
      'pods-total': groundTruth.pods.total,
      'pods-running': groundTruth.pods.running,
      'pods-pending': groundTruth.pods.pending,
      'pods-crashloop': groundTruth.pods.crashLoopBackOff,
    }),
    apiFields: apiFacts => ({
      'pods-total': apiFacts.pods.total,
      'pods-running': apiFacts.pods.running,
      'pods-pending': apiFacts.pods.pending,
      'pods-crashloop': apiFacts.pods.crashLoopBackOff,
    }),
  },
  {
    route: '/namespaces',
    label: 'namespaces',
    apiScope: 'namespaces',
    expectedFields: groundTruth => ({
      'namespaces-total': groundTruth.namespaces.total,
    }),
    apiFields: apiFacts => ({
      'namespaces-total': apiFacts.namespaces.total,
    }),
  },
  {
    route: '/deployments',
    label: 'deployments',
    apiScope: 'deployments',
    expectedFields: groundTruth => ({
      'deployments-total': groundTruth.deployments.total,
      'deployments-available': groundTruth.deployments.available,
    }),
    apiFields: apiFacts => ({
      'deployments-total': apiFacts.deployments.total,
      'deployments-available': apiFacts.deployments.available,
    }),
  },
  {
    route: '/alerts',
    label: 'alerts',
    apiScope: 'alerts',
    expectedFields: () => ({}),
    apiFields: () => ({}),
  },
]

let cachedGroundTruth: ReturnType<typeof collectK8sGroundTruth> | undefined

function collectCorePagesGroundTruth(): ReturnType<typeof collectK8sGroundTruth> {
  cachedGroundTruth ??= collectK8sGroundTruth()
  return cachedGroundTruth
}

for (const coreRoute of coreRoutes) {
  test(`live core page renders real data: ${coreRoute.label} @intensive @live-site @core-page @invariant:live-core-pages-render-real-data`, async ({ page }, testInfo) => {
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

    const groundTruth = collectCorePagesGroundTruth()

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

      const response = await gotoLiveCanaryRoute(page, baseUrl, coreRoute.route)
      if (!response?.ok()) {
        await recordLiveUiFailures(page, {
          routeFailures: [{
            route: coreRoute.route,
            reason: `route returned HTTP ${response?.status() ?? 'no response'}`,
          }],
        })
      }
      expect(response?.ok(), `live canary ${coreRoute.route} route must be reachable`).toBeTruthy()
      await dismissOptionalLiveOverlays(page)
      await assertLiveDashboardShell(page, coreRoute.route)
      await assertLiveRouteStateLoaded(page, coreRoute.route)
      const expectedFields = coreRoute.expectedFields(groundTruth)
      if (Object.keys(expectedFields).length > 0) {
        await assertGroundtruthFields(page, expectedFields, coreRoute.route)
        const apiFacts = await collectLiveApiFacts(page, coreRoute.apiScope)
        await assertLiveApiUiFields(page, apiFacts, coreRoute.route, coreRoute.apiFields(apiFacts))
        await assertNoPositiveLiveCountContradictions(page, coreRoute.route, expectedFields)
      }
      await assertNoForbiddenLiveUi(page)
      await assertLiveLayoutStable(page)
      await assertNoVisibleTextCollisions(page)
      await assertNoUnexpectedLiveNetworkErrors(page, collectors, baseUrl, [/\/api\/agent\/auto-update\/status$/i], coreRoute.route)
      await assertNoCriticalRuntimeErrors(collectors, liveCorePageExpectedConsoleNoise)

      writeLiveRouteEvidence({
        route: coreRoute.route,
        kind: 'core-page-pass',
        label: coreRoute.label,
      })
      writeLiveSiteReport({
        target: 'canary',
        route: coreRoute.route,
        checks: {
          corePage: 'ok',
          forbiddenLiveUi: 'ok',
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
        appMode: `live-core-page-${coreRoute.label}`,
        boundingBoxes: [
          { label: 'main', locator: page.locator('main') },
        ],
      })
    }
  })
}
