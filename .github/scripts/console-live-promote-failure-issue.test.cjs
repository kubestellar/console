const test = require('node:test')
const assert = require('node:assert/strict')
const { _test } = require('./console-live-promote-failure-issue.cjs')

function classify(liveUiFailures, logText = '') {
  return _test.classifyFailure({
    failures: [],
    evidenceItems: [],
    liveUiFailures,
    logText,
  })
}

test('classifies dashboard mismatches before generic network failures', () => {
  assert.equal(classify({
    dashboardMismatches: [{
      field: 'dashboard-namespaces-total',
      expected: 16,
      actual: 0,
      route: '/',
    }],
    unexpectedNetworkResponses: ['GET /api/agent/auto-update/status 502'],
  }), 'dashboard-groundtruth-mismatch')
})

test('classifies API/UI mismatches as UI/API evidence', () => {
  assert.equal(classify({
    apiUiMismatches: [{
      route: '/deployments',
      field: 'deployments-total',
      expected: 4,
      actual: 0,
      reason: 'mismatch',
    }],
  }), 'ui-api-mismatch')
})

test('classifies route groundtruth field mismatches as UI/API evidence', () => {
  const failures = _test.liveFailuresFromRouteReports([{
    route: '/deployments',
    kind: 'groundtruth-fields',
    expected: {
      'deployments-total': 12,
      'deployments-available': 12,
    },
    actual: {
      'deployments-total': 0,
      'deployments-available': 0,
    },
    mismatches: [{
      route: '/deployments',
      field: 'deployments-total',
      expected: 12,
      actual: 0,
      reason: 'mismatch',
    }, {
      route: '/deployments',
      field: 'deployments-available',
      expected: 12,
      actual: 0,
      reason: 'mismatch',
    }],
  }])

  assert.equal(failures.dashboardMismatches.length, 0)
  assert.deepEqual(failures.apiUiMismatches.map((mismatch) => ({
    route: mismatch.route,
    field: mismatch.field,
    expected: mismatch.expected,
    actual: mismatch.actual,
    source: mismatch.source,
  })), [{
    route: '/deployments',
    field: 'deployments-total',
    expected: 12,
    actual: 0,
    source: 'kubernetes-groundtruth',
  }, {
    route: '/deployments',
    field: 'deployments-available',
    expected: 12,
    actual: 0,
    source: 'kubernetes-groundtruth',
  }])
  assert.equal(_test.classifyFailure({
    failures: [],
    evidenceItems: [],
    liveUiFailures: failures,
    logText: 'Error: live /deployments stats must match Kubernetes ground truth',
  }), 'ui-api-mismatch')
})

test('infers route stat mismatches without generic route-failure noise', () => {
  const failures = _test.inferLiveUiFailuresFromText([
    'Error: live /deployments stats must match Kubernetes ground truth',
    '@invariant:live-core-pages-render-real-data',
  ].join('\n'))

  assert.equal(failures.routeFailures.length, 0)
  assert.deepEqual(failures.apiUiMismatches, [{
    route: '/deployments',
    field: 'not parsed from log',
    expected: 'see evidence artifact',
    actual: 'see evidence artifact',
    source: 'log',
  }])
  assert.equal(_test.classifyFailure({
    failures: [],
    evidenceItems: [],
    liveUiFailures: failures,
    logText: '',
  }), 'ui-api-mismatch')
})

test('only browser failures receive the browser-matrix label', () => {
  assert.deepEqual(_test.labelsForFailureType('ui-api-mismatch'), [
    'console-live',
    'live-canary',
    'test-failure',
    'needs-fix',
  ])
  assert.deepEqual(_test.labelsForFailureType('safari-z-index'), [
    'console-live',
    'live-canary',
    'test-failure',
    'needs-fix',
    'browser-matrix',
  ])
})

