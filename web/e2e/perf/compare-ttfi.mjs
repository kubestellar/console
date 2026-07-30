import fs from 'fs'
import path from 'path'

const root = process.cwd()
const reportPath = process.env.TTFI_REPORT_PATH || path.join(root, 'e2e', 'test-results', 'ttfi-report.json')
const baselinePath = process.env.TTFI_BASELINE_PATH || path.join(root, 'e2e', 'perf', 'baseline', 'ttfi-baseline.json')
const outputPath = process.env.TTFI_SUMMARY_PATH || path.join(root, 'e2e', 'test-results', 'ttfi-regression.md')

/** Percentage tolerance for CI runner variance (shared runners are noisy).
 *  Set via CI_TOLERANCE_PCT env var. Budgets are multiplied by (1 + pct/100). */
const CI_TOLERANCE_PCT = Number(process.env.CI_TOLERANCE_PCT || '0')
const toleranceFactor = 1 + CI_TOLERANCE_PCT / 100

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

if (!fs.existsSync(reportPath)) fail(`TTFI report not found: ${reportPath}`)
if (!fs.existsSync(baselinePath)) fail(`TTFI baseline not found: ${baselinePath}`)

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))

const cards = Array.isArray(report.cards) ? report.cards : []
if (cards.length === 0) fail('TTFI report has no card metrics')

const modes = ['live-cold', 'live-warm', 'demo-cold', 'demo-warm']
const failures = []
const lines = [
  '# TTFI Regression Check',
  '',
  `Report: \`${path.relative(root, reportPath)}\``,
  `Baseline: \`${path.relative(root, baselinePath)}\``,
  '',
]

function percentile(values, pct) {
  if (!values.length) return -1
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * pct) - 1)]
}

for (const mode of modes) {
  const modeCards = cards.filter((c) => c.mode === mode)
  if (modeCards.length === 0) continue // mode was skipped (e.g. live modes in CI)
  const budget = baseline.budgets?.[mode]
  if (!budget) {
    failures.push(`Missing budget for mode ${mode}`)
    continue
  }

  const okCards = modeCards.filter((c) => c.status === 'ok')
  const timeoutCards = modeCards.filter((c) => c.status === 'timeout')
  const values = okCards.map((c) => c.ttfi_ms)
  const avg = values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : -1
  const p95 = percentile(values, 0.95)

  const effectiveP95 = Math.round(budget.max_p95_ms * toleranceFactor)
  const effectiveTtfi = Math.round(budget.max_ttfi_ms * toleranceFactor)

  if (timeoutCards.length > budget.max_timeout_count) {
    failures.push(`${mode}: timeout count ${timeoutCards.length} > budget ${budget.max_timeout_count}`)
  }
  if (p95 > effectiveP95) {
    failures.push(`${mode}: p95 ${p95}ms > budget ${effectiveP95}ms${CI_TOLERANCE_PCT ? ` (base ${budget.max_p95_ms}ms + ${CI_TOLERANCE_PCT}% CI tolerance)` : ''}`)
  }

  for (const card of okCards) {
    if (card.ttfi_ms > effectiveTtfi) {
      failures.push(`${mode}:${card.cardType} ttfi ${card.ttfi_ms}ms > max ${effectiveTtfi}ms${CI_TOLERANCE_PCT ? ` (base ${budget.max_ttfi_ms}ms + ${CI_TOLERANCE_PCT}% CI tolerance)` : ''}`)
    }
  }

  lines.push(`## ${mode}`)
  lines.push(`- cards: ${modeCards.length}`)
  lines.push(`- ok: ${okCards.length}`)
  lines.push(`- timeout: ${timeoutCards.length}`)
  lines.push(`- avg: ${avg}ms`)
  lines.push(`- p95: ${p95}ms`)
  lines.push('')
}

if (failures.length > 0) {
  lines.push('## Failures')
  for (const f of failures.slice(0, 200)) lines.push(`- ${f}`)
  lines.push('')
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`)

if (failures.length > 0) {
  console.error(lines.join('\n'))
  process.exit(1)
}

console.log(lines.join('\n'))
