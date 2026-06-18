/**
 * Batch 5 demo data hooks for unified cards.
 */

import { MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from '../../constants/time'
import {
  TWO_MINUTES_MS,
  FIVE_MINUTES_MS,
  TEN_MINUTES_MS,
  TWO_HOURS_MS,
  THREE_HOURS_MS,
  TWO_DAYS_MS,
  FOUR_MINUTES_MS,
  THREE_MINUTES_MS,
  FORTY_FIVE_MINUTES_MS,
  THIRTY_MINUTES_MS,
  FIFTEEN_MINUTES_MS,
} from './timeConstants'

// ============================================================================
// Batch 5 demo data - GitOps, Security, Status cards
// ============================================================================

// ArgoCD health demo data (stats-grid)
export const DEMO_ARGOCD_HEALTH = {
  healthy: 12,
  degraded: 2,
  progressing: 1,
  missing: 0 }

// ArgoCD sync status demo data (stats-grid)
export const DEMO_ARGOCD_SYNC_STATUS = {
  synced: 11,
  outOfSync: 3,
  unknown: 1 }

// Gateway status demo data
export const DEMO_GATEWAY_STATUS = [
  { name: 'api-gateway', class: 'istio', addresses: 2, status: 'Programmed', cluster: 'prod-east' },
  { name: 'internal-gw', class: 'nginx', addresses: 1, status: 'Programmed', cluster: 'staging' },
]

// Kustomization status demo data
export const DEMO_KUSTOMIZATION_STATUS = [
  { name: 'apps', namespace: 'flux-system', ready: true, lastApplied: Date.now() - TWO_MINUTES_MS },
  { name: 'infra', namespace: 'flux-system', ready: true, lastApplied: Date.now() - FIVE_MINUTES_MS },
  { name: 'monitoring', namespace: 'flux-system', ready: false, lastApplied: Date.now() - TEN_MINUTES_MS },
]

// Provider health demo data
export const DEMO_PROVIDER_HEALTH = [
  { provider: 'AWS', type: 'cloud', status: 'healthy', latency: 45 },
  { provider: 'OpenAI', type: 'ai', status: 'healthy', latency: 120 },
  { provider: 'Azure', type: 'cloud', status: 'degraded', latency: 250 },
]

// Upgrade status demo data
export const DEMO_UPGRADE_STATUS = [
  { cluster: 'prod-east', currentVersion: '1.28.5', availableVersion: '1.29.2', status: 'available' },
  { cluster: 'staging', currentVersion: '1.29.1', availableVersion: '1.29.2', status: 'available' },
  { cluster: 'dev', currentVersion: '1.29.2', availableVersion: '1.29.2', status: 'current' },
]

// Prow status demo data (stats-grid)
export const DEMO_PROW_STATUS = {
  running: 5,
  passed: 42,
  failed: 3,
  pending: 2 }

// Prow history demo data
export const DEMO_PROW_HISTORY = [
  { job: 'e2e-tests', result: 'success', duration: 1200, finishedAt: Date.now() - MS_PER_HOUR },
  { job: 'unit-tests', result: 'success', duration: 300, finishedAt: Date.now() - TWO_HOURS_MS },
  { job: 'lint', result: 'failure', duration: 60, finishedAt: Date.now() - THREE_HOURS_MS },
]

// Helm history demo data
export const DEMO_HELM_HISTORY = [
  { revision: 5, chart: 'nginx-ingress-4.6.0', appVersion: '1.9.0', status: 'deployed', updated: Date.now() - MS_PER_DAY },
  { revision: 4, chart: 'nginx-ingress-4.5.2', appVersion: '1.8.0', status: 'superseded', updated: Date.now() - TWO_DAYS_MS },
]

// External secrets demo data (stats-grid)
export const DEMO_EXTERNAL_SECRETS = {
  total: 25,
  ready: 23,
  failed: 2 }

// Cert manager demo data (stats-grid)
export const DEMO_CERT_MANAGER = {
  certificates: 15,
  ready: 14,
  expiringSoon: 1,
  expired: 0 }

// Vault secrets demo data
export const DEMO_VAULT_SECRETS = [
  { path: 'secret/data/api-keys', status: 'synced', lastSync: Date.now() - MS_PER_MINUTE },
  { path: 'secret/data/db-creds', status: 'synced', lastSync: Date.now() - TWO_MINUTES_MS },
]

// Falco alerts demo data
export const DEMO_FALCO_ALERTS = [
  { rule: 'Terminal shell in container', severity: 'Warning', count: 3, lastSeen: Date.now() - FIVE_MINUTES_MS },
  { rule: 'Sensitive file read', severity: 'Notice', count: 12, lastSeen: Date.now() - TEN_MINUTES_MS },
]

// Kubescape scan demo data (stats-grid)
export const DEMO_KUBESCAPE_SCAN = {
  passed: 85,
  failed: 12,
  skipped: 3,
  riskScore: 22 }

// Trivy scan demo data (stats-grid)
export const DEMO_TRIVY_SCAN = {
  critical: 2,
  high: 8,
  medium: 25,
  low: 45 }

// Event summary demo data (stats-grid)
export const DEMO_EVENT_SUMMARY = {
  normal: 156,
  warning: 23,
  error: 5 }

// App status demo data
export const DEMO_APP_STATUS = [
  { name: 'frontend', namespace: 'production', status: 'healthy', pods: 3, cluster: 'prod-east' },
  { name: 'backend', namespace: 'production', status: 'degraded', pods: 5, cluster: 'prod-east' },
]

// GPU status demo data (stats-grid)
export const DEMO_GPU_STATUS = {
  total: 24,
  available: 6,
  allocated: 18,
  errored: 0 }

// GPU utilization demo data (chart)
export const DEMO_GPU_UTILIZATION = [
  { timestamp: Date.now() - FIVE_MINUTES_MS, utilization: 72, memory: 68 },
  { timestamp: Date.now() - FOUR_MINUTES_MS, utilization: 78, memory: 72 },
  { timestamp: Date.now() - THREE_MINUTES_MS, utilization: 65, memory: 60 },
  { timestamp: Date.now() - TWO_MINUTES_MS, utilization: 82, memory: 78 },
  { timestamp: Date.now() - MS_PER_MINUTE, utilization: 75, memory: 70 },
  { timestamp: Date.now(), utilization: 80, memory: 74 },
]

// GPU usage trend demo data (chart)
export const DEMO_GPU_USAGE_TREND = [
  { timestamp: Date.now() - MS_PER_HOUR, avgUtilization: 68 },
  { timestamp: Date.now() - FORTY_FIVE_MINUTES_MS, avgUtilization: 72 },
  { timestamp: Date.now() - THIRTY_MINUTES_MS, avgUtilization: 78 },
  { timestamp: Date.now() - FIFTEEN_MINUTES_MS, avgUtilization: 74 },
  { timestamp: Date.now(), avgUtilization: 76 },
]

// Policy violations demo data
export const DEMO_POLICY_VIOLATIONS = [
  { policy: 'require-labels', resource: 'deployment/api', namespace: 'default', severity: 'warning', cluster: 'prod-east' },
  { policy: 'deny-privileged', resource: 'pod/debug', namespace: 'kube-system', severity: 'critical', cluster: 'staging' },
]

// Namespace overview demo data (stats-grid)
export const DEMO_NAMESPACE_OVERVIEW = {
  pods: 45,
  deployments: 12,
  services: 8,
  configmaps: 15 }

// Namespace quotas demo data
export const DEMO_NAMESPACE_QUOTAS = [
  { namespace: 'production', cpuUsed: '4', cpuLimit: '8', memUsed: '8Gi', memLimit: '16Gi' },
  { namespace: 'staging', cpuUsed: '2', cpuLimit: '4', memUsed: '4Gi', memLimit: '8Gi' },
]

// Namespace RBAC demo data
export const DEMO_NAMESPACE_RBAC = [
  { subject: 'developers', type: 'Group', role: 'edit', namespace: 'production' },
  { subject: 'ci-bot', type: 'ServiceAccount', role: 'admin', namespace: 'production' },
]

// Resource capacity demo data (stats-grid)
export const DEMO_RESOURCE_CAPACITY = {
  cpuTotal: 96,
  cpuUsed: 48,
  memoryTotal: 384,
  memoryUsed: 256 }

