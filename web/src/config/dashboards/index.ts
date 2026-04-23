/**
 * Dashboard Configuration Registry
 *
 * Central registry for all unified dashboard configurations.
 * This is the SINGLE SOURCE OF TRUTH for default card lists.
 * Each dashboard's default cards are defined in its own config file
 * (e.g., ./main.ts, ./clusters.ts) and exposed via getDefaultCards()
 * and getDefaultCardsForDashboard(). Do not duplicate these lists
 * elsewhere in the codebase.
 */

import type { UnifiedDashboardConfig, DashboardConfigRegistry } from '../../lib/unified/types'
import { isVisibleForProject } from '../../lib/project/context'
import { mainDashboardConfig } from './main'
import { computeDashboardConfig } from './compute'
import { securityDashboardConfig } from './security'
import { gitopsDashboardConfig } from './gitops'
import { storageDashboardConfig } from './storage'
import { networkDashboardConfig } from './network'
import { eventsDashboardConfig } from './events'
import { workloadsDashboardConfig } from './workloads'
import { operatorsDashboardConfig } from './operators'
import { clustersDashboardConfig } from './clusters'
import { complianceDashboardConfig } from './compliance'
import { complianceFrameworksDashboardConfig } from './compliance-frameworks'
import { changeControlDashboardConfig } from './change-control'
import { sodDashboardConfig } from './segregation-of-duties'
import { complianceReportsDashboardConfig } from './compliance-reports'
import { dataResidencyDashboardConfig } from './data-residency'
import { baaDashboardConfig } from './baa'
import { hipaaDashboardConfig } from './hipaa'
import { gxpDashboardConfig } from './gxp'
import { nistDashboardConfig } from './nist'
import { stigDashboardConfig } from './stig'
import { airgapDashboardConfig } from './airgap'
import { fedrampDashboardConfig } from './fedramp'
import { costDashboardConfig } from './cost'
import { gpuDashboardConfig } from './gpu'
import { nodesDashboardConfig } from './nodes'
import { deploymentsDashboardConfig } from './deployments'
import { podsDashboardConfig } from './pods'
import { servicesDashboardConfig } from './services'
import { helmDashboardConfig } from './helm'
import { alertsDashboardConfig } from './alerts'
import { aiMlDashboardConfig } from './ai-ml'
import { ciCdDashboardConfig } from './ci-cd'
import { karmadaOpsDashboardConfig } from './karmada-ops'
import { logsDashboardConfig } from './logs'
import { dataComplianceDashboardConfig } from './data-compliance'
import { arcadeDashboardConfig } from './arcade'
import { deployDashboardConfig } from './deploy'
import { aiAgentsDashboardConfig } from './ai-agents'
import { llmdBenchmarksDashboardConfig } from './llmd-benchmarks'
import { clusterAdminDashboardConfig } from './cluster-admin'
import { insightsDashboardConfig } from './insights'
import { multiTenancyDashboardConfig } from './multi-tenancy'
import { drasiDashboardConfig } from './drasi'
import { acmmDashboardConfig } from './acmm'
import { oidcDashboardConfig } from './oidc'
import { rbacAuditDashboardConfig } from './rbac-audit'
import { sessionManagementDashboardConfig } from './session-management'
import { siemDashboardConfig } from './siem'
import { incidentResponseDashboardConfig } from './incident-response'
import { threatIntelDashboardConfig } from './threat-intel'

/**
 * Registry of all unified dashboard configurations
 */
export const DASHBOARD_CONFIGS: DashboardConfigRegistry = {
  main: mainDashboardConfig,
  compute: computeDashboardConfig,
  security: securityDashboardConfig,
  gitops: gitopsDashboardConfig,
  storage: storageDashboardConfig,
  network: networkDashboardConfig,
  events: eventsDashboardConfig,
  workloads: workloadsDashboardConfig,
  operators: operatorsDashboardConfig,
  clusters: clustersDashboardConfig,
  compliance: complianceDashboardConfig,
  'compliance-frameworks': complianceFrameworksDashboardConfig,
  'change-control': changeControlDashboardConfig,
  'segregation-of-duties': sodDashboardConfig,
  'compliance-reports': complianceReportsDashboardConfig,
  'data-residency': dataResidencyDashboardConfig,
  baa: baaDashboardConfig,
  hipaa: hipaaDashboardConfig,
  gxp: gxpDashboardConfig,
  nist: nistDashboardConfig,
  stig: stigDashboardConfig,
  airgap: airgapDashboardConfig,
  fedramp: fedrampDashboardConfig,
  cost: costDashboardConfig,
  gpu: gpuDashboardConfig,
  nodes: nodesDashboardConfig,
  deployments: deploymentsDashboardConfig,
  pods: podsDashboardConfig,
  services: servicesDashboardConfig,
  helm: helmDashboardConfig,
  alerts: alertsDashboardConfig,
  'ai-ml': aiMlDashboardConfig,
  'ci-cd': ciCdDashboardConfig,
  'karmada-ops': karmadaOpsDashboardConfig,
  logs: logsDashboardConfig,
  'data-compliance': dataComplianceDashboardConfig,
  arcade: arcadeDashboardConfig,
  deploy: deployDashboardConfig,
  'ai-agents': aiAgentsDashboardConfig,
  'llm-d-benchmarks': llmdBenchmarksDashboardConfig,
  'cluster-admin': clusterAdminDashboardConfig,
  insights: insightsDashboardConfig,
  'multi-tenancy': multiTenancyDashboardConfig,
  drasi: drasiDashboardConfig,
  acmm: acmmDashboardConfig,
  oidc: oidcDashboardConfig,
  'rbac-audit': rbacAuditDashboardConfig,
  'session-management': sessionManagementDashboardConfig,
  siem: siemDashboardConfig,
  'incident-response': incidentResponseDashboardConfig,
  'threat-intel': threatIntelDashboardConfig,
}

