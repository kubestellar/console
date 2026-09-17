import { expect, type Page } from '@playwright/test'
import { markLiveRateLimitDataLoss, recordLiveUiFailures, writeLiveRouteEvidence, type LiveNetworkClassification } from './liveReporting'
import { networkClassification, type LiveApiFacts } from './liveApiFacts'

type GroundtruthFieldState = {
  field: string
  markerCount: number
  rawValues: string[]
  values: number[]
  reason: 'missing' | 'unparseable' | 'duplicate-disagreement' | 'ok'
  value: number | null
}

function liveRouteMarkerMissing(bodyText: string, marker: string | RegExp): boolean {
  return typeof marker === 'string' ? !bodyText.includes(marker) : !marker.test(bodyText)
}

function parseVisibleNumber(value: string | null): number | null {
  if (!value) return null
  const match = value.replace(/,/g, '').match(/-?\d+/)
  return match ? Number(match[0]) : null
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