test('classifies rate limits as live data loss', () => {
  assert.equal(classify({
    networkClassifications: [{
      classification: 'live-rate-limit-data-loss',
      status: 429,
      url: '/api/namespaces?cluster=live-cluster-1',
    }],
  }), 'live-rate-limit-data-loss')
})

test('classifies raw GET 429 API responses as live data loss', () => {
  assert.equal(classify({
    unexpectedNetworkResponses: [
      'GET 429 http://127.0.0.1:18080/api/mcp/clusters',
      'GET 401 http://127.0.0.1:18080/api/mcp/gpu-nodes/stream',
    ],
  }), 'live-rate-limit-data-loss')
})

test('does not let optional 429 responses mask dashboard mismatches', () => {
  assert.equal(classify({
    dashboardMismatches: [{
      field: 'dashboard-namespaces-total',
      expected: 16,
      actual: 0,
      route: '/',
    }],
    unexpectedNetworkResponses: [
      'GET 429 https://console-live.kubestellar.io/api/stellar/stream',
      'GET 429 https://console-live.kubestellar.io/api/agent/token',
    ],
  }), 'dashboard-groundtruth-mismatch')
})

test('classifies only optional 429 responses separately from core resource data loss', () => {
  assert.equal(classify({
    unexpectedNetworkResponses: [
      'GET 429 https://console-live.kubestellar.io/api/gitops/helm-releases',
      'GET 429 https://console-live.kubestellar.io/api/public/nightly-e2e/runs',
    ],
  }), 'optional-live-integration-unreachable')
})

test('does not merge websocket 429 text with later core API log lines', () => {
  assert.equal(classify({}, [
    "WebSocket connection to 'wss://console-live.kubestellar.io/ws' failed: Error during WebSocket handshake: Unexpected response code: 429",
    'Error: live /namespaces must render fully loaded live data state',
    'live-core-pages-render-real-data',
    'at helpers/liveSiteAssertions.ts:963',
    'const relatedEndpoint = "/api/mcp/nodes"',
  ].join('\n')), 'core-page-live-data-missing')
})

test('classifies structured rate limit evidence as live data loss', () => {
  assert.equal(_test.classifyFailure({
    failures: [],
    evidenceItems: [{
      network: {
        rateLimitEvents: [{
          method: 'GET',
          status: 429,
          url: 'http://127.0.0.1:18080/api/mcp/pods',
          retryAfter: '60',
        }],
      },
    }],
    liveUiFailures: {},
    logText: '',
  }), 'live-rate-limit-data-loss')
})

test('prioritizes rate-limit data loss over secondary text-collision evidence', () => {
  assert.equal(classify({
    textCollisions: [{
      first: 'Press Ctrl+K to search dashboards, cards, clusters, and more',
      second: 'This project is fully autonomous — maintained by AI agents.',
      ratio: 0.9,
    }],
    unexpectedNetworkResponses: [
      'GET 429 http://127.0.0.1:18080/api/mcp/clusters',
    ],
  }, 'Error: live UI visible text must not severely overlap'), 'live-rate-limit-data-loss')
})

test('does not let log-only rate-limit helper text mask UI overlap evidence', () => {
  assert.equal(classify({
    textCollisions: [{
      first: 'Unhealthy (',
      second: 'Backend unavailable',
      ratio: 0.59,
    }],
    networkClassifications: [],
  }, [
    'Error: live UI visible text must not severely overlap',
    'const rateLimitDataLoss = networkClassifications.filter(item => item.classification === "live-rate-limit-data-loss")',
    'if (response.status === 429) await retry("/api/mcp/nodes")',
  ].join('\n')), 'live-ui-overlap')
})

test('prioritizes dashboard mismatches over secondary text-collision evidence', () => {
  assert.equal(classify({
    textCollisions: [{
      first: 'An update is available - click here to see what is new',
      second: 'This project is fully autonomous - maintained by AI agents.',
      ratio: 0.9,
    }],
    dashboardMismatches: [{
      field: 'dashboard-namespaces-total',
      expected: 16,
      actual: null,
      route: '/',
    }],
  }, 'Error: live UI visible text must not severely overlap'), 'dashboard-groundtruth-mismatch')
})

