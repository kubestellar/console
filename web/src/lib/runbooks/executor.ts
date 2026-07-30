import type { Runbook, RunbookContext, EvidenceStepResult, RunbookResult } from './types'
import { authFetch } from '../api'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../constants/network'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

/**
 * Resolve template variables in a string.
 * Replaces {{cluster}}, {{namespace}}, {{resource}}, {{alertMessage}} etc.
 */
function resolveTemplate(template: string, context: RunbookContext): string {
  return template
    .replace(/\{\{cluster\}\}/g, context.cluster || 'unknown')
    .replace(/\{\{namespace\}\}/g, context.namespace || 'default')
    .replace(/\{\{resource\}\}/g, context.resource || 'unknown')
    .replace(/\{\{resourceKind\}\}/g, context.resourceKind || 'unknown')
    .replace(/\{\{alertMessage\}\}/g, context.alertMessage || '')
}

/**
 * Resolve template variables in an args map.
 */
function resolveArgs(args: Record<string, string>, context: RunbookContext): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    const resolvedValue = resolveTemplate(value, context)
    // Convert numeric strings to numbers
    const num = Number(resolvedValue)
    resolved[key] = !isNaN(num) && resolvedValue.trim() !== '' ? num : resolvedValue
  }
  return resolved
}

/**
 * Execute a single evidence step via MCP or Gadget API.
 *
 * #7285 — Fixed MCP route from `${LOCAL_AGENT_HTTP_URL}/ops/call` to `${LOCAL_AGENT_HTTP_URL}/tools/ops/call`
 * to match the backend route registered in server.go.
 *
 * #7286 — Fixed MCP payload schema from `{ tool, args }` to `{ name, arguments }`
 * to match the backend's `CallToolRequest` struct.
 */
async function executeStep(
  step: { source: string; tool: string; args: Record<string, string> },
  context: RunbookContext,
  signal?: AbortSignal,
): Promise<unknown> {
  const resolvedArgs = resolveArgs(step.args, context)

  if (step.source === 'gadget') {
    const resp = await authFetch(`${API_BASE}/api/gadget/trace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: step.tool, args: resolvedArgs }),
      signal: signal ?? AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })
    if (!resp.ok) throw new Error(`Gadget trace failed: ${resp.status}`)
    const data = await resp.json()
    if (data.isError) throw new Error('Gadget tool error')
    return data.result
  }

  // #7285 — Backend registers the route at /api/mcp/tools/ops/call (server.go:916)
  // #7286 — Backend expects { name, arguments } (CallToolRequest struct)
  const resp = await authFetch(`${API_BASE}/api/mcp/tools/ops/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: step.tool, arguments: resolvedArgs }),
    signal: signal ?? AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`MCP call failed: ${resp.status}`)
  return resp.json()
}

/**
 * Execute a runbook, yielding progress via callback.
 * Returns the full result with enriched AI prompt.
 *
 * #7293 — Required step failures now stop subsequent steps (fail-fast).
 * #7294 — Supports AbortSignal for cancellation of in-flight requests.
 */
export async function executeRunbook(
  runbook: Runbook,
  context: RunbookContext,
  onProgress?: (results: EvidenceStepResult[]) => void,
  signal?: AbortSignal,
): Promise<RunbookResult> {
  const startedAt = new Date().toISOString()
  const stepResults: EvidenceStepResult[] = runbook.evidenceSteps.map(step => ({
    stepId: step.id,
    label: step.label,
    status: 'pending' as const,
  }))

  // Notify initial state
  onProgress?.(stepResults)

  // #7287 — Track whether any required step failed so we can surface it
  let requiredStepFailed = false

  // Execute steps sequentially
  for (let i = 0; i < runbook.evidenceSteps.length; i++) {
    // #7294 — Check for cancellation before each step
    if (signal?.aborted) {
      for (let j = i; j < runbook.evidenceSteps.length; j++) {
        stepResults[j] = { ...stepResults[j], status: 'skipped', error: 'Cancelled' }
      }
      onProgress?.([...stepResults])
      break
    }

    // #7293 — If a required step failed, skip all subsequent steps
    if (requiredStepFailed) {
      stepResults[i] = {
        ...stepResults[i],
        status: 'skipped',
        error: 'Skipped due to prior required step failure',
      }
      onProgress?.([...stepResults])
      continue
    }

    const step = runbook.evidenceSteps[i]
    stepResults[i] = { ...stepResults[i], status: 'running' }
    onProgress?.([...stepResults])

    const startTime = Date.now()
    try {
      const data = await executeStep(step, context, signal)
      stepResults[i] = {
        ...stepResults[i],
        status: 'success',
        data,
        durationMs: Date.now() - startTime,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      if (step.optional) {
        stepResults[i] = {
          ...stepResults[i],
          status: 'skipped',
          error: errorMessage,
          durationMs: Date.now() - startTime,
        }
      } else {
        stepResults[i] = {
          ...stepResults[i],
          status: 'failed',
          error: errorMessage,
          durationMs: Date.now() - startTime,
        }
        // #7293 — Mark that a required step failed to stop subsequent steps
        requiredStepFailed = true
      }
    }
    onProgress?.([...stepResults])
  }

  // Build evidence summary for the AI prompt
  const evidenceText = stepResults
    .filter(r => r.status === 'success' && r.data)
    .map(r => `### ${r.label}\n${JSON.stringify(r.data, null, 2)}`)
    .join('\n\n')

  // #7287 — Include failed step errors in the evidence so the AI
  // knows evidence collection was incomplete
  const failedSteps = stepResults.filter(r => r.status === 'failed')
  const failureText = failedSteps.length > 0
    ? `\n\n### Evidence Collection Failures\n${failedSteps.map(r => `- ${r.label}: ${r.error}`).join('\n')}`
    : ''

  const enrichedPrompt = resolveTemplate(runbook.analysisPrompt, context)
    .replace('{{evidence}}', (evidenceText || 'No evidence could be gathered.') + failureText)

  return {
    runbookId: runbook.id,
    runbookTitle: runbook.title,
    stepResults,
    enrichedPrompt,
    startedAt,
    completedAt: new Date().toISOString(),
  }
}
