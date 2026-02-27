/**
 * Mission Scanner
 *
 * Runs structural and content checks on a validated MissionExport object.
 */

import type { MissionExport, FileScanResult, ScanFinding, ScanMetadata } from '../types'

/**
 * Run a full scan on a validated MissionExport, returning findings and metadata.
 */
export function fullScan(mission: MissionExport): FileScanResult {
  const findings: ScanFinding[] = []

  // Metadata extraction
  const metadata: ScanMetadata = {
    title: mission.title || null,
    type: mission.type || null,
    version: mission.version || null,
    stepCount: mission.steps?.length ?? 0,
    tagCount: mission.tags?.length ?? 0,
  }

  // Content quality checks
  if (mission.title && mission.title.length < 5) {
    findings.push({
      severity: 'warning',
      code: 'SHORT_TITLE',
      message: 'Title is very short — consider a more descriptive title',
      path: '.title',
    })
  }

  if (mission.description && mission.description.length < 20) {
    findings.push({
      severity: 'warning',
      code: 'SHORT_DESCRIPTION',
      message: 'Description is very short — add more context for discoverability',
      path: '.description',
    })
  }

  if (mission.tags && mission.tags.length === 0) {
    findings.push({
      severity: 'warning',
      code: 'NO_TAGS',
      message: 'No tags defined — tags improve search and matching',
      path: '.tags',
    })
  }

  // Step validation
  if (mission.steps) {
    for (let i = 0; i < mission.steps.length; i++) {
      const step = mission.steps[i]

      if (step.command && step.command.includes('kubectl delete') && !step.validation) {
        findings.push({
          severity: 'warning',
          code: 'DESTRUCTIVE_NO_VALIDATION',
          message: `Step ${i + 1} has a destructive command without a validation step`,
          path: `.steps[${i}]`,
        })
      }

      if (step.yaml) {
        try {
          // Basic YAML structure check — just verify it's not empty
          if (step.yaml.trim().length === 0) {
            findings.push({
              severity: 'warning',
              code: 'EMPTY_YAML',
              message: `Step ${i + 1} has an empty YAML block`,
              path: `.steps[${i}].yaml`,
            })
          }
        } catch {
          findings.push({
            severity: 'error',
            code: 'INVALID_YAML',
            message: `Step ${i + 1} has invalid YAML`,
            path: `.steps[${i}].yaml`,
          })
        }
      }
    }
  }

  // Resolution checks
  if (mission.resolution) {
    if (!mission.resolution.summary) {
      findings.push({
        severity: 'info',
        code: 'NO_RESOLUTION_SUMMARY',
        message: 'Resolution has no summary — consider adding one for knowledge reuse',
        path: '.resolution.summary',
      })
    }
    if (!mission.resolution.steps || mission.resolution.steps.length === 0) {
      findings.push({
        severity: 'info',
        code: 'NO_RESOLUTION_STEPS',
        message: 'Resolution has no steps defined',
        path: '.resolution.steps',
      })
    }
  }

  // Prerequisite checks
  if (mission.prerequisites) {
    for (let i = 0; i < mission.prerequisites.length; i++) {
      if (mission.prerequisites[i].trim().length === 0) {
        findings.push({
          severity: 'warning',
          code: 'EMPTY_PREREQUISITE',
          message: `Prerequisite ${i + 1} is empty`,
          path: `.prerequisites[${i}]`,
        })
      }
    }
  }

  const hasErrors = findings.some((f) => f.severity === 'error')

  return {
    valid: !hasErrors,
    findings,
    metadata,
  }
}
