import { expect, type Page } from '@playwright/test'
import type { EvidenceCollectors } from '../../../harness/evidence/evidenceTypes'
import { markLiveRateLimitDataLoss } from './liveReporting'

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

const liveRateLimitDataLossEndpointPattern = /\/api\/(?:mcp\/)?(?:namespaces|nodes|pods|deployments|clusters)|\/api\/namespaces|\/api\/stellar\/state|\/api\/kagent\/status/i

export function networkClassification(status: number | undefined, url: string): string | null {
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

