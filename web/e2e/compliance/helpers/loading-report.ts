import * as fs from 'fs'
import * as path from 'path'
import {
  GAP_SKIP_RATE_THRESHOLD,
  GAP_SKIP_RATE_HIGH_PRIORITY,
  GAP_DEMO_BADGE_MIN_FAIL_COUNT,
  GAP_DEMO_BADGE_SAMPLE_LIMIT,
  GAP_SSE_ADOPTION_THRESHOLD,
  type ComplianceReport,
  type GapAnalysisEntry,
} from '../loading-constants'

// ---------------------------------------------------------------------------
// Gap analysis — self-evaluating section for continuous improvement
// ---------------------------------------------------------------------------

export function generateGapAnalysis(report: ComplianceReport): GapAnalysisEntry[] {
  const gaps: GapAnalysisEntry[] = []
  const rates = report.summary.criterionPassRates

  // Check for criteria with high skip rates (not enough coverage)
  const allCards = report.batches.flatMap((b) => b.cards)
  for (const criterion of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']) {
    const results = allCards.map((c) => c.criteria[criterion]).filter(Boolean)
    const skipCount = results.filter((r) => r.status === 'skip').length
    const skipRate = results.length > 0 ? skipCount / results.length : 0

    if (skipRate > GAP_SKIP_RATE_THRESHOLD) {
      gaps.push({
        area: `Criterion ${criterion} coverage`,
        observation: `${Math.round(skipRate * 100)}% of cards skipped criterion ${criterion}`,
        suggestedImprovement:
          criterion === 'e'
            ? 'Consider triggering a manual refresh via button click to test incremental refresh, rather than waiting for auto-refresh timer'
            : `Review test timing — the polling window may be too short to capture the loading→content transition for criterion ${criterion}`,
        priority: skipRate > GAP_SKIP_RATE_HIGH_PRIORITY ? 'high' : 'medium',
      })
    }
  }

  // Check for initial demo flash failures (criterion i)
  const demoFlashFails = allCards.filter((c) => c.criteria.i?.status === 'fail')
  if (demoFlashFails.length > 0) {
    const failedTypes = demoFlashFails.map((c) => c.cardType)
    const uniqueTypes = [...new Set(failedTypes)]
    gaps.push({
      area: 'Initial demo data as initialData',
      observation: `${uniqueTypes.length} card types use demo data as useCache initialData: ${uniqueTypes.join(', ')}`,
      suggestedImprovement:
        'Change initialData from demo data to empty (e.g., [] or { items: [], isDemo: false }). Demo data should only be in the demoData prop. Cards with demo initialData skip the skeleton phase and flash demo badges on cold start.',
      priority: 'high',
    })
  }

  // Check if demo badge failures cluster around specific card types
  const failedCards = allCards.filter((c) => c.criteria.a?.status === 'fail')
  if (failedCards.length > GAP_DEMO_BADGE_MIN_FAIL_COUNT) {
    const failedTypes = failedCards.map((c) => c.cardType)
    const uniqueTypes = [...new Set(failedTypes)]
    gaps.push({
      area: 'Demo badge contamination',
      observation: `${uniqueTypes.length} card types show demo badges during skeleton: ${uniqueTypes.slice(0, GAP_DEMO_BADGE_SAMPLE_LIMIT).join(', ')}${uniqueTypes.length > GAP_DEMO_BADGE_SAMPLE_LIMIT ? '...' : ''}`,
      suggestedImprovement:
        'Investigate whether these cards report isDemoData=true during initial load. The showDemoIndicator logic in CardWrapper may need a loading-phase exemption.',
      priority: 'high',
    })
  }

  // Check warm return issues — caching gaps
  const warmFailCards = allCards.filter((c) => c.criteria.g?.status === 'fail')
  if (warmFailCards.length > 0) {
    gaps.push({
      area: 'Cache miss on warm return',
      observation: `${warmFailCards.length} cards showed skeleton on warm return instead of cached data`,
      suggestedImprovement:
        'Check if these cards use useCachedData correctly. Cards may be clearing cache on unmount or using non-cacheable data sources.',
      priority: 'high',
    })
  }

  // Check criterion C (SSE) — many warns suggest cards arent using SSE
  if (rates.c !== undefined && rates.c < GAP_SSE_ADOPTION_THRESHOLD) {
    gaps.push({
      area: 'SSE streaming adoption',
      observation: `Only ${Math.round(rates.c * 100)}% of cards use SSE streaming — most use REST only`,
      suggestedImprovement:
        'Consider whether criterion C should be split: REST cards vs SSE cards, each with their own compliance path. REST cards should still validate incremental loading.',
      priority: 'low',
    })
  }

  // Meta: suggest adding new criteria based on observed patterns
  gaps.push({
    area: 'Future criteria candidates',
    observation: 'The current 8 criteria cover core loading behavior but may miss edge cases',
    suggestedImprovement:
      'Consider adding: (i) error-state compliance — cards showing errors should not show demo badges; (j) responsive sizing — cards should not overflow their container during loading; (k) accessibility — skeleton states should have appropriate ARIA attributes.',
    priority: 'low',
  })

  return gaps
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

export function writeReport(report: ComplianceReport, outDir: string) {
  fs.mkdirSync(outDir, { recursive: true })

  // JSON report
  fs.writeFileSync(path.join(outDir, 'compliance-report.json'), JSON.stringify(report, null, 2))

  // Markdown summary
  const allCards = report.batches.flatMap((b) => b.cards)
  const md: string[] = [
    '# Card Loading Compliance Report',
    '',
    `Generated: ${report.timestamp}`,
    `Total cards tested: ${report.totalCards}`,
    '',
    '## Criterion Pass Rates',
    '',
    '| Criterion | Description | Pass Rate | Pass | Fail | Warn | Skip |',
    '|-----------|-------------|-----------|------|------|------|------|',
  ]

  const criterionDescriptions: Record<string, string> = {
    a: 'Skeleton without demo badge during loading',
    b: 'Refresh icon spins during loading',
    c: 'Data loads via SSE streaming',
    d: 'Skeleton replaced by data content',
    e: 'Refresh icon animated during incremental load',
    f: 'Data cached persistently as it loads',
    g: 'Cached data loads immediately on return',
    h: 'Cached data updated without skeleton regression',
    i: 'No demo data flash on cold start',
  }

  for (const criterion of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']) {
    const results = allCards.map((c) => c.criteria[criterion]).filter(Boolean)
    const pass = results.filter((r) => r.status === 'pass').length
    const fail = results.filter((r) => r.status === 'fail').length
    const warn = results.filter((r) => r.status === 'warn').length
    const skip = results.filter((r) => r.status === 'skip').length
    const rate = report.summary.criterionPassRates[criterion]
    const pct = rate !== undefined ? `${Math.round(rate * 100)}%` : 'N/A'

    md.push(
      `| ${criterion} | ${criterionDescriptions[criterion] || ''} | ${pct} | ${pass} | ${fail} | ${warn} | ${skip} |`
    )
  }

  // Failures section
  const failedCards = allCards.filter((c) => c.overallStatus === 'fail')
  if (failedCards.length > 0) {
    md.push('', '## Failures', '', '| Card Type | Failed Criteria | Details |', '|-----------|----------------|---------|')
    for (const card of failedCards) {
      const failedCriteria = Object.entries(card.criteria)
        .filter(([, r]) => r.status === 'fail')
        .map(([key, r]) => `${key}: ${r.details}`)
      md.push(`| ${card.cardType} | ${failedCriteria.map((f) => f.split(':')[0]).join(', ')} | ${failedCriteria.join('; ')} |`)
    }
  }

  // Summary
  md.push(
    '',
    '## Summary',
    '',
    `- **Pass**: ${report.summary.passCount}`,
    `- **Fail**: ${report.summary.failCount}`,
    `- **Warn**: ${report.summary.warnCount}`,
    `- **Skip**: ${report.summary.skipCount}`,
  )

  // Gap analysis section
  if (report.gapAnalysis.length > 0) {
    md.push(
      '',
      '## Gap Analysis & Improvement Opportunities',
      '',
      'The following gaps were identified during this compliance run. Use these to improve both the test suite and the UI:',
      '',
    )
    for (const gap of report.gapAnalysis) {
      md.push(
        `### [${gap.priority.toUpperCase()}] ${gap.area}`,
        '',
        `**Observation:** ${gap.observation}`,
        '',
        `**Suggested improvement:** ${gap.suggestedImprovement}`,
        '',
      )
    }
  }

  fs.writeFileSync(path.join(outDir, 'compliance-summary.md'), md.join('\n') + '\n')
}
