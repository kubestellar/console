import { test, expect, type Page } from '@playwright/test'
import { collectK8sGroundTruth } from '../../../harness/groundtruth/collectK8sGroundTruth'
import { dismissOptionalLiveOverlays, establishLiveCanarySession, liveCanaryUrl, readGroundtruthFieldNumbers } from '../helpers/liveSiteAssertions'

function readPositiveIntEnv(name: string, required: boolean) {
  const rawValue = process.env[name]
  if (!rawValue) {
    if (required) {
      throw new Error(`${name} must be configured for required live cluster checks`)
    }
    return undefined
  }
  const value = Number(rawValue)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got ${rawValue}`)
  }
  return value
}

async function expectGroundTruthField(page: Page, field: string, expected: number) {
  await expect.poll(async () => {
    const values = await readGroundtruthFieldNumbers(page, field)
    const uniqueValues = [...new Set(values)]
    if (values.length === 0) return `missing-or-unparseable:${field}`
    if (uniqueValues.length > 1) return `duplicate-disagreement:${uniqueValues.join(',')}`
    return uniqueValues[0] === expected ? 'ok' : `expected:${expected}:actual:${uniqueValues[0]}`
  }, {
    message: `data-groundtruth-field="${field}" should match live Kubernetes ground truth`,
    timeout: 20_000,
  }).toBe('ok')
}

test('cluster dashboard can be checked against live Kubernetes ground truth @intensive @groundtruth @invariant:cluster-dashboard-groundtruth-match', async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: 'invariant', description: 'cluster-dashboard-groundtruth-match' })

  const liveChecksRequired = process.env.LIVE_CLUSTER_TESTS === 'true'
  const groundTruth = collectK8sGroundTruth()
  if (groundTruth.skipped) {
    testInfo.annotations.push({ type: 'config-dependent-skip', description: groundTruth.skipped })
    if (!liveChecksRequired) {
      test.skip(true, groundTruth.skipped)
    }
    expect(groundTruth.skipped, 'live ground truth must be configured when LIVE_CLUSTER_TESTS=true').toBeUndefined()
  }

  const selfHostedUrl = liveCanaryUrl()
  if (!selfHostedUrl) {
    if (!liveChecksRequired) {
      test.skip(true, 'SELF_HOSTED_CONSOLE_URL, VISUAL_LOGIN_BASE_URL, or PLAYWRIGHT_BASE_URL is required for UI ground-truth comparison.')
    }
    expect(selfHostedUrl, 'SELF_HOSTED_CONSOLE_URL is required when LIVE_CLUSTER_TESTS=true').toBeTruthy()
    return
  }

  const expectedContexts = readPositiveIntEnv('LIVE_CLUSTER_EXPECTED_CONTEXTS', liveChecksRequired)
  const expectedReadyNodes = readPositiveIntEnv('LIVE_CLUSTER_EXPECTED_READY_NODES', liveChecksRequired)
  if (expectedContexts !== undefined) {
    expect(groundTruth.contexts.reachable, `expected ${expectedContexts} reachable live cluster contexts`).toBe(expectedContexts)
  }
  if (expectedReadyNodes !== undefined) {
    expect(groundTruth.nodes.total, `live clusters must expose exactly ${expectedReadyNodes} nodes`).toBe(expectedReadyNodes)
    expect(groundTruth.nodes.ready, `all ${expectedReadyNodes} live cluster nodes must be Ready`).toBe(expectedReadyNodes)
  }

  await establishLiveCanarySession(page, selfHostedUrl)

  const response = await page.goto(new URL('/clusters?groundtruth=1', selfHostedUrl).toString(), { waitUntil: 'domcontentloaded' })
  expect(response?.ok(), 'self-hosted Console /clusters route must be reachable').toBeTruthy()
  await dismissOptionalLiveOverlays(page)

  await expect(page.locator('body')).not.toHaveText('', { timeout: 10_000 })
  await expectGroundTruthField(page, 'clusters-total', groundTruth.contexts.reachable)
  await expectGroundTruthField(page, 'nodes-ready', groundTruth.nodes.ready)
  await expectGroundTruthField(page, 'nodes-total', groundTruth.nodes.total)
  await expectGroundTruthField(page, 'pods-total', groundTruth.pods.total)
  await expectGroundTruthField(page, 'pods-running', groundTruth.pods.running)
  await expectGroundTruthField(page, 'pods-pending', groundTruth.pods.pending)
  await expectGroundTruthField(page, 'pods-crashloop', groundTruth.pods.crashLoopBackOff)
})