test('classifies browser semantic field mismatches distinctly', () => {
  assert.equal(classify({
    browserMatrixFailures: [{
      classification: 'browser-semantic-field-mismatch',
      route: '/nodes',
      reason: 'route semantic fields do not match expected live data',
    }],
  }), 'browser-semantic-field-mismatch')
})

test('classifies macOS popup clipping distinctly', () => {
  assert.equal(classify({
    browserMatrixFailures: [{
      classification: 'macos-popup-clipped',
      browser: 'webkit',
      route: '/',
      control: 'user-menu',
      reason: 'popup extends outside viewport edges: right',
    }],
  }), 'macos-popup-clipped')
})

test('classifies macOS top-layer hiding distinctly', () => {
  assert.equal(classify({
    browserMatrixFailures: [{
      classification: 'macos-top-layer-hidden',
      browser: 'webkit',
      route: '/',
      control: 'alerts-popover',
      reason: 'popup did not become visible after the trigger was clicked',
    }],
  }), 'macos-top-layer-hidden')
})

test('classifies structured browser matrix canary setup failures', () => {
  assert.equal(classify({
    browserMatrixFailures: [{
      classification: 'canary-setup',
      route: '/namespaces',
      reason: 'canary route could not be reached through the private port-forward',
      error: 'page.goto: Could not connect to 127.0.0.1: Connection refused',
    }],
  }), 'canary-setup')
})

test('keeps canary setup as fallback when no parsed product evidence exists', () => {
  assert.equal(classify({}, 'canary browser matrix port-forward did not become healthy'), 'canary-setup')
})

test('prioritizes canary setup over product-looking log noise', () => {
  assert.equal(classify({}, 'Candidate image is not available in GHCR: ghcr.io/kubestellar/console:missing\nGET 429 /api/mcp/pods'), 'canary-setup')
})

test('parses resolved candidate image before falling back to run SHA', () => {
  const imageState = _test.parseImageState('Resolved candidate image ghcr.io/kubestellar/console:main', {
    head_sha: 'abc123',
  })
  assert.equal(imageState.candidate, 'ghcr.io/kubestellar/console:main')
})

test('does not let unexecuted canary setup command text override parsed network evidence', () => {
  assert.equal(classify({
    unexpectedNetworkResponses: [
      'GET 401 http://127.0.0.1:18080/api/mcp/gpu-nodes/stream',
    ],
  }, [
    'echo "::error::Canary browser matrix port-forward did not become healthy"',
    'echo "::error::Candidate image is not available in GHCR: $candidate_image"',
  ].join('\n')), 'live-network-error')
})

test('selects an open matching issue before closed historical matches', () => {
  const marker = '<!-- console-live-promote-signature:abc123 -->'
  const title = '[console-live][canary-blocked][live-rate-limit-data-loss] route rate limited'
  const selected = _test.selectExistingIssue([
    { number: 10, state: 'closed', title, body: marker },
    { number: 11, state: 'open', title, body: 'same title, current issue' },
  ], marker, title)

  assert.equal(selected.existing.number, 11)
  assert.deepEqual(selected.openMatchingIssues.map((issue) => issue.number), [11])
})

test('selects a closed matching issue when no open issue exists', () => {
  const marker = '<!-- console-live-promote-signature:def456 -->'
  const title = '[console-live][browser-matrix][macos-popup-clipped] popup clipped'
  const selected = _test.selectExistingIssue([
    { number: 62, state: 'closed', title, body: marker },
  ], marker, title)

  assert.equal(selected.existing.number, 62)
  assert.equal(selected.existing.state, 'closed')
  assert.deepEqual(selected.openMatchingIssues, [])
})
