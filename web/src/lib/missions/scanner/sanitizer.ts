/**
 * Mission Sanitizer
 *
 * Sanitizes MissionExport objects by replacing sensitive data with
 * consistent redaction tokens.
 */

import type { MissionExport } from '../types'
import type { SensitiveFinding } from './sensitive'

export interface SanitizationResult {
  mission: MissionExport & {
    security: { sanitized: boolean; redactedAt: string }
  }
  replacements: Record<string, string>
  replacementCount: number
}

export interface SanitizationPreviewItem {
  location: string
  original: string
  sanitized: string
}

const TYPE_LABELS: Record<string, string> = {
  ipv4: 'IP',
  ipv6: 'IP',
  hostname: 'HOST',
  jwt: 'SECRET',
  'bearer-token': 'SECRET',
  'github-pat': 'SECRET',
  'aws-key': 'SECRET',
  email: 'EMAIL',
  'pem-cert': 'SECRET',
  'ssh-key': 'SECRET',
  'k8s-secret': 'SECRET',
}

function buildReplacementMap(
  findings: SensitiveFinding[]
): Record<string, string> {
  const map: Record<string, string> = {}
  const counters: Record<string, number> = {}

  for (const finding of findings) {
    if (map[finding.match]) continue
    const label = TYPE_LABELS[finding.type] || 'REDACTED'
    const count = (counters[label] || 0) + 1
    counters[label] = count
    map[finding.match] = `<REDACTED-${label}-${count}>`
  }

  return map
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

function applyReplacements(
  text: string,
  replacements: Record<string, string>
): string {
  let result = text
  const sortedKeys = Object.keys(replacements).sort(
    (a, b) => b.length - a.length
  )
  for (const key of sortedKeys) {
    result = result.split(key).join(replacements[key])
  }
  return result
}

function applyToMission(
  mission: MissionExport,
  replacements: Record<string, string>
): MissionExport {
  const clone = deepClone(mission)

  if (clone.title) clone.title = applyReplacements(clone.title, replacements)
  if (clone.description)
    clone.description = applyReplacements(clone.description, replacements)

  if (clone.steps) {
    for (const step of clone.steps) {
      if (step.title)
        step.title = applyReplacements(step.title, replacements)
      if (step.description)
        step.description = applyReplacements(step.description, replacements)
      if (step.command)
        step.command = applyReplacements(step.command, replacements)
      if (step.yaml) step.yaml = applyReplacements(step.yaml, replacements)
      if (step.validation)
        step.validation = applyReplacements(step.validation, replacements)
    }
  }

  if (clone.resolution) {
    if (clone.resolution.summary) {
      clone.resolution.summary = applyReplacements(
        clone.resolution.summary,
        replacements
      )
    }
    if (clone.resolution.yaml) {
      clone.resolution.yaml = applyReplacements(
        clone.resolution.yaml,
        replacements
      )
    }
    if (clone.resolution.steps) {
      clone.resolution.steps = clone.resolution.steps.map((s) =>
        applyReplacements(s, replacements)
      )
    }
  }

  if (clone.prerequisites) {
    clone.prerequisites = clone.prerequisites.map((p) =>
      applyReplacements(p, replacements)
    )
  }

  return clone
}

export function sanitizeMission(
  mission: MissionExport,
  findings: SensitiveFinding[],
  selectedFindings?: SensitiveFinding[]
): SanitizationResult {
  const effectiveFindings = selectedFindings || findings
  const replacements = buildReplacementMap(effectiveFindings)
  const sanitized = applyToMission(mission, replacements)

  // Count total replacements made
  let replacementCount = 0
  const missionStr = JSON.stringify(mission)
  for (const key of Object.keys(replacements)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escaped, 'g')
    const matches = missionStr.match(regex)
    if (matches) replacementCount += matches.length
  }

  return {
    mission: {
      ...sanitized,
      security: {
        sanitized: true,
        redactedAt: new Date().toISOString(),
      },
    } as MissionExport & {
      security: { sanitized: boolean; redactedAt: string }
    },
    replacements,
    replacementCount,
  }
}

export function generateSanitizationPreview(
  _mission: MissionExport,
  findings: SensitiveFinding[]
): SanitizationPreviewItem[] {
  const replacements = buildReplacementMap(findings)
  const items: SanitizationPreviewItem[] = []
  const seen = new Set<string>()

  for (const finding of findings) {
    const key = `${finding.location}:${finding.match}`
    if (seen.has(key)) continue
    seen.add(key)

    const replacement = replacements[finding.match]
    if (replacement) {
      items.push({
        location: finding.location,
        original: finding.match,
        sanitized: replacement,
      })
    }
  }

  return items
}