/**
 * Get a dashboard configuration by ID
 */
export function getDashboardConfig(dashboardId: string): UnifiedDashboardConfig | undefined {
  return DASHBOARD_CONFIGS[dashboardId]
}

/**
 * Get all dashboard configs visible for the active project.
 * Dashboards without a `projects` field are always included.
 */
export function getVisibleDashboardConfigs(): DashboardConfigRegistry {
  const result: DashboardConfigRegistry = {}
  for (const [key, config] of Object.entries(DASHBOARD_CONFIGS)) {
    if (isVisibleForProject(config.projects)) {
      result[key] = config
    }
  }
  return result
}

/**
 * Check if a dashboard ID has a unified configuration
 */
export function hasUnifiedDashboardConfig(dashboardId: string): boolean {
  return dashboardId in DASHBOARD_CONFIGS
}

/**
 * Get all registered dashboard IDs
 */
export function getUnifiedDashboardIds(): string[] {
  return Object.keys(DASHBOARD_CONFIGS)
}

/**
 * Get default cards for a dashboard in the legacy format used by DashboardPage
 * Converts from UnifiedDashboardConfig.cards to the legacy { type, title, position } format
 */
export function getDefaultCards(dashboardId: string): Array<{ type: string; title?: string; position: { w: number; h: number } }> {
  const config = DASHBOARD_CONFIGS[dashboardId]
  if (!config?.cards) return []

  return config.cards.map(card => ({
    type: card.cardType,
    title: card.title,
    position: { w: card.position?.w || 4, h: card.position?.h || 2 },
  }))
}

/**
 * Get default cards for a dashboard in the Dashboard.tsx format
 * Converts from UnifiedDashboardConfig.cards to { id, card_type, config, position } format
 */
export function getDefaultCardsForDashboard(dashboardId: string): Array<{ id: string; card_type: string; config: Record<string, unknown>; position: { x: number; y: number; w: number; h: number } }> {
  const config = DASHBOARD_CONFIGS[dashboardId]
  if (!config?.cards) return []

  return config.cards.map((card, index) => ({
    id: card.id || `default-${index}`,
    card_type: card.cardType,
    config: {},
    position: {
      x: card.position?.x ?? (index % 3) * 4,
      y: card.position?.y ?? Math.floor(index / 3) * 3,
      w: card.position?.w || 4,
      h: card.position?.h || 2,
    },
  }))
}

// Re-export individual configs
export {
  mainDashboardConfig,
  computeDashboardConfig,
  securityDashboardConfig,
  gitopsDashboardConfig,
  storageDashboardConfig,
  networkDashboardConfig,
  eventsDashboardConfig,
  workloadsDashboardConfig,
  operatorsDashboardConfig,
  clustersDashboardConfig,
  complianceDashboardConfig,
  complianceFrameworksDashboardConfig,
  changeControlDashboardConfig,
  sodDashboardConfig,
  complianceReportsDashboardConfig,
  dataResidencyDashboardConfig,
  baaDashboardConfig,
  hipaaDashboardConfig,
  gxpDashboardConfig,
  nistDashboardConfig,
  stigDashboardConfig,
  airgapDashboardConfig,
  fedrampDashboardConfig,
  costDashboardConfig,
  gpuDashboardConfig,
  nodesDashboardConfig,
  deploymentsDashboardConfig,
  podsDashboardConfig,
  servicesDashboardConfig,
  helmDashboardConfig,
  alertsDashboardConfig,
  aiMlDashboardConfig,
  ciCdDashboardConfig,
  karmadaOpsDashboardConfig,
  logsDashboardConfig,
  dataComplianceDashboardConfig,
  arcadeDashboardConfig,
  deployDashboardConfig,
  aiAgentsDashboardConfig,
  llmdBenchmarksDashboardConfig,
  clusterAdminDashboardConfig,
  insightsDashboardConfig,
  multiTenancyDashboardConfig,
  drasiDashboardConfig,
  oidcDashboardConfig,
  rbacAuditDashboardConfig,
  sessionManagementDashboardConfig,
  siemDashboardConfig,
  incidentResponseDashboardConfig,
  threatIntelDashboardConfig,
}
