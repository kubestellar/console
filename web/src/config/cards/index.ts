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
// Chart cards (PR 4)
import { clusterMetricsConfig } from './cluster-metrics'
import { eventsTimelineConfig } from './events-timeline'
// Additional cards (PR 7)
import { securityIssuesConfig } from './security-issues'
import { activeAlertsConfig } from './active-alerts'
import { storageOverviewConfig } from './storage-overview'
import { networkOverviewConfig } from './network-overview'
import { topPodsConfig } from './top-pods'
import { gitopsDriftConfig } from './gitops-drift'
// Event cards (PR 8)
import { warningEventsConfig } from './warning-events'
import { recentEventsConfig } from './recent-events'
// Storage & Networking cards (PR 8)
import { pvcStatusConfig } from './pvc-status'
import { serviceStatusConfig } from './service-status'
// Workload & Operator cards (PR 9)
import { deploymentIssuesConfig } from './deployment-issues'
import { operatorStatusConfig } from './operator-status'
// Additional resource cards (PR 10)
import { helmReleaseStatusConfig } from './helm-release-status'
import { configMapStatusConfig } from './configmap-status'
import { secretStatusConfig } from './secret-status'
import { ingressStatusConfig } from './ingress-status'
import { nodeStatusConfig } from './node-status'

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
  // Chart cards (PR 4)
  cluster_metrics: clusterMetricsConfig,
  events_timeline: eventsTimelineConfig,
  // Additional cards (PR 7)
  security_issues: securityIssuesConfig,
  active_alerts: activeAlertsConfig,
  storage_overview: storageOverviewConfig,
  network_overview: networkOverviewConfig,
  top_pods: topPodsConfig,
  gitops_drift: gitopsDriftConfig,
  // Event cards (PR 8)
  warning_events: warningEventsConfig,
  recent_events: recentEventsConfig,
  // Storage & Networking cards (PR 8)
  pvc_status: pvcStatusConfig,
  service_status: serviceStatusConfig,
  // Workload & Operator cards (PR 9)
  deployment_issues: deploymentIssuesConfig,
  operator_status: operatorStatusConfig,
  // Additional resource cards (PR 10)
  helm_release_status: helmReleaseStatusConfig,
  configmap_status: configMapStatusConfig,
  secret_status: secretStatusConfig,
  ingress_status: ingressStatusConfig,
  node_status: nodeStatusConfig,
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
  // Chart cards (PR 4)
  clusterMetricsConfig,
  eventsTimelineConfig,
  // Additional cards (PR 7)
  securityIssuesConfig,
  activeAlertsConfig,
  storageOverviewConfig,
  networkOverviewConfig,
  topPodsConfig,
  gitopsDriftConfig,
  // Event cards (PR 8)
  warningEventsConfig,
  recentEventsConfig,
  // Storage & Networking cards (PR 8)
  pvcStatusConfig,
  serviceStatusConfig,
  // Workload & Operator cards (PR 9)
  deploymentIssuesConfig,
  operatorStatusConfig,
  // Additional resource cards (PR 10)
  helmReleaseStatusConfig,
  configMapStatusConfig,
  secretStatusConfig,
  ingressStatusConfig,
  nodeStatusConfig,
}
