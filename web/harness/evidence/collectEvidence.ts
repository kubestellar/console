import fs from 'node:fs'
import path from 'node:path'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { safeJsonStringify, sanitizeJson, sanitizeText } from './sanitizeEvidence'
import type {
  BoundingBoxEvidence,
  EvidenceCollectors,
  LiveUiFailureEvidence,
  NetworkEvidenceEntry,
  RateLimitEvidenceEntry,
  VisualLoginEvidence,
} from './evidenceTypes'

const MAX_DOM_TEXT_LENGTH = 6_000

export function safeArtifactName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'visual-login-test'
}

export function installEvidenceCollectors(page: Page): EvidenceCollectors {
  const collectors: EvidenceCollectors = {
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    failedRequests: [],
    errorResponses: [],
    requestCountsByEndpoint: {},
    rateLimitEvents: [],
  }

  page.on('console', (message) => {
    const entry = {
      type: message.type(),
      text: sanitizeText(message.text()),
      location: sanitizeText(`${message.location().url}:${message.location().lineNumber}`),
    }
    if (message.type() === 'error') collectors.consoleErrors.push(entry)
    if (message.type() === 'warning') collectors.consoleWarnings.push(entry)
  })

  page.on('pageerror', error => {
    collectors.pageErrors.push(sanitizeText(error.stack || error.message))
  })

  const endpointKey = (method: string, rawUrl: string): string => {
    try {
      const url = new URL(rawUrl)
      return `${method} ${url.pathname}`
    } catch {
      return `${method} ${rawUrl.replace(/\?.*$/, '')}`
    }
  }

  page.on('request', request => {
    const key = endpointKey(request.method(), request.url())
    collectors.requestCountsByEndpoint[key] = (collectors.requestCountsByEndpoint[key] || 0) + 1
  })

  page.on('requestfailed', request => {
    collectors.failedRequests.push({
      url: sanitizeText(request.url()),
      method: request.method(),
      failureText: sanitizeText(request.failure()?.errorText || 'request failed'),
    })
  })

  page.on('response', response => {
    if (response.status() >= 400) {
      const entry = {
        url: sanitizeText(response.url()),
        method: response.request().method(),
        status: response.status(),
      }
      collectors.errorResponses.push(entry)
      if (response.status() === 429) {
        const headers = response.headers()
        const rateLimitEntry: RateLimitEvidenceEntry = {
          ...entry,
          retryAfter: sanitizeText(headers['retry-after'] || ''),
        }
        collectors.rateLimitEvents.push(rateLimitEntry)
      }
    }
  })

  return collectors
}

async function selectedDomSnippet(page: Page): Promise<string | undefined> {
  return page.evaluate((maxLength) => {
    const root =
      document.querySelector('main')
      || document.querySelector('[data-testid*="dashboard"]')
      || document.querySelector('[data-testid="login-page"]')
      || document.body
    const text = root?.textContent?.replace(/\s+/g, ' ').trim() || ''
    return text.slice(0, maxLength)
  }, MAX_DOM_TEXT_LENGTH).then(sanitizeText).catch(() => undefined)
}

async function collectLiveUiFailures(page: Page, collectors: EvidenceCollectors): Promise<LiveUiFailureEvidence | undefined> {
  const pageFailures = await page.evaluate(() => {
    return (window as unknown as { __KC_LIVE_UI_FAILURES__?: LiveUiFailureEvidence }).__KC_LIVE_UI_FAILURES__
  }).catch(() => undefined)
  const merged: LiveUiFailureEvidence = {}
  for (const failures of [pageFailures, collectors.liveUiFailures]) {
    if (!failures) continue
    for (const [key, value] of Object.entries(failures) as Array<[keyof LiveUiFailureEvidence, unknown]>) {
      if (Array.isArray(value)) {
        const existing = Array.isArray(merged[key]) ? merged[key] as unknown[] : []
        merged[key] = [...existing, ...value] as never
      }
    }
  }
  const hasFailures = Object.values(merged).some(value => Array.isArray(value) && value.length > 0)
  return hasFailures ? merged : undefined
}

async function collectBoundingBoxes(items: Array<{ label: string; locator: Locator }>): Promise<BoundingBoxEvidence[]> {
  const boxes: BoundingBoxEvidence[] = []
  for (const item of items) {
    const box = await item.locator.first().boundingBox().catch(() => null)
    if (!box) continue
    boxes.push({ label: item.label, ...box })
  }
  return boxes
}

export async function collectEvidence(options: {
  page: Page
  testInfo: TestInfo
  invariantIds: string[]
  collectors: EvidenceCollectors
  appMode: string
  boundingBoxes?: Array<{ label: string; locator: Locator }>
}): Promise<{ evidence: VisualLoginEvidence; evidencePath: string }> {
  const { page, testInfo, invariantIds, collectors, appMode } = options
  const dir = path.resolve(
    process.cwd(),
    'test-results/evidence',
    safeArtifactName(testInfo.titlePath.join(' ')),
  )
  fs.mkdirSync(dir, { recursive: true })

  let screenshotPath: string | undefined
  if (testInfo.status !== testInfo.expectedStatus) {
    screenshotPath = path.join(dir, 'failure-screenshot.png')
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined)
  }

  const evidence: VisualLoginEvidence = sanitizeJson({
    testTitle: testInfo.title,
    invariantIds,
    status: testInfo.status || 'interrupted',
    url: page.url(),
    viewport: page.viewportSize(),
    browserProject: testInfo.project.name,
    appMode,
    timestamp: new Date().toISOString(),
    screenshotPath,
    console: {
      errors: collectors.consoleErrors,
      warnings: collectors.consoleWarnings,
      pageErrors: collectors.pageErrors,
    },
    network: {
      failed: collectors.failedRequests,
      errorResponses: collectors.errorResponses,
      requestCountsByEndpoint: collectors.requestCountsByEndpoint,
      rateLimitEvents: collectors.rateLimitEvents,
    },
    domSnippet: await selectedDomSnippet(page),
    boundingBoxes: options.boundingBoxes ? await collectBoundingBoxes(options.boundingBoxes) : undefined,
    liveUiFailures: await collectLiveUiFailures(page, collectors),
  })

  const evidencePath = path.join(dir, 'evidence.json')
  fs.writeFileSync(evidencePath, safeJsonStringify(evidence))
  return { evidence, evidencePath }
}

export function summarizeNetworkEntry(entry: NetworkEvidenceEntry): string {
  const status = entry.status ? ` ${entry.status}` : ''
  const failure = entry.failureText ? ` ${entry.failureText}` : ''
  return `${entry.method}${status} ${entry.url}${failure}`
}
