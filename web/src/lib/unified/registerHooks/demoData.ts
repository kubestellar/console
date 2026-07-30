/**
 * Static demo data used by unified card hooks.
 */

import {
  TWO_MINUTES_MS,
  THREE_MINUTES_MS,
  FOUR_MINUTES_MS,
  FIVE_MINUTES_MS,
  TEN_MINUTES_MS,
  FIFTEEN_MINUTES_MS,
  THIRTY_MINUTES_MS,
  FORTY_FIVE_MINUTES_MS,
  TWO_HOURS_MS,
  THREE_HOURS_MS,
  TWO_DAYS_MS,
  THREE_DAYS_MS,
} from './demoSupport'
import { MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from '../../constants/time'

// Cluster metrics demo data
export const DEMO_CLUSTER_METRICS = [
  { timestamp: Date.now() - FIVE_MINUTES_MS, cpu: 45, memory: 62, pods: 156 },
  { timestamp: Date.now() - FOUR_MINUTES_MS, cpu: 48, memory: 64, pods: 158 },
  { timestamp: Date.now() - THREE_MINUTES_MS, cpu: 42, memory: 61, pods: 155 },
  { timestamp: Date.now() - TWO_MINUTES_MS, cpu: 51, memory: 67, pods: 162 },
  { timestamp: Date.now() - MS_PER_MINUTE, cpu: 47, memory: 65, pods: 159 },
  { timestamp: Date.now(), cpu: 49, memory: 66, pods: 161 },
]

// Resource usage demo data
export const DEMO_RESOURCE_USAGE = [
  { cluster: 'prod-east', cpu: 72, memory: 68, storage: 45 },
  { cluster: 'staging', cpu: 35, memory: 42, storage: 28 },
  { cluster: 'dev', cpu: 15, memory: 22, storage: 12 },
]

// Events timeline demo data
export const DEMO_EVENTS_TIMELINE = [
  { timestamp: Date.now() - FIVE_MINUTES_MS, count: 12, type: 'Normal' },
  { timestamp: Date.now() - FOUR_MINUTES_MS, count: 8, type: 'Warning' },
  { timestamp: Date.now() - THREE_MINUTES_MS, count: 15, type: 'Normal' },
  { timestamp: Date.now() - TWO_MINUTES_MS, count: 5, type: 'Warning' },
  { timestamp: Date.now() - MS_PER_MINUTE, count: 10, type: 'Normal' },
  { timestamp: Date.now(), count: 7, type: 'Warning' },
]

// Security issues demo data
export const DEMO_SECURITY_ISSUES = [
  { id: '1', severity: 'high', title: 'Pod running as root', cluster: 'prod-east', namespace: 'default' },
  { id: '2', severity: 'medium', title: 'Missing network policy', cluster: 'staging', namespace: 'apps' },
  { id: '3', severity: 'low', title: 'Deprecated API version', cluster: 'dev', namespace: 'test' },
]

// Active alerts demo data
export const DEMO_ACTIVE_ALERTS = [
  { id: '1', severity: 'critical', name: 'HighCPUUsage', cluster: 'prod-east', message: 'CPU > 90% for 5m' },
  { id: '2', severity: 'warning', name: 'PodCrashLooping', cluster: 'staging', message: 'Pod restarting frequently' },
]

// Storage overview demo data
export const DEMO_STORAGE_OVERVIEW = {
  totalCapacity: 2048,
  used: 1234,
  pvcs: 45,
  unbound: 3 }

// Network overview demo data
export const DEMO_NETWORK_OVERVIEW = {
  services: 67,
  ingresses: 12,
  networkPolicies: 23,
  loadBalancers: 5 }

// Top pods demo data
export const DEMO_TOP_PODS = [
  { name: 'api-server-7d8f9c', namespace: 'production', cpu: 850, memory: 1024, cluster: 'prod-east' },
  { name: 'ml-worker-5c6d7e', namespace: 'ml-workloads', cpu: 3200, memory: 8192, cluster: 'vllm-d' },
  { name: 'cache-redis-0', namespace: 'data', cpu: 120, memory: 512, cluster: 'staging' },
]

// GitOps drift demo data
export const DEMO_GITOPS_DRIFT = [
  { app: 'frontend', status: 'synced', cluster: 'prod-east', lastSync: Date.now() - MS_PER_MINUTE },
  { app: 'backend', status: 'drifted', cluster: 'staging', lastSync: Date.now() - FIVE_MINUTES_MS },
  { app: 'monitoring', status: 'synced', cluster: 'dev', lastSync: Date.now() - TWO_MINUTES_MS },
]

// Pod health trend demo data
export const DEMO_POD_HEALTH_TREND = [
  { timestamp: Date.now() - FIVE_MINUTES_MS, healthy: 145, unhealthy: 3 },
  { timestamp: Date.now() - FOUR_MINUTES_MS, healthy: 148, unhealthy: 2 },
  { timestamp: Date.now() - THREE_MINUTES_MS, healthy: 142, unhealthy: 5 },
  { timestamp: Date.now() - TWO_MINUTES_MS, healthy: 150, unhealthy: 1 },
  { timestamp: Date.now() - MS_PER_MINUTE, healthy: 147, unhealthy: 4 },
  { timestamp: Date.now(), healthy: 149, unhealthy: 2 },
]

// Resource trend demo data
export const DEMO_RESOURCE_TREND = [
  { timestamp: Date.now() - FIVE_MINUTES_MS, cpu: 45, memory: 62 },
  { timestamp: Date.now() - FOUR_MINUTES_MS, cpu: 52, memory: 65 },
  { timestamp: Date.now() - THREE_MINUTES_MS, cpu: 48, memory: 58 },
  { timestamp: Date.now() - TWO_MINUTES_MS, cpu: 55, memory: 70 },
  { timestamp: Date.now() - MS_PER_MINUTE, cpu: 50, memory: 67 },
  { timestamp: Date.now(), cpu: 53, memory: 64 },
]

// Compute overview demo data
export const DEMO_COMPUTE_OVERVIEW = {
  nodes: 12,
  cpuUsage: 48,
  memoryUsage: 62,
  podCount: 156 }

// ============================================================================
// Batch 4 demo data - ArgoCD, Prow, GPU, ML, Policy cards
// ============================================================================

// ArgoCD applications demo data
export const DEMO_ARGOCD_APPLICATIONS = [
  { name: 'frontend-app', project: 'production', syncStatus: 'Synced', healthStatus: 'Healthy', namespace: 'apps' },
  { name: 'backend-api', project: 'production', syncStatus: 'OutOfSync', healthStatus: 'Progressing', namespace: 'apps' },
  { name: 'monitoring', project: 'infra', syncStatus: 'Synced', healthStatus: 'Healthy', namespace: 'monitoring' },
]

// GPU inventory demo data
export const DEMO_GPU_INVENTORY = [
  { cluster: 'vllm-d', node: 'gpu-node-1', model: 'NVIDIA A100 80GB', memory: 85899345920, utilization: 72 },
  { cluster: 'vllm-d', node: 'gpu-node-2', model: 'NVIDIA A100 80GB', memory: 85899345920, utilization: 85 },
  { cluster: 'ml-train', node: 'ml-worker-1', model: 'NVIDIA H100', memory: 85899345920, utilization: 45 },
]

// Prow jobs demo data
export const DEMO_PROW_JOBS = [
  { name: 'pull-kubestellar-verify', type: 'presubmit', state: 'success', startTime: Date.now() - TWO_MINUTES_MS },
  { name: 'periodic-e2e-tests', type: 'periodic', state: 'pending', startTime: Date.now() - MS_PER_MINUTE },
  { name: 'post-kubestellar-deploy', type: 'postsubmit', state: 'failure', startTime: Date.now() - FIVE_MINUTES_MS },
]

// ML jobs demo data
export const DEMO_ML_JOBS = [
  { name: 'train-llm-v2', namespace: 'ml-workloads', status: 'Running', progress: 75, cluster: 'ml-train' },
  { name: 'fine-tune-bert', namespace: 'ml-workloads', status: 'Completed', progress: 100, cluster: 'ml-train' },
  { name: 'eval-model-v3', namespace: 'ml-eval', status: 'Pending', progress: 0, cluster: 'vllm-d' },
]

// ML notebooks demo data
export const DEMO_ML_NOTEBOOKS = [
  { name: 'data-exploration', namespace: 'ml-notebooks', status: 'Running', user: 'data-scientist', cluster: 'ml-train' },
  { name: 'model-analysis', namespace: 'ml-notebooks', status: 'Stopped', user: 'ml-engineer', cluster: 'ml-train' },
]

// OPA policies demo data
export const DEMO_OPA_POLICIES = [
  { name: 'require-labels', namespace: 'gatekeeper-system', status: 'active', violations: 3, cluster: 'prod-east' },
  { name: 'deny-privileged', namespace: 'gatekeeper-system', status: 'active', violations: 0, cluster: 'prod-east' },
  { name: 'require-requests', namespace: 'gatekeeper-system', status: 'warn', violations: 12, cluster: 'staging' },
]

// Kyverno policies demo data
export const DEMO_KYVERNO_POLICIES = [
  { name: 'require-image-tag', namespace: 'kyverno', status: 'enforce', violations: 2, cluster: 'prod-east' },
  { name: 'disallow-latest', namespace: 'kyverno', status: 'audit', violations: 5, cluster: 'staging' },
]

// Alert rules demo data
export const DEMO_ALERT_RULES = [
  { name: 'HighCPUUsage', severity: 'warning', state: 'firing', group: 'kubernetes', cluster: 'prod-east' },
  { name: 'PodCrashLooping', severity: 'critical', state: 'pending', group: 'kubernetes', cluster: 'staging' },
  { name: 'NodeNotReady', severity: 'critical', state: 'inactive', group: 'nodes', cluster: 'dev' },
]

// Chart versions demo data
export const DEMO_CHART_VERSIONS = [
  { chart: 'nginx-ingress', current: '4.6.0', latest: '4.8.0', updateAvailable: true, cluster: 'prod-east' },
  { chart: 'cert-manager', current: '1.12.0', latest: '1.12.0', updateAvailable: false, cluster: 'prod-east' },
  { chart: 'prometheus', current: '45.0.0', latest: '47.0.0', updateAvailable: true, cluster: 'monitoring' },
]

// CRD health demo data
export const DEMO_CRD_HEALTH = [
  { name: 'applications.argoproj.io', version: 'v1alpha1', status: 'healthy', instances: 15, cluster: 'prod-east' },
  { name: 'certificates.cert-manager.io', version: 'v1', status: 'healthy', instances: 8, cluster: 'prod-east' },
  { name: 'inferencepools.llm.kubestellar.io', version: 'v1', status: 'degraded', instances: 2, cluster: 'vllm-d' },
]

// Compliance score demo data
export const DEMO_COMPLIANCE_SCORE = {
  overall: 85,
  categories: [
    { name: 'Security', score: 92, passed: 46, failed: 4 },
    { name: 'Reliability', score: 78, passed: 39, failed: 11 },
    { name: 'Best Practices', score: 85, passed: 68, failed: 12 },
  ] }

// GPU workloads demo data
export const DEMO_GPU_WORKLOADS = [
  { name: 'llm-inference-7d8f', namespace: 'ml-serving', gpus: 4, model: 'A100', utilization: 85, cluster: 'vllm-d' },
  { name: 'training-job-5c6d', namespace: 'ml-training', gpus: 8, model: 'H100', utilization: 92, cluster: 'ml-train' },
]

// Deployment progress demo data
export const DEMO_DEPLOYMENT_PROGRESS = [
  { name: 'api-server', namespace: 'production', replicas: 5, ready: 5, progress: 100, status: 'complete' },
  { name: 'worker', namespace: 'production', replicas: 10, ready: 7, progress: 70, status: 'progressing' },
]

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

// ============================================================================
// Batch 6 demo data - Remaining compatible cards
// ============================================================================

// GitHub activity demo data
export const DEMO_GITHUB_ACTIVITY = [
  { type: 'PushEvent', repo: 'kubestellar/console', actor: 'developer1', timestamp: Date.now() - MS_PER_HOUR },
  { type: 'PullRequestEvent', repo: 'kubestellar/console', actor: 'developer2', timestamp: Date.now() - TWO_HOURS_MS },
  { type: 'IssuesEvent', repo: 'kubestellar/kubestellar', actor: 'contributor', timestamp: Date.now() - THREE_HOURS_MS },
]

// RSS feed demo data
export const DEMO_RSS_FEED = [
  { title: 'Kubernetes 1.30 Released', source: 'k8s.io', pubDate: Date.now() - MS_PER_DAY },
  { title: 'New CNCF Project Announcement', source: 'cncf.io', pubDate: Date.now() - TWO_DAYS_MS },
  { title: 'Cloud Native Best Practices', source: 'blog.k8s.io', pubDate: Date.now() - THREE_DAYS_MS },
]

// Kubecost overview demo data (chart/donut)
export const DEMO_KUBECOST_OVERVIEW = {
  totalCost: 12500,
  breakdown: [
    { category: 'Compute', cost: 7500 },
    { category: 'Storage', cost: 2500 },
    { category: 'Network', cost: 1500 },
    { category: 'Other', cost: 1000 },
  ] }

// OpenCost overview demo data
export const DEMO_OPENCOST_OVERVIEW = {
  totalCost: 8500,
  breakdown: [
    { category: 'CPU', cost: 4500 },
    { category: 'Memory', cost: 2500 },
    { category: 'Storage', cost: 1000 },
    { category: 'GPU', cost: 500 },
  ] }

// Cluster costs demo data
export const DEMO_CLUSTER_COSTS = [
  { cluster: 'prod-east', dailyCost: 450, monthlyCost: 13500, trend: 'up' },
  { cluster: 'staging', dailyCost: 120, monthlyCost: 3600, trend: 'stable' },
  { cluster: 'dev', dailyCost: 80, monthlyCost: 2400, trend: 'down' },
]

// ============================================================================
// Table-driven demo hook registration
// ============================================================================

export const DEMO_HOOK_TABLE: Array<{ name: string; data: unknown[] }> = [
  { name: 'useCachedClusterMetrics', data: DEMO_CLUSTER_METRICS },
  { name: 'useCachedResourceUsage', data: DEMO_RESOURCE_USAGE },
  { name: 'useCachedEventsTimeline', data: DEMO_EVENTS_TIMELINE },
  { name: 'useSecurityIssues', data: DEMO_SECURITY_ISSUES },
  { name: 'useActiveAlerts', data: DEMO_ACTIVE_ALERTS },
  { name: 'useStorageOverview', data: [DEMO_STORAGE_OVERVIEW] },
  { name: 'useNetworkOverview', data: [DEMO_NETWORK_OVERVIEW] },
  { name: 'useTopPods', data: DEMO_TOP_PODS },
  { name: 'useGitOpsDrift', data: DEMO_GITOPS_DRIFT },
  { name: 'usePodHealthTrend', data: DEMO_POD_HEALTH_TREND },
  { name: 'useResourceTrend', data: DEMO_RESOURCE_TREND },
  { name: 'useComputeOverview', data: [DEMO_COMPUTE_OVERVIEW] },
  { name: 'useArgoCDApplications', data: DEMO_ARGOCD_APPLICATIONS },
  { name: 'useGPUInventory', data: DEMO_GPU_INVENTORY },
  { name: 'useProwJobs', data: DEMO_PROW_JOBS },
  { name: 'useMLJobs', data: DEMO_ML_JOBS },
  { name: 'useMLNotebooks', data: DEMO_ML_NOTEBOOKS },
  { name: 'useOPAPolicies', data: DEMO_OPA_POLICIES },
  { name: 'useKyvernoPolicies', data: DEMO_KYVERNO_POLICIES },
  { name: 'useAlertRules', data: DEMO_ALERT_RULES },
  { name: 'useChartVersions', data: DEMO_CHART_VERSIONS },
  { name: 'useCRDHealth', data: DEMO_CRD_HEALTH },
  { name: 'useComplianceScore', data: [DEMO_COMPLIANCE_SCORE] },
  { name: 'useGPUWorkloads', data: DEMO_GPU_WORKLOADS },
  { name: 'useDeploymentProgress', data: DEMO_DEPLOYMENT_PROGRESS },
  { name: 'useArgoCDHealth', data: [DEMO_ARGOCD_HEALTH] },
  { name: 'useArgoCDSyncStatus', data: [DEMO_ARGOCD_SYNC_STATUS] },
  { name: 'useGatewayStatus', data: DEMO_GATEWAY_STATUS },
  { name: 'useKustomizationStatus', data: DEMO_KUSTOMIZATION_STATUS },
  { name: 'useProviderHealth', data: DEMO_PROVIDER_HEALTH },
  { name: 'useUpgradeStatus', data: DEMO_UPGRADE_STATUS },
  { name: 'useProwStatus', data: [DEMO_PROW_STATUS] },
  { name: 'useProwHistory', data: DEMO_PROW_HISTORY },
  { name: 'useHelmHistory', data: DEMO_HELM_HISTORY },
  { name: 'useExternalSecrets', data: [DEMO_EXTERNAL_SECRETS] },
  { name: 'useCertManager', data: [DEMO_CERT_MANAGER] },
  { name: 'useVaultSecrets', data: DEMO_VAULT_SECRETS },
  { name: 'useFalcoAlerts', data: DEMO_FALCO_ALERTS },
  { name: 'useKubescapeScan', data: [DEMO_KUBESCAPE_SCAN] },
  { name: 'useTrivyScan', data: [DEMO_TRIVY_SCAN] },
  { name: 'useEventSummary', data: [DEMO_EVENT_SUMMARY] },
  { name: 'useAppStatus', data: DEMO_APP_STATUS },
  { name: 'useGPUStatus', data: [DEMO_GPU_STATUS] },
  { name: 'useGPUUtilization', data: DEMO_GPU_UTILIZATION },
  { name: 'useGPUUsageTrend', data: DEMO_GPU_USAGE_TREND },
  { name: 'usePolicyViolations', data: DEMO_POLICY_VIOLATIONS },
  { name: 'useNamespaceOverview', data: [DEMO_NAMESPACE_OVERVIEW] },
  { name: 'useNamespaceQuotas', data: DEMO_NAMESPACE_QUOTAS },
  { name: 'useNamespaceRBAC', data: DEMO_NAMESPACE_RBAC },
  { name: 'useResourceCapacity', data: [DEMO_RESOURCE_CAPACITY] },
  { name: 'useGithubActivity', data: DEMO_GITHUB_ACTIVITY },
  { name: 'useRSSFeed', data: DEMO_RSS_FEED },
  { name: 'useKubecostOverview', data: [DEMO_KUBECOST_OVERVIEW] },
  { name: 'useOpencostOverview', data: [DEMO_OPENCOST_OVERVIEW] },
  { name: 'useClusterCosts', data: DEMO_CLUSTER_COSTS },
]
