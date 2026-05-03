/**
 * Runbook execution and deep-link integration
 *
 * Handles:
 * - Alert diagnosis with runbook evidence
 * - Runbook discovery by condition type
 * - Deep-link generation for navigation
 */

import type { Alert } from '../types/alerts'
import { findRunbookForCondition } from '../lib/runbooks/builtins'
import { executeRunbook } from '../lib/runbooks/executor'
import type { RunbookContext } from '../lib/runbooks/types'

export interface RunbookExecutionResult {
  enrichedPrompt: string
  stepResults: unknown[]
}

/**
 * Find and execute a runbook for an alert condition type
 *
 * Used in AI diagnosis to gather evidence from the cluster
 */
export async function findAndExecuteRunbook(
  conditionType: string | undefined,
  alert: Alert
): Promise<RunbookExecutionResult | null> {
  if (!conditionType) return null

  const runbook = findRunbookForCondition(conditionType)
  if (!runbook) return null

  try {
    const context: RunbookContext = {
      cluster: alert.cluster,
      namespace: alert.namespace,
      resource: alert.resource,
      resourceKind: alert.resourceKind,
      alertMessage: alert.message,
    }

    const result = await executeRunbook(runbook, context)
    if (result.enrichedPrompt) {
      console.debug(`Runbook "${runbook.title}" gathered ${result.stepResults.length} evidence steps`)
      return {
        enrichedPrompt: `\n\n--- Runbook Evidence (${runbook.title}) ---\n${result.enrichedPrompt}`,
        stepResults: result.stepResults,
      }
    }
  } catch {
    // Silent failure - runbook is best-effort enhancement
  }

  return null
}

/**
 * Build AI diagnosis prompt with optional runbook evidence
 */
export function buildDiagnosisPrompt(
  alert: Alert,
  runbookEvidence: string
): string {
  const basePrompt = `Please analyze this alert and provide diagnosis with suggestions:

Alert: ${alert.ruleName}
Severity: ${alert.severity}
Message: ${alert.message}
Cluster: ${alert.cluster || 'N/A'}
Resource: ${alert.resource || 'N/A'}
Details: ${JSON.stringify(alert.details, null, 2)}`

  return `${basePrompt}${runbookEvidence}

Please provide:
1. A summary of the issue
2. The likely root cause
3. Suggested actions to resolve this alert`
}
