/**
 * Standalone Mission Scanner
 *
 * Self-contained module for scanning mission files outside the React app.
 * Designed to be copied to console-kb for CI use (GitHub Actions, PR checks).
 *
 * Usage:
 *   import { scanMissionFile, formatScanResultAsMarkdown } from './standalone'
 *   const result = scanMissionFile(fs.readFileSync('mission.json', 'utf-8'))
 *   console.log(formatScanResultAsMarkdown('mission.json', result))
 */

import { fullScan } from './index'
import type { FileScanResult } from '../types'
import { validateMissionExport } from '../types'

/**
 * Parse a JSON string as a mission file, validate its schema, and run a full scan.
 * Returns a FileScanResult with all findings (errors, warnings, info).
 */
export function scanMissionFile(jsonContent: string): FileScanResult {
  let parsed: unknown

  try {
    parsed = JSON.parse(jsonContent)
  } catch (err) {
    return {
      valid: false,
      findings: [
        {
          severity: 'error',
          code: 'PARSE_ERROR',
          message: `Invalid JSON: ${err instanceof Error ? err.message : 'unknown parse error'}`,
          path: '',
        },
      ],
      metadata: null,
    }
  }

  const validation = validateMissionExport(parsed)
  if (!validation.valid) {
    return {
      valid: false,
      findings: validation.errors.map((e) => ({
        severity: 'error' as const,
        code: 'SCHEMA_VALIDATION',
        message: e.message,
        path: e.path ?? '',
      })),
      metadata: null,
    }
  }

  return fullScan(validation.data)
}

/**
 * Format scan results as a markdown table suitable for PR comments.
 *
 * Output example:
 * ## 🔍 Mission Scan: my-mission.json
 * | Severity | Code | Message | Path |
 * |----------|------|---------|------|
 * | ❌ error | MISSING_FIELD | ... | .steps[0] |
 */
export function formatScanResultAsMarkdown(
  filename: string,
  result: FileScanResult
): string {
  const icon = result.valid ? '✅' : '❌'
  const status = result.valid ? 'Passed' : 'Failed'
  const lines: string[] = []

  lines.push(`## 🔍 Mission Scan: ${filename}`)
  lines.push('')
  lines.push(`**Status:** ${icon} ${status}`)

  if (result.metadata) {
    const m = result.metadata
    const parts: string[] = []
    if (m.title) parts.push(`**Title:** ${m.title}`)
    if (m.type) parts.push(`**Type:** ${m.type}`)
    if (m.version) parts.push(`**Version:** ${m.version}`)
    if (parts.length > 0) {
      lines.push(`**Metadata:** ${parts.join(' · ')}`)
    }
  }

  lines.push('')

  if (result.findings.length === 0) {
    lines.push('No issues found. 🎉')
    return lines.join('\n')
  }

  const severityIcon: Record<string, string> = {
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  }

  lines.push(`| Severity | Code | Message | Path |`)
  lines.push(`|----------|------|---------|------|`)

  for (const f of result.findings) {
    const sev = `${severityIcon[f.severity] ?? ''} ${f.severity}`
    const msg = f.message.replace(/\|/g, '\\|')
    const path = (f.path || '—').replace(/\|/g, '\\|')
    lines.push(`| ${sev} | \`${f.code}\` | ${msg} | \`${path}\` |`)
  }

  lines.push('')

  const errorCount = result.findings.filter((f) => f.severity === 'error').length
  const warnCount = result.findings.filter((f) => f.severity === 'warning').length
  const infoCount = result.findings.filter((f) => f.severity === 'info').length
  const summaryParts: string[] = []
  if (errorCount > 0) summaryParts.push(`${errorCount} error(s)`)
  if (warnCount > 0) summaryParts.push(`${warnCount} warning(s)`)
  if (infoCount > 0) summaryParts.push(`${infoCount} info`)

  lines.push(`**Summary:** ${summaryParts.join(', ')}`)

  return lines.join('\n')
}
