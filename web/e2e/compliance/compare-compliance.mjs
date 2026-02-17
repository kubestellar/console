import fs from 'fs'
import path from 'path'

const root = process.cwd()
const reportPath = process.env.COMPLIANCE_REPORT_PATH || path.join(root, 'e2e', 'test-results', 'compliance-report.json')
const baselinePath = process.env.COMPLIANCE_BASELINE_PATH || path.join(root, 'e2e', 'compliance', 'baseline', 'compliance-baseline.json')
const outputPath = process.env.COMPLIANCE_SUMMARY_PATH || path.join(root, 'e2e', 'test-results', 'compliance-regression.md')

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

if (!fs.existsSync(reportPath)) fail(`Compliance report not found: ${reportPath}`)
if (!fs.existsSync(baselinePath)) fail(`Compliance baseline not found: ${baselinePath}`)

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))

const allCards = (report.batches || []).flatMap((b) => b.cards || [])
if (allCards.length === 0) fail('Compliance report has no card results')

const failures = []
const lines = [
  '# UI Compliance Regression Check',
  '',
  `Report: \`${path.relative(root, reportPath)}\``,
  `Baseline: \`${path.relative(root, baselinePath)}\``,
  `Cards tested: ${allCards.length}`,
  '',
]

// Check per-criterion minimum pass rates
const rates = report.summary?.criterionPassRates || {}
const minRates = baseline.min_pass_rates || {}

for (const [criterion, minRate] of Object.entries(minRates)) {
  const actual = rates[criterion]
  if (actual === undefined) continue
  if (actual < minRate) {
    failures.push(
      `Criterion ${criterion}: pass rate ${Math.round(actual * 100)}% < minimum ${Math.round(minRate * 100)}%`
    )
  }
  lines.push(`- Criterion ${criterion}: ${Math.round(actual * 100)}% (min: ${Math.round(minRate * 100)}%)`)
}

lines.push('')

// Check max failure count
const failCount = report.summary?.failCount || 0
const maxFails = baseline.max_fail_count || 20
if (failCount > maxFails) {
  failures.push(`Total failures ${failCount} > maximum ${maxFails}`)
}
lines.push(`Total failures: ${failCount} (max: ${maxFails})`)
lines.push('')

// Check zero-tolerance cards
const zeroTolerance = baseline.zero_tolerance_cards || []
if (zeroTolerance.length > 0) {
  lines.push('## Zero-Tolerance Cards')
  for (const cardType of zeroTolerance) {
    const card = allCards.find((c) => c.cardType === cardType)
    if (!card) {
      lines.push(`- ${cardType}: NOT FOUND`)
      continue
    }
    if (card.overallStatus === 'fail') {
      const failedCriteria = Object.entries(card.criteria)
        .filter(([, r]) => r.status === 'fail')
        .map(([key]) => key)
      failures.push(`Zero-tolerance card ${cardType} failed criteria: ${failedCriteria.join(', ')}`)
      lines.push(`- ${cardType}: FAIL (${failedCriteria.join(', ')})`)
    } else {
      lines.push(`- ${cardType}: ${card.overallStatus.toUpperCase()}`)
    }
  }
  lines.push('')
}

// Failures section
if (failures.length > 0) {
  lines.push('## Regressions')
  for (const f of failures.slice(0, 100)) lines.push(`- ${f}`)
  lines.push('')
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`)

if (failures.length > 0) {
  console.error(lines.join('\n'))
  process.exit(1)
}

console.log(lines.join('\n'))
