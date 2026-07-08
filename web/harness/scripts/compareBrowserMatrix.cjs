#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const REPORT_DIR = path.resolve(process.cwd(), 'test-results/reports/browser-matrix')
const OUT_PATH = path.resolve(process.cwd(), 'test-results/reports/browser-matrix.json')
const CHROMIUM = 'chromium'
const CRITICAL = 'critical'
const REQUIRED_BROWSERS = ['chromium', 'firefox', 'webkit']

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function browserKey(report) {
  return String(report.browserName || report.projectName || '').replace(/^live-/, '')
}

function routeKey(route) {
  return route.route || 'unknown'
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function boxDelta(a, b) {
  if (!a || !b) return 0
  return Math.max(
    Math.abs(safeNumber(a.x) - safeNumber(b.x)),
    Math.abs(safeNumber(a.y) - safeNumber(b.y)),
    Math.abs(safeNumber(a.width) - safeNumber(b.width)),
    Math.abs(safeNumber(a.height) - safeNumber(b.height)),
  )
}

function pushDifference(differences, entry) {
  differences.push({
    severity: CRITICAL,
    ...entry,
  })
}

function isCanarySetupFailure(value) {
  return /connection refused|ecconnrefused|port-forward|did not become healthy|candidate image|cannot connect to 127\.0\.0\.1|could not connect to 127\.0\.0\.1/i.test(String(value || ''))
}

function isRateLimitFailure(value) {
  return /\b429\b|rate limited|too many requests|retry-after/i.test(String(value || ''))
}

function classify(differences) {
  if (differences.some(diff => diff.classification === 'canary-setup')) return 'canary-setup'
  if (differences.some(diff => diff.classification === 'live-rate-limit-data-loss')) return 'live-rate-limit-data-loss'
  if (differences.some(diff => diff.classification === 'auth-boundary')) return 'auth-boundary'
  if (differences.some(diff => diff.classification === 'live-network-error')) return 'live-network-error'
  if (differences.some(diff => diff.classification === 'safari-z-index')) return 'safari-z-index'
  if (differences.some(diff => diff.classification === 'browser-semantic-field-mismatch')) return 'browser-semantic-field-mismatch'
  if (differences.some(diff => diff.classification === 'browser-content-missing')) return 'browser-content-missing'
  if (differences.some(diff => diff.classification === 'browser-interaction-broken')) return 'browser-interaction-broken'
  if (differences.some(diff => diff.classification === 'browser-layout-drift')) return 'browser-layout-drift'
  if (differences.some(diff => diff.classification === 'browser-visual-baseline')) return 'browser-visual-baseline'
  return 'passed'
}

function main() {
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  const files = fs.existsSync(REPORT_DIR)
    ? fs.readdirSync(REPORT_DIR).filter(file => file.endsWith('.json')).map(file => path.join(REPORT_DIR, file))
    : []
  const reports = files.map(readJson).filter(Boolean)
  const byBrowser = new Map(reports.map(report => [browserKey(report), report]))
  const differences = []

  for (const browser of REQUIRED_BROWSERS) {
    if (!byBrowser.has(browser)) {
      pushDifference(differences, {
        classification: 'browser-content-missing',
        browser,
        route: 'matrix',
        reason: `required ${browser} browser matrix report was not produced`,
      })
    }
  }

  for (const report of reports) {
    const browser = browserKey(report)
    if (report.session?.status === 'failed') {
      const sessionError = String(report.session.error || '')
      pushDifference(differences, {
        classification: /\/api\/me|401|session|auth/i.test(sessionError) ? 'auth-boundary' : 'browser-interaction-broken',
        browser,
        route: 'session',
        reason: /\/api\/me|401|session|auth/i.test(sessionError)
          ? 'browser could not establish an authenticated live canary session'
          : 'browser could not establish the live canary session',
        details: report.session,
      })
    }

    for (const route of report.routes || []) {
      if (route.routeState && route.routeState !== 'live') {
        const routeFailureText = [
          route.error,
          route.bodyPreview,
          route.url,
          route.routeState,
        ].filter(Boolean).join('\n')
        const classification = route.routeState === 'login' || route.routeState === 'session-expired'
          ? 'auth-boundary'
          : isCanarySetupFailure(routeFailureText)
            ? 'canary-setup'
            : isRateLimitFailure(routeFailureText)
              ? 'live-rate-limit-data-loss'
              : route.routeState === 'startup-error'
                ? 'live-network-error'
                : 'browser-content-missing'
        pushDifference(differences, {
          classification,
          browser,
          route: route.route,
          reason: classification === 'canary-setup'
            ? 'canary route could not be reached through the private port-forward'
            : classification === 'live-rate-limit-data-loss'
              ? 'route entered startup error because live APIs were rate limited'
              : `route rendered ${route.routeState} state instead of live console content`,
          routeState: route.routeState,
          url: route.url,
          bodyPreview: route.bodyPreview,
          screenshotPath: route.screenshotPath,
          error: route.error,
        })
        continue
      }
      if (route.status === 'failed' || (route.missingMarkers || []).length > 0 || (route.fieldMismatches || []).length > 0) {
        const routeFailureText = [route.error, route.bodyPreview, route.url].filter(Boolean).join('\n')
        pushDifference(differences, {
          classification: isCanarySetupFailure(routeFailureText)
            ? 'canary-setup'
            : isRateLimitFailure(routeFailureText)
            ? 'live-rate-limit-data-loss'
            : (route.fieldMismatches || []).length > 0
            ? 'browser-semantic-field-mismatch'
            : 'browser-content-missing',
          browser,
          route: route.route,
          reason: isCanarySetupFailure(routeFailureText)
            ? 'canary route could not be reached through the private port-forward'
            : isRateLimitFailure(routeFailureText)
            ? 'route data could not be validated because live APIs were rate limited'
            : (route.fieldMismatches || []).length > 0
            ? 'route semantic fields do not match expected live data'
            : 'route is missing expected live content markers',
          missingMarkers: route.missingMarkers || [],
          fieldMismatches: route.fieldMismatches || [],
          screenshotPath: route.screenshotPath,
          error: route.error,
        })
      }
      if (route.baseline?.status === 'failed') {
        pushDifference(differences, {
          classification: 'browser-visual-baseline',
          browser,
          route: route.route,
          reason: 'route screenshot differs from this browser baseline',
          screenshotPath: route.screenshotPath,
          error: route.baseline.error,
        })
      }
      if (safeNumber(route.scrollOverflowX) > 2) {
        pushDifference(differences, {
          classification: 'browser-layout-drift',
          browser,
          route: route.route,
          reason: 'route has horizontal overflow',
          actual: route.scrollOverflowX,
          screenshotPath: route.screenshotPath,
        })
      }
      // Broad clipped/offscreen counts are advisory. They often include
      // intentionally off-canvas or virtualized controls, so only named
      // interaction/top-layer failures should block promotion.
    }

    for (const interaction of report.interactions || []) {
      if (interaction.status === 'failed') {
        pushDifference(differences, {
          classification: browser === 'webkit' ? 'safari-z-index' : 'browser-interaction-broken',
          browser,
          route: interaction.route,
          control: interaction.control,
          reason: interaction.error || 'interactive surface failed',
          expectedTopLayer: interaction.expectedTopLayer,
          actualTopLayer: interaction.actualTopLayer,
          topmostIsOverlay: interaction.topmostIsOverlay,
          screenshotPath: interaction.screenshotPath,
        })
      }
    }
  }

  const chromiumReport = byBrowser.get(CHROMIUM)
  if (chromiumReport) {
    const chromiumRoutes = new Map((chromiumReport.routes || []).map(route => [routeKey(route), route]))
    for (const report of reports) {
      const browser = browserKey(report)
      if (browser === CHROMIUM) continue
      for (const route of report.routes || []) {
        const baseRoute = chromiumRoutes.get(routeKey(route))
        if (!baseRoute) continue
        for (const boxName of ['header', 'sidebar', 'main', 'search', 'filter', 'userMenu', 'firstCard']) {
          const delta = boxDelta(baseRoute.boxes?.[boxName], route.boxes?.[boxName])
          if (delta > 96) {
            pushDifference(differences, {
              classification: 'browser-layout-drift',
              browser,
              comparedTo: CHROMIUM,
              route: route.route,
              element: boxName,
              reason: 'element bounding box differs significantly from Chromium',
              delta,
              chromiumBox: baseRoute.boxes?.[boxName] || null,
              browserBox: route.boxes?.[boxName] || null,
              screenshotPath: route.screenshotPath,
            })
          }
        }

        const collisionDelta = safeNumber(route.textCollisionCount) - safeNumber(baseRoute.textCollisionCount)
        if (collisionDelta > 0) {
          pushDifference(differences, {
            classification: browser === 'webkit' ? 'safari-z-index' : 'browser-layout-drift',
            browser,
            comparedTo: CHROMIUM,
            route: route.route,
            reason: 'browser has more visible text collisions than Chromium',
            chromiumCollisions: baseRoute.textCollisionCount,
            browserCollisions: route.textCollisionCount,
            screenshotPath: route.screenshotPath,
          })
        }
      }
    }
  }

  const browserMatrix = reports.map(report => ({
    browserName: browserKey(report),
    projectName: report.projectName,
    viewport: report.viewport,
    session: report.session,
    routes: (report.routes || []).map(route => ({
      route: route.route,
      status: route.status,
      url: route.url,
      routeState: route.routeState,
      missingMarkers: route.missingMarkers,
      fieldMismatches: route.fieldMismatches,
      baseline: route.baseline,
      screenshotPath: route.screenshotPath,
    })),
    interactions: report.interactions || [],
  }))

  const screenshots = reports.flatMap(report => [
    ...(report.routes || []).map(route => route.screenshotPath).filter(Boolean),
    ...(report.interactions || []).map(interaction => interaction.screenshotPath).filter(Boolean),
  ])

  const output = {
    generatedAt: new Date().toISOString(),
    classification: classify(differences),
    browserMatrix,
    layoutFacts: reports.flatMap(report => (report.routes || []).map(route => ({
      browserName: browserKey(report),
      route: route.route,
      scrollOverflowX: route.scrollOverflowX,
      textCollisionCount: route.textCollisionCount,
      clippedElementCount: route.clippedElementCount,
      clippedElementCountAdvisory: true,
      boxes: route.boxes,
    }))),
    differences,
    screenshots,
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2))
  if (differences.some(diff => diff.severity === CRITICAL)) {
    console.error(`Browser matrix found ${differences.length} critical difference(s). See ${path.relative(process.cwd(), OUT_PATH)}`)
    process.exit(1)
  }
  console.log(`Browser matrix passed. See ${path.relative(process.cwd(), OUT_PATH)}`)
}

main()
