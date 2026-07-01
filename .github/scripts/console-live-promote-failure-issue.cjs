const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const LABELS = {
  'console-live': { color: '5319e7', description: 'Issues related to console-live.kubestellar.io' },
  'live-canary': { color: '0e8a16', description: 'Console live canary validation' },
  'browser-matrix': { color: '1d76db', description: 'Cross-browser live visual canary validation' },
  'test-failure': { color: 'f9d0c4', description: 'Automated test failure' },
  'needs-fix': { color: 'd93f0b', description: 'Needs an implementation fix' },
}

const LIVE_ARTIFACT_NAMES = new Set([
  'console-live-promote-evidence',
  'console-live-macos-popup-evidence',
])
const LIVE_CANARY_WORKFLOWS = new Set([
  'Console Live Promote',
  'Console Live macOS Canary',
])
const IMAGE_REPOSITORY = process.env.CONSOLE_LIVE_IMAGE_REPOSITORY || 'ghcr.io/kubestellar/console'

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(fullPath)
    return [fullPath]
  })
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function truncate(value, limit = 2400) {
  const text = String(value || '')
  return text.length > limit ? `${text.slice(0, limit)}\n...truncated...` : text
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .slice(0, 300)
}

function stripAnsi(value) {
  return String(value || '').replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
}

