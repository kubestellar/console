/**
 * Pure helper functions for the Mission system.
 *
 * Extracted from useMissions.tsx (#14148) — these are stateless utilities
 * used by the provider and testable in isolation.
 */

import i18n from '../lib/i18n'
import type { MissionMessage } from './useMissionTypes'
import type { KagentiProviderAgentDiscoveryResult } from '../lib/kagentiProviderBackend'
import type { PreflightError } from '../lib/missions/preflightCheck'
import { resolveRequiredTools } from '../lib/missions/preflightCheck'
import { AGENT_DISCONNECT_ERROR_PATTERNS } from './useMissions.constants'

// ─── Array Safety ────────────────────────────────────────────────────────────

/** Safely unwrap optional MissionMessage array (avoids .map on undefined). */
export function getMissionMessages(messages?: MissionMessage[]): MissionMessage[] {
  return messages || []
}

// ─── Agent Disconnect Detection ──────────────────────────────────────────────

/** Returns true when a MissionMessage is a stale agent-disconnect error. */
export function isStaleAgentErrorMessage(msg: MissionMessage): boolean {
  return (
    msg.role === 'system' &&
    AGENT_DISCONNECT_ERROR_PATTERNS.some(pattern => msg.content.includes(pattern))
  )
}

// ─── Request ID Generation ───────────────────────────────────────────────────

/**
 * #7089 — Monotonic counter for generating unique request IDs. The previous
 * `claude-${Date.now()}` pattern could collide when two requests were sent
 * in the same millisecond (rapid sends, concurrent tabs). A monotonic counter
 * combined with a random suffix guarantees uniqueness within the same tab,
 * and the random suffix provides uniqueness across tabs.
 */
let requestIdCounter = 0
export function generateRequestId(prefix = 'claude'): string {
  requestIdCounter += 1
  return `${prefix}-${Date.now()}-${requestIdCounter}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`
}

// ─── Preflight / Tool-Check Helpers ──────────────────────────────────────────

const OPTIONAL_MISSION_TOOL_PATTERNS = {
  gh: /\bgh\b|\bgithub\s+cli\b/i,
  helm: /\bhelm\b/i,
} as const

const MISSION_CONTEXT_TOOL_KEYS = ['requiredLocalTools', 'requiredTools', 'requiredMissionTools'] as const

const MISSING_TOOL_WARNING_HEADING = `**${i18n.t('missions.preflight.toolWarning.heading')}**`
const MISSING_TOOL_WARNING_SUFFIX = i18n.t('missions.preflight.toolWarning.suffix')

export function shouldAllowMissingToolWarning(context?: Record<string, unknown>): boolean {
  return context?.allowMissingLocalTools === true
}

export function shouldSkipClusterPreflight(context?: Record<string, unknown>): boolean {
  return context?.skipClusterPreflight === true
}

export function getMissingTools(error: PreflightError, fallbackTools: string[]): string[] {
  const missingTools = error.details?.missingTools
  return Array.isArray(missingTools) && missingTools.every(tool => typeof tool === 'string')
    ? missingTools
    : fallbackTools
}

export function getMissionContextTools(context?: Record<string, unknown>): string[] {
  return MISSION_CONTEXT_TOOL_KEYS.flatMap((key) => {
    const value = context?.[key]
    return Array.isArray(value)
      ? value.filter((tool): tool is string => typeof tool === 'string')
      : []
  })
}

export function resolveMissionToolRequirements({
  title,
  description,
  prompt,
  type,
  context,
}: {
  title?: string
  description?: string
  prompt: string
  type?: string
  context?: Record<string, unknown>
}): { requiredTools: string[]; missionSpecificOptionalTools: string[] } {
  const searchableText = `${title || ''}\n${description || ''}\n${prompt}`
  const missionSpecificOptionalTools = Object.entries(OPTIONAL_MISSION_TOOL_PATTERNS)
    .filter(([, pattern]) => pattern.test(searchableText))
    .map(([tool]) => tool)
  const requiredTools = [...new Set([
    ...resolveRequiredTools(type),
    ...getMissionContextTools(context),
    ...missionSpecificOptionalTools,
  ])]

  return { requiredTools, missionSpecificOptionalTools }
}

export function buildMissingToolWarning(error: PreflightError): string {
  const missingTools = getMissingTools(error, [])
  const toolSummary = missingTools.length > 0
    ? i18n.t('missions.preflight.toolWarning.summary', { tools: (missingTools || []).join(', ') })
    : error.message

  return `${MISSING_TOOL_WARNING_HEADING}\n\n${toolSummary}\n\n${MISSING_TOOL_WARNING_SUFFIX}`
}

export function buildMissionToolUnavailableError(error: PreflightError, missingTools: string[]): PreflightError {
  return {
    ...error,
    message: i18n.t('missions.preflight.optionalToolUnavailable.message', { tools: (missingTools || []).join(', ') }),
    details: {
      ...(error.details || {}),
      missingTools,
    },
  }
}

// ─── Kagenti Provider Discovery ──────────────────────────────────────────────

export const KAGENTI_PROVIDER_UNAVAILABLE_EVENT = 'kagenti_provider_unavailable'
export const KAGENTI_NO_AGENTS_DISCOVERED_EVENT = 'kagenti_no_agents_discovered'

export type KagentiDiscoveryFailure = Extract<KagentiProviderAgentDiscoveryResult, { ok: false }>

export function buildKagentiDiscoveryErrorMessage(result: KagentiDiscoveryFailure): string {
  if (result.reason === 'provider_unreachable') {
    const reasonSuffix = result.detail ? ` (${result.detail})` : ''
    return `**${i18n.t('missions.kagenti.providerUnavailableTitle')}**\n\n${i18n.t('missions.kagenti.providerUnavailableDescription', { reasonSuffix })}`
  }

  return `**${i18n.t('missions.kagenti.noAgentsTitle')}**\n\n${i18n.t('missions.kagenti.noAgentsDescription')}`
}
