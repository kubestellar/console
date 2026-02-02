/**
 * Card Configuration Registry
 *
 * Central registry for all unified card configurations.
 * Add new card configs here as they are migrated.
 */

import type { UnifiedCardConfig, CardConfigRegistry } from '../../lib/unified/types'

// Import card configurations
import { podIssuesConfig } from './pod-issues'
import { clusterHealthConfig } from './cluster-health'
import { deploymentStatusConfig } from './deployment-status'
import { eventStreamConfig } from './event-stream'
import { resourceUsageConfig } from './resource-usage'

/**
 * Registry of all unified card configurations
 * Key is the card type, value is the configuration
 */
export const CARD_CONFIGS: CardConfigRegistry = {
  // Migrated cards (PR 3)
  pod_issues: podIssuesConfig,
  cluster_health: clusterHealthConfig,
  deployment_status: deploymentStatusConfig,
  event_stream: eventStreamConfig,
  resource_usage: resourceUsageConfig,
}

/**
 * Get a card configuration by type
 */
export function getCardConfig(cardType: string): UnifiedCardConfig | undefined {
  return CARD_CONFIGS[cardType]
}

/**
 * Check if a card type has a unified configuration
 */
export function hasUnifiedConfig(cardType: string): boolean {
  return cardType in CARD_CONFIGS
}

/**
 * Get all registered unified card types
 */
export function getUnifiedCardTypes(): string[] {
  return Object.keys(CARD_CONFIGS)
}

// Re-export individual configs for direct imports
export {
  podIssuesConfig,
  clusterHealthConfig,
  deploymentStatusConfig,
  eventStreamConfig,
  resourceUsageConfig,
}