function sanitizeText(value) {
  return stripAnsi(value)
    .replace(/(client[-_ ]?secret|jwt[-_ ]?secret|kubeconfig|token|password)(\s*[:=]\s*)[^\s"'`]+/gi, '$1$2[REDACTED]')
    .replace(/github_pat_[A-Za-z0-9_]+/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/ghp_[A-Za-z0-9_]+/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[REDACTED_JWT]')
    .replace(/-----BEGIN[\s\S]+?-----END [^-]+-----/g, '[REDACTED_PEM]')
}

function isSensitiveLogLine(line) {
  return /\b[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|COOKIE|KUBECONFIG|CLIENT_ID|CLIENT_SECRET|JWT)[A-Z0-9_]*\b/i.test(line)
}

function dedupe(items) {
  return [...new Set((items || []).filter(Boolean))]
}

const CORE_RESOURCE_ENDPOINT_PATTERN = /\/api\/(?:mcp\/)?(?:clusters|nodes|pods|deployments|namespaces)(?:[/?]|$)|\/api\/namespaces(?:[/?]|$)/i
const OPTIONAL_LIVE_ENDPOINT_PATTERN = /\/api\/(?:agent\/token|agent\/auto-update\/|gitops\/|public\/nightly-e2e\/|stellar\/stream|stellar\/(?:notifications|actions|tasks|activity|watches|solves)|github\/repos\/|rewards\/|medium\/blog|youtube\/playlist|active-users|token-usage\/|feedback\/|kagenti-provider\/status)|\/api\/mcp\/(?:pod-issues|gpu-nodes)\/stream(?:[/?]|$)/i

function endpointPath(value) {
  const text = String(value || '')
  try {
    return new URL(text, 'https://console-live.kubestellar.io').pathname
  } catch {
    const match = text.match(/(\/api\/[^\s"'`),]+)/i)
    return match ? match[1].replace(/[.,;:]+$/, '') : text
  }
}

function isCoreResourceEndpoint(value) {
  return CORE_RESOURCE_ENDPOINT_PATTERN.test(endpointPath(value))
}

function isOptionalLiveEndpoint(value) {
  return OPTIONAL_LIVE_ENDPOINT_PATTERN.test(endpointPath(value))
}

function parseRateLimitLine(value) {
  const text = sanitizeText(value)
  const networkMatch = text.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+429\s+([^\s]+)/i)
  if (networkMatch) {
    return {
      method: networkMatch[1].toUpperCase(),
      status: 429,
      url: networkMatch[2].replace(/[.,;:]+$/, ''),
      source: 'network-line',
    }
  }
  const genericMatch = text.match(/\b429\b[^\r\n]{0,180}?(https?:\/\/[^\s]+|\/api\/[^\s]+)/i)
  if (genericMatch) {
    return {
      method: undefined,
      status: 429,
      url: genericMatch[1].replace(/[.,;:]+$/, ''),
      source: 'text',
    }
  }
  return null
}

function collectRateLimitEvidence({ evidenceItems = [], liveUiFailures = {}, logText = '' }) {
  const events = []
  const pushEvent = (event, source) => {
    if (!event) return
    const status = Number(event.status)
    if (status !== 429 && !/live-rate-limit-data-loss|too many requests|rate limited/i.test(String(event.classification || event.error || ''))) return
    const url = event.url || event.endpoint || event.href || ''
    if (!url && status !== 429) return
    events.push({
      method: event.method,
      status: status || 429,
      url,
      retryAfter: event.retryAfter,
      classification: event.classification,
      source,
      core: isCoreResourceEndpoint(url),
      optional: isOptionalLiveEndpoint(url),
    })
  }

  for (const item of evidenceItems) {
    const network = item.network || {}
    for (const event of network.rateLimitEvents || []) pushEvent(event, 'evidence.rateLimitEvents')
    for (const response of network.errorResponses || []) pushEvent(response, 'evidence.errorResponses')
  }
  for (const event of liveUiFailures.networkClassifications || []) pushEvent(event, 'liveUi.networkClassifications')
  for (const response of liveUiFailures.unexpectedNetworkResponses || []) pushEvent(parseRateLimitLine(response), 'liveUi.unexpectedNetworkResponses')
  for (const line of sanitizeText(logText).split(/\r?\n/)) {
    if (!/\b429\b/i.test(line)) continue
    pushEvent(parseRateLimitLine(line), 'log')
  }

  return dedupe(events.map((event) => JSON.stringify(event))).map((event) => JSON.parse(event))
}

function testStatusFailed(status) {
  return status && !['passed', 'skipped', 'expected'].includes(status)
}

function collectPlaywrightFailures(report, sourceFile) {
  const failures = []

  function collectFromSuite(suite, inheritedFile = '') {
    const suiteFile = suite.file || inheritedFile
    for (const spec of suite.specs || []) {
      const title = [spec.title, ...(spec.tags || [])].filter(Boolean).join(' ')
      for (const testCase of spec.tests || []) {
        const outcome = testCase.outcome || ''
        for (const result of testCase.results || []) {
          const status = result.status || outcome
          const errors = result.errors || (result.error ? [result.error] : [])
          const failed = testStatusFailed(status) || outcome === 'unexpected' || errors.length > 0
          if (!failed) continue

          const message = errors
            .map((error) => [error.message, error.stack].filter(Boolean).join('\n'))
            .filter(Boolean)
            .join('\n\n')
          const attachments = (result.attachments || [])
            .map((attachment) => attachment.path || attachment.name)
            .filter(Boolean)

          failures.push({
            sourceFile,
            specPath: spec.file || suiteFile || sourceFile,
            title,
            project: testCase.projectName || '',
            status,
            retry: result.retry ?? 0,
            error: sanitizeText(truncate(message || `${title} failed without a parsed error message.`, 3000)),
            attachments,
          })
        }
      }
    }

    for (const child of suite.suites || []) {
      collectFromSuite(child, suiteFile)
    }
  }

  for (const suite of report.suites || []) {
    collectFromSuite(suite)
  }

  return failures
}

function mergeLiveUiFailures(evidenceItems) {
  return mergeLiveUiFailureObjects(...evidenceItems.map((item) => item.liveUiFailures || {}))
}

function mergeLiveUiFailureObjects(...failureSets) {
  const merged = {
    forbiddenMatches: [],
    warningBadges: [],
    textCollisions: [],
    unexpectedNetworkResponses: [],
    unexpectedRequestFailures: [],
    dashboardMismatches: [],
    routeFailures: [],
    apiUiMismatches: [],
    interactiveFailures: [],
    fixtureMismatches: [],
    browserMatrixFailures: [],
    networkClassifications: [],
  }

  for (const failures of failureSets) {
    for (const key of Object.keys(merged)) {
      if (Array.isArray(failures[key])) merged[key].push(...failures[key])
    }
  }

  return Object.fromEntries(
    Object.entries(merged).map(([key, value]) => [
      key,
      dedupe(value.map((entry) => JSON.stringify(entry))).map((entry) => JSON.parse(entry)),
    ])
  )
}

function inferLiveUiFailuresFromText(textValue) {
  const text = sanitizeText(textValue)
  const failures = {
    forbiddenMatches: [],
    warningBadges: [],
    textCollisions: [],
    unexpectedNetworkResponses: [],
    unexpectedRequestFailures: [],
    dashboardMismatches: [],
    routeFailures: [],
    apiUiMismatches: [],
    interactiveFailures: [],
    fixtureMismatches: [],
    browserMatrixFailures: [],
  }

  if (/visible text must not severely overlap/i.test(text)) {
    const collisionPattern = /"first":\s*"([^"]+)"[\s\S]{0,400}?"ratio":\s*([0-9.]+)[\s\S]{0,400}?"second":\s*"([^"]+)"/gi
    for (const match of text.matchAll(collisionPattern)) {
      failures.textCollisions.push({
        first: match[1],
        second: match[3],
        ratio: Number(match[2]),
      })
    }
    if (!failures.textCollisions.length) {
      failures.textCollisions.push({
        first: 'not parsed from log',
        second: 'not parsed from log',
        ratio: 1,
      })
    }
  }

  const routeStatsMismatch = text.match(/live\s+(\/[^\s]*)\s+stats must match kubernetes ground truth/i)
  if (routeStatsMismatch && routeStatsMismatch[1] !== '/') {
    failures.apiUiMismatches.push({
      route: routeStatsMismatch[1],
      field: 'not parsed from log',
      expected: 'see evidence artifact',
      actual: 'see evidence artifact',
      source: 'log',
    })
  } else if (/live \/ stats must match kubernetes ground truth|live dashboard stats must match|live-dashboard-groundtruth-match/i.test(text)) {
    failures.dashboardMismatches.push({
      field: 'not parsed from log',
      expected: 'see evidence artifact',
      actual: 'see evidence artifact',
      route: '/',
    })
  }

  if (!routeStatsMismatch && /live-core-pages-render-real-data|must render expected live-data markers/i.test(text)) {
    failures.routeFailures.push({
      route: 'not parsed from log',
      reason: 'core page did not render expected live-data markers',
    })
  }

  if (/live-interactive-surfaces-work|required interactive control/i.test(text)) {
    failures.interactiveFailures.push({
      control: 'not parsed from log',
      reason: 'interactive control was missing or broken',
      route: '/',
    })
  }

  if (/live-fixture-ui-match|fixture.*should be visible|alerts should surface fixture/i.test(text)) {
    failures.fixtureMismatches.push({
      resource: 'not parsed from log',
      expected: 'fixture state visible in UI',
      actual: 'see evidence artifact',
    })
  }

  const forbidden = [
    { label: 'demo mode control', regex: /\bDemo Mode\b/gi },
    { label: 'connection log drawer', regex: /\bConnection Log\b/gi },
    { label: 'local agent refresh warning', regex: /Refreshing local agent[^\r\n]*/gi },
    { label: 'endpoint error summary', regex: /endpoint errors?[^\r\n]*/gi },
    { label: 'AI prediction load failure', regex: /\/predictions\/ai\s*-\s*Load failed/gi },
    { label: 'widget install prompt', regex: /\bInstall widget\b/gi },
  ]
  for (const pattern of forbidden) {
    for (const match of text.matchAll(pattern.regex)) {
      failures.forbiddenMatches.push({ label: pattern.label, text: match[0].slice(0, 160) })
    }
  }

  for (const match of text.matchAll(/\b(\d+)\s+warnings?\b/gi)) {
    failures.warningBadges.push({ text: match[0], count: Number(match[1]) })
  }

  for (const match of text.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+([45]\d\d)\s+(https?:\/\/[^\s]+)/gi)) {
    failures.unexpectedNetworkResponses.push(`${match[1]} ${match[2]} ${match[3]}`)
  }

  return mergeLiveUiFailureObjects(failures)
}

function liveFailuresFromRouteReports(routeReports) {
  const failures = {
    dashboardMismatches: [],
    routeFailures: [],
    apiUiMismatches: [],
    interactiveFailures: [],
    fixtureMismatches: [],
    networkClassifications: [],
  }

  for (const report of routeReports || []) {
    const reportMismatches = Array.isArray(report.mismatches)
      ? report.mismatches.map((mismatch) => ({
        field: mismatch.field || 'unknown',
        expected: mismatch.expected ?? 'unknown',
        actual: mismatch.actual ?? null,
        route: mismatch.route || report.route || 'unknown',
        reason: mismatch.reason || 'mismatch',
      }))
      : []
    if (Array.isArray(report.mismatches)) {
      const route = String(report.route || '')
      const isDashboardMismatch = route === '/' || reportMismatches.some((mismatch) => /^dashboard-/.test(String(mismatch.field)))
      if (isDashboardMismatch) {
        failures.dashboardMismatches.push(...reportMismatches)
      } else if (report.kind === 'groundtruth-fields') {
        failures.apiUiMismatches.push(...reportMismatches.map((mismatch) => ({
          ...mismatch,
          source: 'kubernetes-groundtruth',
        })))
      } else if (report.kind !== 'api-ui-fields') {
        failures.routeFailures.push(...reportMismatches.map((mismatch) => ({
          route: mismatch.route,
          reason: `${mismatch.field} expected ${mismatch.expected} but rendered ${mismatch.actual}`,
          expected: mismatch.expected,
          actual: mismatch.actual,
        })))
      }
    }
    if (report.kind === 'route-content' && report.matched === false) {
      failures.routeFailures.push({
        route: report.route || 'unknown',
        reason: `missing expected markers: ${(report.missing || []).join(', ') || 'not parsed'}`,
        expected: Array.isArray(report.expected) ? report.expected.join(', ') : undefined,
        actual: report.bodyPreview || null,
      })
    }
    if (report.kind === 'api-ui-fields') {
      if (Array.isArray(report.mismatches)) {
        failures.apiUiMismatches.push(...report.mismatches.map((mismatch) => ({
          route: mismatch.route || report.route || 'unknown',
          field: mismatch.field || 'unknown',
          expected: mismatch.expected ?? 'unknown',
          actual: mismatch.actual ?? null,
        })))
      }
      if (Array.isArray(report.networkClassifications)) {
        failures.networkClassifications.push(...report.networkClassifications)
      }
    }
    if (report.kind === 'positive-count-contradiction' && Array.isArray(report.contradictions)) {
      failures.apiUiMismatches.push(...report.contradictions.map((mismatch) => ({
        route: mismatch.route || report.route || 'unknown',
        field: mismatch.field || 'unknown',
        expected: mismatch.expected ?? 'positive live count',
        actual: mismatch.actual || 'empty-state contradiction',
      })))
      failures.routeFailures.push(...report.contradictions.map((mismatch) => ({
        route: mismatch.route || report.route || 'unknown',
        reason: mismatch.actual || 'UI shows empty-state text while live resources exist',
        expected: `${mismatch.field || 'resource'} > 0`,
        actual: report.bodyPreview || null,
      })))
    }
    if (report.kind === 'interactive-control-missing') {
      failures.interactiveFailures.push({
        control: report.control || 'unknown',
        reason: 'required interactive control was not visible',
        route: report.route || 'unknown',
      })
    }
    if (Array.isArray(report.fixtureMismatches)) {
      failures.fixtureMismatches.push(...report.fixtureMismatches)
    }
  }

  return mergeLiveUiFailureObjects(failures)
}

function liveFailuresFromBrowserMatrixReports(browserMatrixReports) {
  const failures = { browserMatrixFailures: [] }
  for (const report of browserMatrixReports || []) {
    for (const difference of report.differences || []) {
      failures.browserMatrixFailures.push({
        classification: difference.classification || report.classification || 'browser-layout-drift',
        browser: difference.browser,
        route: difference.route,
        control: difference.control,
        reason: difference.reason || 'cross-browser matrix difference',
        screenshotPath: difference.screenshotPath,
        expectedTopLayer: difference.expectedTopLayer,
        actualTopLayer: difference.actualTopLayer,
        details: difference,
      })
    }
  }
  return mergeLiveUiFailureObjects(failures)
}

function invariantIdsFrom(failures, evidenceItems, logText = '') {
  const fromEvidence = evidenceItems.flatMap((item) => item.invariantIds || [])
  const fromFailures = failures.flatMap((failure) =>
    [...`${failure.title || ''}\n${failure.error || ''}\n${failure.specPath || ''}`.matchAll(/@invariant:([A-Za-z0-9_-]+)/g)].map((match) => match[1])
  )
  const fromFailedLogLines = sanitizeText(logText)
    .split(/\r?\n/)
    .filter((line) => /@invariant:/.test(line) && /(✘|##\[error\]|\bfailed\b)/i.test(line))
    .flatMap((line) => [...line.matchAll(/@invariant:([A-Za-z0-9_-]+)/g)].map((match) => match[1]))
  return dedupe([...fromEvidence, ...fromFailures, ...fromFailedLogLines])
}

function artifactPathsFromText(logText) {
  const text = sanitizeText(logText)
  return dedupe(
    [...text.matchAll(/e2e\/visual-login\/test-results\/[^\s)]+/g)]
      .map((match) => match[0].replace(/[.,;:]+$/, ''))
  )
}

function classifyFailure({ failures, evidenceItems, liveUiFailures, logText }) {
  const text = sanitizeText(JSON.stringify({ failures, evidenceItems, liveUiFailures }) + '\n' + logText).toLowerCase()
  const browserMatrixFailures = liveUiFailures.browserMatrixFailures || []
  const networkClassifications = liveUiFailures.networkClassifications || []
  const unexpectedNetworkResponses = liveUiFailures.unexpectedNetworkResponses || []
  const rateLimitEvents = collectRateLimitEvidence({ evidenceItems, liveUiFailures, logText })
  const hasCoreRateLimit = rateLimitEvents.some((event) => event.core)
  const hasStructuredCoreRateLimit = rateLimitEvents.some((event) => event.core && event.source !== 'log')
  const hasOptionalRateLimit = rateLimitEvents.some((event) => event.optional)
  const hasProductEvidence = (
    failures.length
    || evidenceItems.length
    || Object.values(liveUiFailures).some(value => Array.isArray(value) && value.length)
  )
  const hasCandidateImageFailure = /candidate image (?:is )?not (?:available|visible)|not found.*ghcr\.io/.test(text)
  const hasCanaryInfraFailure = (
    /(?:##\[error\]|::error::|error:)\s*canary .*port-forward did not become healthy/.test(text)
    || /services? ".*canary.*" not found|cannot find package '@playwright\/test'/.test(text)
  )
  const hasLiveNetworkFailure = unexpectedNetworkResponses.length
    || (liveUiFailures.unexpectedRequestFailures || []).length
    || browserMatrixFailures.some(failure => failure.classification === 'live-network-error')
    || /live-network-error|startup-error|infrastructure connection error|unexpected app-origin|4xx|5xx|bad request/.test(text)
  if ((hasCandidateImageFailure || hasCanaryInfraFailure) && !hasProductEvidence) return 'canary-setup'
  if (hasStructuredCoreRateLimit || networkClassifications.some(item =>
    item.classification === 'live-rate-limit-data-loss' && isCoreResourceEndpoint(item.url)
  )) return 'live-rate-limit-data-loss'
  if (browserMatrixFailures.some(failure => failure.classification === 'canary-setup') || text.includes('canary-setup')) return 'canary-setup'
  if ((liveUiFailures.apiUiMismatches || []).length || /ui-api-mismatch/.test(text)) return 'ui-api-mismatch'
  if (networkClassifications.some(item => item.classification === 'local-agent-status-unreachable')) return 'local-agent-status-unreachable'
  if ((liveUiFailures.dashboardMismatches || []).length || text.includes('live-dashboard-groundtruth-match')) return 'dashboard-groundtruth-mismatch'
  if ((liveUiFailures.routeFailures || []).length || text.includes('live-core-pages-render-real-data')) return 'core-page-live-data-missing'
  if ((liveUiFailures.interactiveFailures || []).length || text.includes('live-interactive-surfaces-work')) return 'interactive-surface-broken'
  if ((liveUiFailures.fixtureMismatches || []).length || text.includes('live-fixture-ui-match')) return 'fixture-state-mismatch'
  if ((liveUiFailures.textCollisions || []).length || text.includes('visible text must not severely overlap')) return 'live-ui-overlap'
  if ((liveUiFailures.forbiddenMatches || []).length || /demo mode|connection log|refreshing local agent/.test(text)) return 'live-ui-forbidden-artifact'
  if ((liveUiFailures.warningBadges || []).length || /\b\d+\s+warnings?\b/.test(text)) return 'live-ui-warning-flood'
  if (browserMatrixFailures.some(failure => failure.classification === 'safari-z-index') || text.includes('safari-z-index')) return 'safari-z-index'
  if (browserMatrixFailures.some(failure => failure.classification === 'macos-popup-clipped') || text.includes('macos-popup-clipped')) return 'macos-popup-clipped'
  if (browserMatrixFailures.some(failure => failure.classification === 'macos-top-layer-hidden') || text.includes('macos-top-layer-hidden')) return 'macos-top-layer-hidden'
  if (browserMatrixFailures.some(failure => failure.classification === 'browser-semantic-field-mismatch') || text.includes('browser-semantic-field-mismatch')) return 'browser-semantic-field-mismatch'
  if (browserMatrixFailures.some(failure => failure.classification === 'browser-content-missing') || text.includes('browser-content-missing')) return 'browser-content-missing'
  if (browserMatrixFailures.some(failure => failure.classification === 'browser-interaction-broken') || text.includes('browser-interaction-broken')) return 'browser-interaction-broken'
  if (browserMatrixFailures.some(failure => failure.classification === 'browser-layout-drift') || text.includes('browser-layout-drift')) return 'browser-layout-drift'
  if (browserMatrixFailures.some(failure => failure.classification === 'browser-visual-baseline') || text.includes('browser-visual-baseline')) return 'browser-visual-baseline'
  if (browserMatrixFailures.some(failure => failure.classification === 'auth-boundary') || text.includes('auth-boundary')) return 'auth-boundary'
  if (hasOptionalRateLimit || networkClassifications.some(item => item.classification === 'optional-live-integration-unreachable')) return 'optional-live-integration-unreachable'
  if (hasCoreRateLimit) return 'live-rate-limit-data-loss'
  if (rateLimitEvents.length || /too many requests|rate limited/.test(text)) return 'live-network-error'
  if (hasLiveNetworkFailure) return 'live-network-error'
  if (/cluster-dashboard-groundtruth-match|groundtruth/.test(text)) return 'groundtruth-mismatch'
  if (/oauth|\/api\/me|auth boundary|unauthenticated/.test(text)) return 'auth-boundary'
  if (/weak-test-assertion|literal word [`'"]?ready|\/ready\/i/.test(text)) return 'weak-test-assertion'
  return 'canary-setup'
}

function likelyAreasFor(type) {
  if (type === 'live-ui-overlap' || type === 'live-ui-forbidden-artifact' || type === 'live-ui-warning-flood') {
    return [
      'web/src/components/**',
      'web/src/components/dashboard/**',
      'web/src/components/ui/**',
      'web/e2e/visual-login/helpers/liveSiteAssertions.ts',
    ]
  }
  if (type === 'live-network-error') {
    return ['web/src/hooks/**', 'web/src/lib/**', 'web/src/components/cards/**', 'cmd/console/**']
  }
  if (type === 'optional-live-integration-unreachable') {
    return ['web/src/hooks/**', 'web/src/components/cards/**', 'web/src/components/stellar/**', 'web/e2e/visual-login/helpers/liveSiteAssertions.ts']
  }
  if (type === 'live-rate-limit-data-loss') {
    return ['cmd/console/**', 'web/src/hooks/**', 'web/src/components/namespaces/**', 'web/e2e/visual-login/helpers/liveSiteAssertions.ts']
  }
  if (type === 'ui-api-mismatch') {
    return ['web/src/components/**', 'web/src/hooks/**', 'web/src/lib/dashboards/**']
  }
  if (type === 'local-agent-status-unreachable') {
    return ['web/src/hooks/**', 'web/src/components/cards/**', 'cmd/console/**']
  }
  if (type === 'weak-test-assertion') {
    return ['web/e2e/visual-login/**', 'web/harness/**']
  }
  if (type === 'safari-z-index' || type === 'macos-popup-clipped' || type === 'macos-top-layer-hidden' || type === 'browser-layout-drift' || type === 'browser-interaction-broken') {
    return [
      'web/src/components/layout/**',
      'web/src/components/ui/**',
      'web/src/components/dashboard/**',
      'web/e2e/visual-login/macos-popup/**',
      'web/e2e/visual-login/browser-matrix/**',
    ]
  }
  if (type === 'browser-content-missing') {
    return [
      'web/src/pages/**',
      'web/src/components/**',
      'web/src/hooks/**',
      'cmd/console/**',
    ]
  }
  if (type === 'browser-semantic-field-mismatch') {
    return [
      'web/src/components/**',
      'web/src/hooks/**',
      'web/src/lib/dashboards/**',
      'web/e2e/visual-login/browser-matrix/**',
    ]
  }
  if (type === 'browser-visual-baseline') {
    return [
      'web/e2e/visual-login/browser-matrix/**',
      'web/src/components/**',
    ]
  }
  if (type === 'dashboard-groundtruth-mismatch') {
    return [
      'web/src/hooks/useUniversalStats.ts',
      'web/src/config/dashboards/main.ts',
      'web/src/components/ui/StatsOverview.tsx',
      'cmd/console/**',
    ]
  }
  if (type === 'core-page-live-data-missing') {
    return [
      'web/src/pages/**',
      'web/src/components/**',
      'web/src/hooks/**',
      'cmd/console/**',
    ]
  }
  if (type === 'interactive-surface-broken') {
    return [
      'web/src/components/layout/**',
      'web/src/components/ui/**',
      'web/src/components/search/**',
      'web/src/components/dashboard/**',
    ]
  }
  if (type === 'fixture-state-mismatch') {
    return [
      'web/harness/groundtruth/liveFixtureManager.ts',
      'web/e2e/visual-login/semantic/live-fixtures.spec.ts',
      'web/src/components/**',
      'web/src/hooks/**',
    ]
  }
  if (type === 'groundtruth-mismatch') {
    return ['web/src/components/**', 'web/harness/groundtruth/**', 'web/e2e/visual-login/semantic/live-canary-ui.spec.ts']
  }
  if (type === 'auth-boundary') {
    return ['web/src/lib/auth.tsx', 'cmd/console/**', 'deploy/helm/kubestellar-console/**', '.github/workflows/console-live-promote.yml']
  }
  return ['.github/workflows/console-live-promote.yml', 'web/e2e/visual-login/**', 'deploy/helm/kubestellar-console/**']
}

function shortFailure(type, failures) {
  const firstError = failures[0]?.error || ''
  if (type === 'live-ui-overlap') return 'visible text overlap blocks promotion'
  if (type === 'live-ui-forbidden-artifact') return 'live UI shows demo or local-only artifact'
  if (type === 'live-ui-warning-flood') return 'live UI shows warning flood'
  if (type === 'live-network-error') return 'live UI has unexpected network errors'
  if (type === 'optional-live-integration-unreachable') return 'optional live integration is unavailable or rate-limited'
  if (type === 'live-rate-limit-data-loss') return 'resource API rate limiting causes live data loss'
  if (type === 'ui-api-mismatch') return 'UI does not match authenticated API data'
  if (type === 'local-agent-status-unreachable') return 'local agent status endpoint is unreachable'
  if (type === 'weak-test-assertion') return 'live canary failed because the assertion was too weak'
  if (type === 'safari-z-index') return 'WebKit overlay or text stacking differs from Chromium'
  if (type === 'macos-popup-clipped') return 'macOS WebKit popup is clipped'
  if (type === 'macos-top-layer-hidden') return 'macOS WebKit popup is hidden behind page content'
  if (type === 'browser-layout-drift') return 'browser layout differs significantly from Chromium'
  if (type === 'browser-semantic-field-mismatch') return 'browser semantic fields differ from expected live data'
  if (type === 'browser-content-missing') return 'browser is missing expected live content'
  if (type === 'browser-interaction-broken') return 'browser interaction is broken'
  if (type === 'browser-visual-baseline') return 'browser screenshot differs from its baseline'
  if (type === 'dashboard-groundtruth-mismatch') return 'Dashboard stats do not match live Kubernetes groundtruth'
  if (type === 'core-page-live-data-missing') return 'core live page is missing expected live data'
  if (type === 'interactive-surface-broken') return 'interactive live UI surface is broken'
  if (type === 'fixture-state-mismatch') return 'controlled fixture state is missing or mislabeled'
  if (type === 'groundtruth-mismatch') return 'live UI does not match cluster groundtruth'
  if (type === 'auth-boundary') return 'production auth boundary failed'
  return sanitizeText(firstError.split('\n')[0] || 'canary setup failed').slice(0, 80)
}

async function fetchFailedJobLogs({ github, owner, repo, failedJobs }) {
  const logs = []
  for (const job of failedJobs) {
    try {
      const response = await github.request('GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs', {
        owner,
        repo,
        job_id: job.id,
      })
      const data = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
      logs.push({ job: job.name, text: sanitizeText(data) })
    } catch (error) {
      logs.push({ job: job.name, text: `Could not fetch job log: ${error.message}` })
    }
  }
  return logs
}

function logExcerpt(logs) {
  const primaryPatterns = [
    /visible text must not severely overlap/i,
    /live ui must/i,
    /stats must match/i,
    /deployments-total|deployments-available|namespaces-total|pods-total|nodes-total/i,
    /"first":/i,
    /"second":/i,
    /"ratio":/i,
    /attachment #/i,
    /Error Context:/i,
    /@invariant:/i,
  ]
  const fallbackPatterns = [
    /groundtruth/i,
    /\/api\/me/i,
    /oauth/i,
    /##\[error\]/i,
    /Process completed with exit code/i,
  ]

  function collect(patterns) {
    const excerpts = []
    for (const log of logs) {
      const lines = sanitizeText(log.text).split(/\r?\n/).filter((line) => !isSensitiveLogLine(line))
      const matched = new Set()
      lines.forEach((line, index) => {
        if (!patterns.some((pattern) => pattern.test(line))) return
        for (let i = Math.max(0, index - 4); i <= Math.min(lines.length - 1, index + 8); i += 1) matched.add(i)
      })
      const selected = [...matched].sort((a, b) => a - b).map((index) => lines[index]).join('\n')
      if (selected) excerpts.push(`### ${log.job}\n\n\`\`\`text\n${truncate(selected, 3500)}\n\`\`\``)
    }
    return excerpts
  }

  let excerpts = collect(primaryPatterns)
  if (!excerpts.length) excerpts = collect(fallbackPatterns)
  return excerpts.join('\n\n') || 'No concise log excerpt could be extracted. Use the run link and artifacts.'
}

function parseImageState(logText, run) {
  const cleaned = sanitizeText(logText)
  const resolvedMatches = [...cleaned.matchAll(/Resolved candidate image ([^\s\r\n]+)/g)]
    .map((match) => match[1].trim().replace(/^"|"$/g, ''))
    .filter((image) => !image.includes('$'))
  const currentMatches = [...cleaned.matchAll(/Live currently runs ([^;\r\n]+); candidate is ([^\s\r\n]+)/g)]
    .map((match) => ({ current: match[1].trim(), candidate: match[2].trim().replace(/^"|"$/g, '') }))
    .filter((match) => !match.current.includes('${') && !match.candidate.includes('${'))
  const alreadyMatches = [...cleaned.matchAll(/Live already runs ([^\s\r\n]+)/g)]
    .map((match) => match[1].trim().replace(/^"|"$/g, ''))
    .filter((image) => !image.includes('$'))
  const currentMatch = currentMatches[currentMatches.length - 1]
  const alreadyMatch = alreadyMatches[alreadyMatches.length - 1]
  const resolvedCandidate = resolvedMatches[resolvedMatches.length - 1]
  const candidate = currentMatch?.candidate || resolvedCandidate || `${IMAGE_REPOSITORY}:${run.head_sha}`
  return {
    current: currentMatch?.current || alreadyMatch || 'not parsed',
    candidate,
  }
}

function productionBlocked(jobs) {
  const steps = jobs.flatMap((job) => job.steps || [])
  const safetyStepNames = new Set([
    'Deploy candidate to console-live',
    'Verify live deployment and auth boundary',
    'Run production auth/session smoke',
    'Promote candidate to production',
    'Verify production security and image',
  ])
  const rollbackRan = steps.some((step) => /^Roll back live /.test(step.name || '') && step.conclusion === 'success')
  if (rollbackRan) return 'yes'
  const safetySteps = steps.filter((step) => safetyStepNames.has(step.name))
  if (!safetySteps.length) return 'unknown'
  return safetySteps.some((step) => ['failure', 'cancelled', 'timed_out'].includes(step.conclusion)) ? 'yes' : 'no'
}

function artifactRows(artifacts, runUrlBase, runId) {
  return artifacts.map((artifact) => {
    const url = `${runUrlBase}/${runId}/artifacts/${artifact.id}`
    return `| [${escapeCell(artifact.name)}](${url}) | ${escapeCell(artifact.size_in_bytes)} | ${escapeCell(artifact.expired ? 'yes' : 'no')} |`
  })
}

function labelsForFailureType(failureType) {
  const labels = ['console-live', 'live-canary', 'test-failure', 'needs-fix']
  if (/^(auth-boundary|live-network-error|safari-z-index|macos-popup-clipped|macos-top-layer-hidden|browser-layout-drift|browser-semantic-field-mismatch|browser-content-missing|browser-interaction-broken|browser-visual-baseline)$/.test(failureType)) {
    labels.push('browser-matrix')
  }
  return labels
}

function summarizeNetworkEvidence(evidenceItems, liveUiFailures = {}) {
  const requestCountsByEndpoint = {}
  for (const item of evidenceItems) {
    const network = item.network || {}
    for (const [endpoint, count] of Object.entries(network.requestCountsByEndpoint || {})) {
      requestCountsByEndpoint[endpoint] = (requestCountsByEndpoint[endpoint] || 0) + Number(count || 0)
    }
  }
  const rateLimitEvents = collectRateLimitEvidence({ evidenceItems, liveUiFailures, logText: '' })
  return {
    topRequestCounts: Object.entries(requestCountsByEndpoint)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 25)
      .map(([endpoint, count]) => ({ endpoint, count })),
    rateLimitEvents: rateLimitEvents.slice(0, 25),
  }
}

function buildReproductionCommand(failureType) {
  if (/^(macos-popup-clipped|macos-top-layer-hidden)$/.test(failureType)) {
    return [
      '```bash',
      'cd web',
      '# Requires CONSOLE_LIVE_JWT_SECRET, CONSOLE_LIVE_TEST_USER_ID, and CONSOLE_LIVE_TEST_GITHUB_LOGIN in env.',
      'export CONSOLE_LIVE_TEST_SESSION_JWT="$(cd .. && node .github/scripts/console-live-mint-session.cjs)"',
      'LIVE_SITE_TESTS=true \\',
      'LIVE_SITE_AUTH_MODE=signed-cookie \\',
      'LIVE_CANARY_CONSOLE_URL=https://console-live.kubestellar.io \\',
      'SELF_HOSTED_CONSOLE_URL=https://console-live.kubestellar.io \\',
      'npm run test:visual:macos-popup',
      '```',
    ].join('\n')
  }
  if (failureType === 'safari-z-index') {
    return [
      '```bash',
      'cd web',
      '# Requires CONSOLE_LIVE_JWT_SECRET, CONSOLE_LIVE_TEST_USER_ID, and CONSOLE_LIVE_TEST_GITHUB_LOGIN in env.',
      '# macOS/WebKit popup lane',
      'export CONSOLE_LIVE_TEST_SESSION_JWT="$(cd .. && node .github/scripts/console-live-mint-session.cjs)"',
      'LIVE_SITE_TESTS=true \\',
      'LIVE_SITE_AUTH_MODE=signed-cookie \\',
      'LIVE_CANARY_CONSOLE_URL=https://console-live.kubestellar.io \\',
      'SELF_HOSTED_CONSOLE_URL=https://console-live.kubestellar.io \\',
      'npm run test:visual:macos-popup',
      '',
      '# Linux cross-browser matrix, when the failure came from Console Live Promote',
      'LIVE_SITE_TESTS=true \\',
      'LIVE_CLUSTER_TESTS=true \\',
      'LIVE_SITE_AUTH_MODE=signed-cookie \\',
      'LIVE_CANARY_CONSOLE_URL=https://console-live.kubestellar.io \\',
      'SELF_HOSTED_CONSOLE_URL=https://console-live.kubestellar.io \\',
      'npm run test:visual:browser-matrix',
      'npm run test:visual:browser-matrix:compare',
      '```',
    ].join('\n')
  }
  if (/^(browser-layout-drift|browser-semantic-field-mismatch|browser-content-missing|browser-interaction-broken|browser-visual-baseline)$/.test(failureType)) {
    return [
      '```bash',
      'cd web',
      '# Requires CONSOLE_LIVE_JWT_SECRET, CONSOLE_LIVE_TEST_USER_ID, and CONSOLE_LIVE_TEST_GITHUB_LOGIN in env.',
      'export CONSOLE_LIVE_TEST_SESSION_JWT="$(cd .. && node .github/scripts/console-live-mint-session.cjs)"',
      'LIVE_SITE_TESTS=true \\',
      'LIVE_CLUSTER_TESTS=true \\',
      'LIVE_SITE_AUTH_MODE=signed-cookie \\',
      'LIVE_CANARY_CONSOLE_URL=https://console-live.kubestellar.io \\',
      'SELF_HOSTED_CONSOLE_URL=https://console-live.kubestellar.io \\',
      'npm run test:visual:browser-matrix',
      'npm run test:visual:browser-matrix:compare',
      '```',
    ].join('\n')
  }
  return [
    '```bash',
    'cd web',
    '# Requires CONSOLE_LIVE_JWT_SECRET, CONSOLE_LIVE_TEST_USER_ID, and CONSOLE_LIVE_TEST_GITHUB_LOGIN in env.',
    'export CONSOLE_LIVE_TEST_SESSION_JWT="$(cd .. && node .github/scripts/console-live-mint-session.cjs)"',
    'LIVE_SITE_TESTS=true \\',
    'LIVE_CLUSTER_TESTS=true \\',
    'LIVE_SITE_AUTH_MODE=signed-cookie \\',
    'LIVE_CANARY_CONSOLE_URL=https://console-live.kubestellar.io \\',
    'SELF_HOSTED_CONSOLE_URL=https://console-live.kubestellar.io \\',
    'LIVE_PRODUCTION_CONSOLE_URL=https://console-live.kubestellar.io \\',
    'npm run test:visual:live',
    '```',
  ].join('\n')
}

function buildBody({
  marker,
  run,
  failedJobs,
  failures,
  evidenceFiles,
  evidenceItems,
  logArtifactPaths,
  reportFiles,
  artifacts,
  logExcerptText,
  liveUiFailures,
  failureType,
  invariantIds,
  imageState,
  blocked,
  runUrlBase,
  runId,
}) {
  const failureRows = failures.map((failure) =>
    `| ${escapeCell(failure.title)} | ${escapeCell(failure.project)} | ${escapeCell(failure.status)} | ${escapeCell(failure.retry)} | ${escapeCell(failure.specPath)} |`
  )
  const attachmentPaths = dedupe(failures.flatMap((failure) => failure.attachments || []))
  const likelyFiles = likelyAreasFor(failureType)
  const networkSummary = summarizeNetworkEvidence(evidenceItems, liveUiFailures)

  return [
    marker,
    '# Console Live Canary Failure',
    '',
    'A console-live canary workflow failed. This issue is structured for an AI agent to fix the underlying UI/test failure without first digging through raw Actions logs.',
    '',
    '## Summary',
    '',
    `- Failure type: \`${failureType}\``,
    `- Safety rollback/auth gate triggered: \`${blocked}\``,
    `- Candidate image: \`${imageState.candidate}\``,
    `- Current production image: \`${imageState.current}\``,
    `- Run: [#${runId}](${run.html_url})`,
    `- Commit: \`${run.head_sha}\``,
    '',
    '## Failed Invariants',
    '',
    invariantIds.length ? invariantIds.map((id) => `- \`${id}\``).join('\n') : '- No invariant IDs parsed.',
    '',
    '## Failed Tests',
    '',
    '| Test | Project | Status | Retry | Spec |',
    '|---|---|---|---:|---|',
    failureRows.length ? failureRows.join('\n') : '| No Playwright failure rows parsed | n/a | n/a | 0 | n/a |',
    '',
    '## Parsed Failure Details',
    '',
    '```json',
    truncate(JSON.stringify(liveUiFailures, null, 2), 5000),
    '```',
    '',
    '## Network Evidence',
    '',
    '```json',
    truncate(JSON.stringify(networkSummary, null, 2), 5000),
    '```',
    '',
    '## Evidence',
    '',
    '| Artifact | Size bytes | Expired |',
    '|---|---:|---|',
    artifacts.length ? artifactRows(artifacts, runUrlBase, runId).join('\n') : '| No uploaded evidence artifact found | 0 | n/a |',
    '',
    'Referenced paths inside artifacts:',
    '',
    ...dedupe([...attachmentPaths, ...evidenceFiles, ...reportFiles, ...logArtifactPaths]).slice(0, 30).map((file) => `- \`${file.replace(/\\/g, '/')}\``),
    '',
    '## Log Excerpt',
    '',
    logExcerptText,
    '',
    '## Likely Area',
    '',
    ...likelyFiles.map((file) => `- \`${file}\``),
    '',
    '## Reproduction',
    '',
    'This command assumes access to the live-test JWT secret and test user env vars so a short-lived `kc_auth` cookie can be generated before running against the public live URL:',
    '',
    buildReproductionCommand(failureType),
    '',
    '## Agent Instructions',
    '',
    '1. Inspect the failed invariant and screenshot/trace evidence first.',
    '2. Do not update screenshot baselines unless the failure type is only `browser-visual-baseline` and the visual change was intentional.',
    '3. Fix the UI overlap, browser-specific layout issue, forbidden live artifact, network error, or groundtruth mismatch in code.',
    '4. Rerun the live canary test.',
    '5. Rerun the relevant canary. Deployment/auth failures should remain blocking; UI/data/browser regressions should create or update issues for the fix loop.',
  ].join('\n')
}

function selectExistingIssue(matchingIssues, marker, title) {
  const bySignature = (issue) => issue.body && issue.body.includes(marker)
  const openMatchingIssues = matchingIssues.filter((issue) => issue.state === 'open')
  const closedMatchingIssues = matchingIssues.filter((issue) => issue.state !== 'open')
  const existingOpen = openMatchingIssues.find(bySignature) || openMatchingIssues.find((issue) => issue.title === title) || openMatchingIssues[0]
  const existingClosed = closedMatchingIssues.find(bySignature) || closedMatchingIssues.find((issue) => issue.title === title) || closedMatchingIssues[0]

  return {
    existing: existingOpen || existingClosed,
    openMatchingIssues,
  }
}

module.exports = async ({ github, context, core }) => {
  const owner = context.repo.owner
  const repo = context.repo.repo
  const runId = Number(process.env.SOURCE_RUN_ID)
  const artifactRoot = process.env.ARTIFACT_ROOT || 'console-live-promote-artifacts'
  const runUrlBase = `${context.serverUrl}/${owner}/${repo}/actions/runs`

  const { data: repoInfo } = await github.rest.repos.get({ owner, repo })
  if (!repoInfo.has_issues) {
    core.warning(`GitHub Issues are disabled for ${owner}/${repo}; cannot create issue.`)
    return
  }

  const { data: run } = await github.rest.actions.getWorkflowRun({ owner, repo, run_id: runId })
  if (!LIVE_CANARY_WORKFLOWS.has(run.name)) {
    core.warning(`Run ${runId} is "${run.name}", not a supported console live canary workflow; skipping.`)
    return
  }
  const issueWorthyConclusions = new Set(['failure', 'cancelled', 'timed_out'])
  if (!issueWorthyConclusions.has(run.conclusion)) {
    core.info(`Run ${runId} concluded with ${run.conclusion}; no issue needed.`)
    return
  }

  for (const [name, def] of Object.entries(LABELS)) {
    try {
      await github.rest.issues.getLabel({ owner, repo, name })
    } catch {
      await github.rest.issues.createLabel({ owner, repo, name, color: def.color, description: def.description }).catch((error) => {
        core.warning(`Could not create label ${name}: ${error.message}`)
      })
    }
  }

  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, { owner, repo, run_id: runId, per_page: 100 })
  const failedJobs = jobs.filter((job) => issueWorthyConclusions.has(job.conclusion))
  const logs = await fetchFailedJobLogs({ github, owner, repo, failedJobs })
  const combinedLogText = logs.map((log) => log.text).join('\n')

  const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, { owner, repo, run_id: runId, per_page: 100 })
  const files = walk(artifactRoot)
  const resultFiles = files.filter((file) => /(^|[\\/])results\.json$/i.test(file))
  const evidenceFiles = files.filter((file) => /(^|[\\/])evidence\.json$/i.test(file)).map((file) => path.relative(process.cwd(), file))
  const reportFiles = files.filter((file) => /[\\/]test-results[\\/]reports[\\/]/i.test(file)).map((file) => path.relative(process.cwd(), file))
  const evidenceItems = evidenceFiles
    .map((file) => readJsonFile(path.resolve(process.cwd(), file)))
    .filter(Boolean)
  const liveReports = files
    .filter((file) => /(^|[\\/])live-site\.json$/i.test(file))
    .flatMap((file) => {
      const parsed = readJsonFile(file)
      return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : [])
    })
  const routeReports = files
    .filter((file) => /(^|[\\/])live-routes\.json$/i.test(file))
    .flatMap((file) => {
      const parsed = readJsonFile(file)
      return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : [])
    })
  const browserMatrixReports = files
    .filter((file) => /(^|[\\/])(?:browser-matrix|macos-popup-matrix)\.json$/i.test(file))
    .flatMap((file) => {
      const parsed = readJsonFile(file)
      return parsed ? [parsed] : []
    })

  const failures = resultFiles.flatMap((file) => {
    const report = readJsonFile(file)
    return report ? collectPlaywrightFailures(report, path.relative(process.cwd(), file)) : []
  })
  if (!failures.length && combinedLogText) {
    failures.push({
      sourceFile: 'workflow logs',
      specPath: 'not parsed',
      title: `${run.name} failed`,
      project: 'not parsed',
      status: 'failed',
      retry: 0,
      error: sanitizeText(truncate(logExcerpt(logs), 2500)),
      attachments: [],
    })
  }

  const liveUiFailures = mergeLiveUiFailureObjects(
    mergeLiveUiFailures(evidenceItems),
    inferLiveUiFailuresFromText(combinedLogText),
    liveFailuresFromRouteReports(routeReports),
    liveFailuresFromBrowserMatrixReports(browserMatrixReports),
  )
  const invariantIds = invariantIdsFrom(failures, evidenceItems, combinedLogText)
  const logArtifactPaths = artifactPathsFromText(combinedLogText)
  const failureType = classifyFailure({ failures, evidenceItems, liveUiFailures, logText: combinedLogText })
  const imageState = parseImageState(combinedLogText, run)
  const blocked = productionBlocked(jobs)
  const signatureSource = [
    failureType,
    invariantIds.join(','),
    failures.map((failure) => `${failure.specPath}:${failure.title}`).sort().join('|'),
    JSON.stringify(liveUiFailures).slice(0, 500),
  ].join('|') || `console-live-promote:${runId}`
  const signature = crypto.createHash('sha256').update(signatureSource).digest('hex').slice(0, 16)
  const marker = `<!-- console-live-promote-signature:${signature} -->`
  const browserMatrixFailure = /^(auth-boundary|live-network-error|safari-z-index|macos-popup-clipped|macos-top-layer-hidden|browser-layout-drift|browser-semantic-field-mismatch|browser-content-missing|browser-interaction-broken|browser-visual-baseline)$/.test(failureType)
  const titlePrefix = browserMatrixFailure ? '[console-live][browser-matrix]' : '[console-live][canary-blocked]'
  const title = `${titlePrefix}[${failureType}] ${shortFailure(failureType, failures)}`
  const issueLabels = labelsForFailureType(failureType)

  let body = buildBody({
    marker,
    run,
    failedJobs,
    failures,
    evidenceFiles,
    evidenceItems,
    logArtifactPaths,
    liveReports,
    reportFiles,
    artifacts: artifacts.filter((artifact) => LIVE_ARTIFACT_NAMES.has(artifact.name) || artifact.name.includes('console-live')),
    logExcerptText: logExcerpt(logs),
    liveUiFailures,
    failureType,
    invariantIds,
    imageState,
    blocked,
    runUrlBase,
    runId,
  })
  if (body.length > 60000) body = `${body.slice(0, 59000)}\n\n...body truncated...\n${marker}`

  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'all',
    labels: 'console-live,live-canary,test-failure',
    per_page: 100,
  })
  const runMarker = `actions/runs/${runId}`
  const matchingIssues = issues.filter((issue) => {
    const issueBody = issue.body || ''
    return issueBody.includes(marker)
      || issueBody.includes(runMarker)
      || issue.title === title
  })
  const { existing, openMatchingIssues } = selectExistingIssue(matchingIssues, marker, title)

  if (existing) {
    const recurrenceBody = [
      marker,
      `${run.name} is still failing with \`${failureType}\`.`,
      '',
      `- Run: [#${runId}](${run.html_url})`,
      `- Candidate image: \`${imageState.candidate}\``,
      `- Safety rollback/auth gate triggered: \`${blocked}\``,
    ].join('\n')

    if (existing.state === 'open') {
      await github.rest.issues.update({ owner, repo, issue_number: existing.number, title, body, labels: issueLabels })
      const duplicates = openMatchingIssues.filter((issue) => issue.number !== existing.number)
      for (const duplicate of duplicates) {
        await github.rest.issues.createComment({
          owner,
          repo,
          issue_number: duplicate.number,
          body: [
            `Superseded by #${existing.number} for the same console live canary failure.`,
            '',
            `- Run: [#${runId}](${run.html_url})`,
            `- Failure type: \`${failureType}\``,
          ].join('\n'),
        })
        await github.rest.issues.update({
          owner,
          repo,
          issue_number: duplicate.number,
          state: 'closed',
          state_reason: 'not_planned',
        })
      }
      await github.rest.issues.createComment({
        owner,
        repo,
        issue_number: existing.number,
        body: recurrenceBody,
      })
      core.info(`Updated existing console live canary failure issue #${existing.number}.`)
      return
    }

    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: existing.number,
      body: [
        marker,
        `${run.name} failed again with \`${failureType}\`.`,
        '',
        'This matching issue is closed, so the workflow is leaving it closed and adding the recurrence here instead of reopening it.',
        '',
        `- Run: [#${runId}](${run.html_url})`,
        `- Candidate image: \`${imageState.candidate}\``,
        `- Safety rollback/auth gate triggered: \`${blocked}\``,
      ].join('\n'),
    })
    core.info(`Commented on closed console live canary failure issue #${existing.number} without reopening it.`)
    return
  }

  const created = await github.rest.issues.create({
    owner,
    repo,
    title,
    body,
    labels: issueLabels,
  })
  core.info(`Created console live canary failure issue #${created.data.number}.`)
}

module.exports._test = {
  classifyFailure,
  inferLiveUiFailuresFromText,
  labelsForFailureType,
  liveFailuresFromRouteReports,
  parseImageState,
  selectExistingIssue,
}
