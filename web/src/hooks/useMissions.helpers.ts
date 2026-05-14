/**
 * Pure helper functions for the Mission system.
 *
 * Extracted from useMissions.provider.tsx (#13493) — these are stateless
 * utilities used by the provider and testable in isolation.
 */

import i18n from '../lib/i18n'
import type { MissionMessage } from './useMissionTypes'
import type { KagentiProviderAgentDiscoveryResult } from '../lib/kagentiProviderBackend'
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
