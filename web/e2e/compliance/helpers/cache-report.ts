import { type Route } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { type CacheComplianceReport, EMPTY_SSE_BODY } from '../cache-constants'

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

export function writeReport(report: CacheComplianceReport, outDir: string) {
  fs.mkdirSync(outDir, { recursive: true })

  // JSON report
  fs.writeFileSync(path.join(outDir, 'cache-compliance-report.json'), JSON.stringify(report, null, 2))

  // Markdown summary
  const allCards = report.batches.flatMap((b) => b.cards)
  const md: string[] = [
    '# Card Cache Compliance Report',
    '',
    `Generated: ${report.timestamp}`,
    `Total cards tested: ${report.totalCards}`,
    '',
    '## Cache Snapshot After Cold Load',
    '',
    `- IndexedDB entries: ${report.cacheSnapshot.indexedDBEntries}`,
    `- localStorage cache-related keys: ${report.cacheSnapshot.localStorageCacheKeys}`,
    '',
  ]

  if (report.cacheSnapshot.cacheEntries.length > 0) {
    md.push('### IndexedDB Cache Entries', '', '| Key | Version | Data Size | Type | Array Length |', '|-----|---------|-----------|------|-------------|')
    for (const entry of report.cacheSnapshot.cacheEntries) {
      md.push(`| ${entry.key} | ${entry.version} | ${entry.dataSize} | ${entry.dataType} | ${entry.arrayLength ?? 'N/A'} |`)
    }
    md.push('')
  }

  // Summary stats
  md.push(
    '## Summary',
    '',
    `- **Pass**: ${report.summary.passCount} cards — cached data loaded on warm return without network`,
    `- **Fail**: ${report.summary.failCount} cards — no cached data on warm return`,
    `- **Warn**: ${report.summary.warnCount} cards — partial cache behavior`,
    `- **Skip**: ${report.summary.skipCount} cards — no content on cold load (demo-only or game cards)`,
    `- **Cache hit rate**: ${Math.round(report.summary.cacheHitRate * 100)}%`,
    `- **Avg warm time-to-content**: ${report.summary.avgWarmTimeToContentMs !== null ? `${Math.round(report.summary.avgWarmTimeToContentMs)}ms` : 'N/A'}`,
    '',
  )

  // Pass/fail table
  md.push('## Per-Card Results', '', '| Card Type | Cold Content | Warm Content | Demo Badge | Skeleton | Time-to-Content | Status | Details |', '|-----------|-------------|-------------|------------|----------|-----------------|--------|---------|')
  for (const card of allCards) {
    md.push(
      `| ${card.cardType} | ${card.coldLoadHadContent ? 'Yes' : 'No'} | ${card.warmReturnHadContent ? 'Yes' : 'No'} | ${card.warmDemoBadge ? 'YES' : 'No'} | ${card.warmSkeleton ? 'YES' : 'No'} | ${card.warmTimeToContentMs !== null ? `${Math.round(card.warmTimeToContentMs)}ms` : 'N/A'} | ${card.status} | ${card.details} |`
    )
  }

  // Failures section
  const failedCards = allCards.filter((c) => c.status === 'fail')
  if (failedCards.length > 0) {
    md.push('', '## Failures', '')
    for (const card of failedCards) {
      md.push(`- **${card.cardType}**: ${card.details}`)
    }
  }

  md.push('')
  fs.writeFileSync(path.join(outDir, 'cache-compliance-summary.md'), md.join('\n') + '\n')
}

export function fulfillSkippedRoute(route: Route) {
  const acceptHeader = route.request().headers().accept || ''
  const isStreamRequest = route.request().url().includes('/stream') || acceptHeader.includes('text/event-stream')

  return route.fulfill({
    status: 200,
    contentType: isStreamRequest ? 'text/event-stream' : 'application/json',
    body: isStreamRequest ? EMPTY_SSE_BODY : '{}',
  })
}
