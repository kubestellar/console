/**
 * UX Findings Reporter — custom Playwright reporter that collects
 * ux-finding annotations from test results and generates a markdown
 * report at test-results/ux-findings-report.md.
 *
 * Tests attach findings via:
 *   test.info().annotations.push({
 *     type: 'ux-finding',
 *     description: JSON.stringify({ severity, category, component, finding, recommendation })
 *   })
 */

import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter'
import * as fs from 'fs'
import * as path from 'path'

interface UXFinding {
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: 'visual' | 'interaction' | 'a11y' | 'performance' | 'responsive'
  component: string
  finding: string
  recommendation: string
  testTitle: string
  testFile: string
  screenshot?: string
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'] as const
const SEVERITY_EMOJI: Record<string, string> = {
  critical: 'C',
  high: 'H',
  medium: 'M',
  low: 'L',
}

class UXReporter implements Reporter {
  private findings: UXFinding[] = []
  private outputDir = ''

  onBegin(_config: FullConfig, _suite: Suite) {
    this.outputDir = _config.rootDir
      ? path.join(_config.rootDir, 'test-results')
      : 'test-results'
  }

  onTestEnd(test: TestCase, result: TestResult) {
    for (const annotation of result.annotations) {
      if (annotation.type !== 'ux-finding' || !annotation.description) continue
      try {
        const data = JSON.parse(annotation.description)
        this.findings.push({
          severity: data.severity || 'medium',
          category: data.category || 'interaction',
          component: data.component || 'Unknown',
          finding: data.finding || '',
          recommendation: data.recommendation || '',
          testTitle: test.title,
          testFile: test.location.file,
          screenshot: data.screenshot,
        })
      } catch {
        // Malformed annotation — skip
      }
    }
  }

  onEnd(_result: FullResult) {
    if (this.findings.length === 0) return

    // Sort by severity
    this.findings.sort((a, b) => {
      return SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
    })

    // Count by severity and category
    const bySeverity: Record<string, number> = {}
    const byCategory: Record<string, number> = {}
    for (const f of this.findings) {
      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1
      byCategory[f.category] = (byCategory[f.category] || 0) + 1
    }

    const lines: string[] = []
    const date = new Date().toISOString().split('T')[0]
    lines.push(`# UX Findings Report — ${date}`)
    lines.push('')
    lines.push('## Summary')
    lines.push(
      `- ${SEVERITY_ORDER.map((s) => `${s[0].toUpperCase() + s.slice(1)}: ${bySeverity[s] || 0}`).join(' | ')}`,
    )
    lines.push(
      `- Categories: ${Object.entries(byCategory).map(([k, v]) => `${k} (${v})`).join(', ')}`,
    )
    lines.push('')

    // Group by severity
    for (const severity of SEVERITY_ORDER) {
      const group = this.findings.filter((f) => f.severity === severity)
      if (group.length === 0) continue

      lines.push(`## ${severity[0].toUpperCase() + severity.slice(1)} Findings`)
      lines.push('')

      for (let i = 0; i < group.length; i++) {
        const f = group[i]
        const id = `${SEVERITY_EMOJI[severity]}-${String(i + 1).padStart(3, '0')}`
        lines.push(`### [${id}] ${f.finding}`)
        lines.push(`- **Component**: ${f.component}`)
        lines.push(`- **Category**: ${f.category}`)
        lines.push(`- **Test**: ${f.testTitle}`)
        lines.push(`- **File**: ${f.testFile}`)
        if (f.screenshot) lines.push(`- **Evidence**: [screenshot](${f.screenshot})`)
        if (f.recommendation) lines.push(`- **Recommendation**: ${f.recommendation}`)
        lines.push('')
      }
    }

    // Write report
    fs.mkdirSync(this.outputDir, { recursive: true })
    const reportPath = path.join(this.outputDir, 'ux-findings-report.md')
    fs.writeFileSync(reportPath, lines.join('\n'))
  }
}

export default UXReporter
