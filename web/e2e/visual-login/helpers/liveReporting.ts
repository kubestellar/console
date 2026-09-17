import { type Page, type TestInfo } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { safeJsonStringify } from '../../../harness/evidence/sanitizeEvidence'
import type { LiveUiFailureEvidence } from '../../../harness/evidence/evidenceTypes'

export type LiveNetworkClassification = {
  classification: string
  method?: string
  status?: number
  url: string
}

export async function recordLiveUiFailures(page: Page, failures: LiveUiFailureEvidence) {
  await page.evaluate((nextFailures) => {
    const target = window as unknown as { __KC_LIVE_UI_FAILURES__?: LiveUiFailureEvidence }
    const current = target.__KC_LIVE_UI_FAILURES__ || {}
    const merged = { ...current } as Record<string, unknown>
    for (const [key, value] of Object.entries(nextFailures)) {
      if (Array.isArray(value)) {
        const existing = Array.isArray(merged[key]) ? merged[key] as unknown[] : []
        merged[key] = [...existing, ...value]
      } else if (value !== undefined) {
        merged[key] = value
      }
    }
    target.__KC_LIVE_UI_FAILURES__ = merged as LiveUiFailureEvidence
  }, failures).catch(() => undefined)
}

export function writeLiveSiteReport(entry: Record<string, unknown>) {
  const outDir = path.resolve(process.cwd(), 'test-results/reports')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'live-site.json')
  const existing = readJsonArrayFile<Record<string, unknown>>(outPath)
  existing.push({ timestamp: new Date().toISOString(), ...entry })
  fs.writeFileSync(outPath, safeJsonStringify(existing))
}

export function writeLiveRouteEvidence(entry: Record<string, unknown>) {
  const outDir = path.resolve(process.cwd(), 'test-results/reports')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'live-routes.json')
  const existing = readJsonArrayFile<Record<string, unknown>>(outPath)
  existing.push({ timestamp: new Date().toISOString(), ...entry })
  fs.writeFileSync(outPath, safeJsonStringify(existing))
}

function readJsonArrayFile<T>(filePath: string): T[] {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T[]
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error
}

function liveRateLimitDataLossPath() {
  const outDir = process.env.RUNNER_TEMP
    ? path.resolve(process.env.RUNNER_TEMP, 'console-live')
    : path.resolve(process.cwd(), 'test-results/reports')
  fs.mkdirSync(outDir, { recursive: true })
  return path.join(outDir, 'live-rate-limit-data-loss.json')
}

export function markLiveRateLimitDataLoss(route: string, classifications: LiveNetworkClassification[]) {
  const details = {
    timestamp: new Date().toISOString(),
    runId: process.env.GITHUB_RUN_ID || null,
    route,
    classifications,
  }
  fs.writeFileSync(liveRateLimitDataLossPath(), safeJsonStringify(details))
}

export function liveRateLimitDataLossSkipReason(): string | null {
  const markerPath = liveRateLimitDataLossPath()
  try {
    const details = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as { route?: string; classifications?: LiveNetworkClassification[] }
    const endpoints = (details.classifications || [])
      .map(item => `${item.url}${item.status ? ` (${item.status})` : ''}`)
      .join(', ')
    return `Skipping after core live Kubernetes API rate limit on ${details.route || 'an earlier route'}${endpoints ? `: ${endpoints}` : ''}.`
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return null
    }
    return 'Skipping after an earlier core live Kubernetes API rate-limit event.'
  }
}

export function annotateLiveInvariant(testInfo: TestInfo, id: string) {
  testInfo.annotations.push({ type: 'invariant', description: id })
}
