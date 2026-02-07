/**
 * Unified Card System - Hook Registration
 *
 * This file registers data hooks with the unified card system.
 * Import this file early in the application (e.g., in main.tsx) to make
 * hooks available for unified cards.
 *
 * IMPORTANT: These hooks are called inside the useDataSource hook,
 * which is a React hook. The registered functions must follow React's
 * rules of hooks - they are called consistently on every render.
 */

import { useState, useEffect, useMemo } from 'react'
import { registerDataHook } from './card/hooks/useDataSource'
import {
  useCachedPodIssues,
  useCachedEvents,
  useCachedDeployments,
  useCachedDeploymentIssues,
} from '../../hooks/useCachedData'
import {
  useClusters,
  usePVCs,
  useServices,
  useOperators,
  useHelmReleases,
  useConfigMaps,
  useSecrets,
  useIngresses,
  useNodes,
  useJobs,
  useCronJobs,
  useStatefulSets,
  useDaemonSets,
  useHPAs,
  useReplicaSets,
  usePVs,
  useResourceQuotas,
  useLimitRanges,
  useNetworkPolicies,
  useNamespaces,
  useOperatorSubscriptions,
  useServiceAccounts,
  useK8sRoles,
  useK8sRoleBindings,
} from '../../hooks/mcp'
import {
  useServiceExports,
  useServiceImports,
} from '../../hooks/useMCS'

// ============================================================================
// Wrapper hooks that convert params object to positional args
// These are React hooks that can be safely registered
// ============================================================================

function useUnifiedPodIssues(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useCachedPodIssues(cluster, namespace)
  return {
    data: result.data,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: () => { result.refetch() },
  }
}

function useUnifiedEvents(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useCachedEvents(cluster, namespace)
  return {
    data: result.data,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: () => { result.refetch() },
  }
}

function useUnifiedDeployments(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useCachedDeployments(cluster, namespace)
  return {
    data: result.data,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: () => { result.refetch() },
  }
}

function useUnifiedClusters() {
  const result = useClusters()
  return {
    data: result.clusters,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedPVCs(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = usePVCs(cluster, namespace)
  return {
    data: result.pvcs,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedServices(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useServices(cluster, namespace)
  return {
    data: result.services,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedDeploymentIssues(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useCachedDeploymentIssues(cluster, namespace)
  return {
    data: result.issues,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedOperators(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const result = useOperators(cluster)
  return {
    data: result.operators,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedHelmReleases(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const result = useHelmReleases(cluster)
  return {
    data: result.releases,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedConfigMaps(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useConfigMaps(cluster, namespace)
  return {
    data: result.configmaps,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedSecrets(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useSecrets(cluster, namespace)
  return {
    data: result.secrets,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedIngresses(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useIngresses(cluster, namespace)
  return {
    data: result.ingresses,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedNodes(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const result = useNodes(cluster)
  return {
    data: result.nodes,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedJobs(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useJobs(cluster, namespace)
  return {
    data: result.jobs,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedCronJobs(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useCronJobs(cluster, namespace)
  return {
    data: result.cronjobs,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedStatefulSets(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useStatefulSets(cluster, namespace)
  return {
    data: result.statefulsets,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedDaemonSets(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useDaemonSets(cluster, namespace)
  return {
    data: result.daemonsets,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedHPAs(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useHPAs(cluster, namespace)
  return {
    data: result.hpas,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedReplicaSets(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useReplicaSets(cluster, namespace)
  return {
    data: result.replicasets,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedPVs(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const result = usePVs(cluster)
  return {
    data: result.pvs,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedResourceQuotas(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useResourceQuotas(cluster, namespace)
  return {
    data: result.resourceQuotas,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedLimitRanges(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useLimitRanges(cluster, namespace)
  return {
    data: result.limitRanges,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedNetworkPolicies(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useNetworkPolicies(cluster, namespace)
  return {
    data: result.networkpolicies,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedNamespaces(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const result = useNamespaces(cluster)
  return {
    data: result.namespaces,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedOperatorSubscriptions(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const result = useOperatorSubscriptions(cluster)
  return {
    data: result.subscriptions,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedServiceAccounts(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useServiceAccounts(cluster, namespace)
  return {
    data: result.serviceAccounts,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedK8sRoles(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useK8sRoles(cluster, namespace)
  return {
    data: result.roles,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedK8sRoleBindings(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useK8sRoleBindings(cluster, namespace)
  return {
    data: result.bindings,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedServiceExports(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useServiceExports(cluster, namespace)
  return {
    data: result.exports,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

function useUnifiedServiceImports(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useServiceImports(cluster, namespace)
  return {
    data: result.imports,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: result.refetch,
  }
}

// ============================================================================
// Demo data hooks for cards that don't have real data hooks yet
// These return static demo data for visualization purposes
// ============================================================================

function useDemoDataHook<T>(demoData: T[]) {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500)
    return () => clearTimeout(timer)
  }, [])

  return {
    data: isLoading ? [] : demoData,
    isLoading,
    error: null,
    refetch: () => {},
  }
}

// Cluster metrics demo data
const DEMO_CLUSTER_METRICS = [
  { timestamp: Date.now() - 300000, cpu: 45, memory: 62, pods: 156 },
  { timestamp: Date.now() - 240000, cpu: 48, memory: 64, pods: 158 },
  { timestamp: Date.now() - 180000, cpu: 42, memory: 61, pods: 155 },
  { timestamp: Date.now() - 120000, cpu: 51, memory: 67, pods: 162 },
  { timestamp: Date.now() - 60000, cpu: 47, memory: 65, pods: 159 },
  { timestamp: Date.now(), cpu: 49, memory: 66, pods: 161 },
]

// Resource usage demo data
const DEMO_RESOURCE_USAGE = [
  { cluster: 'prod-east', cpu: 72, memory: 68, storage: 45 },
  { cluster: 'staging', cpu: 35, memory: 42, storage: 28 },
  { cluster: 'dev', cpu: 15, memory: 22, storage: 12 },
]

// Events timeline demo data
const DEMO_EVENTS_TIMELINE = [
  { timestamp: Date.now() - 300000, count: 12, type: 'Normal' },
  { timestamp: Date.now() - 240000, count: 8, type: 'Warning' },
  { timestamp: Date.now() - 180000, count: 15, type: 'Normal' },
  { timestamp: Date.now() - 120000, count: 5, type: 'Warning' },
  { timestamp: Date.now() - 60000, count: 10, type: 'Normal' },
  { timestamp: Date.now(), count: 7, type: 'Warning' },
]

// Security issues demo data
const DEMO_SECURITY_ISSUES = [
  { id: '1', severity: 'high', title: 'Pod running as root', cluster: 'prod-east', namespace: 'default' },
  { id: '2', severity: 'medium', title: 'Missing network policy', cluster: 'staging', namespace: 'apps' },
  { id: '3', severity: 'low', title: 'Deprecated API version', cluster: 'dev', namespace: 'test' },
]

// Active alerts demo data
const DEMO_ACTIVE_ALERTS = [
  { id: '1', severity: 'critical', name: 'HighCPUUsage', cluster: 'prod-east', message: 'CPU > 90% for 5m' },
  { id: '2', severity: 'warning', name: 'PodCrashLooping', cluster: 'staging', message: 'Pod restarting frequently' },
]

// Storage overview demo data
const DEMO_STORAGE_OVERVIEW = {
  totalCapacity: 2048,
  used: 1234,
  pvcs: 45,
  unbound: 3,
}

// Network overview demo data
const DEMO_NETWORK_OVERVIEW = {
  services: 67,
  ingresses: 12,
  networkPolicies: 23,
  loadBalancers: 5,
}

// Top pods demo data
const DEMO_TOP_PODS = [
  { name: 'api-server-7d8f9c', namespace: 'production', cpu: 850, memory: 1024, cluster: 'prod-east' },
  { name: 'ml-worker-5c6d7e', namespace: 'ml-workloads', cpu: 3200, memory: 8192, cluster: 'vllm-d' },
  { name: 'cache-redis-0', namespace: 'data', cpu: 120, memory: 512, cluster: 'staging' },
]

// GitOps drift demo data
const DEMO_GITOPS_DRIFT = [
  { app: 'frontend', status: 'synced', cluster: 'prod-east', lastSync: Date.now() - 60000 },
  { app: 'backend', status: 'drifted', cluster: 'staging', lastSync: Date.now() - 300000 },
  { app: 'monitoring', status: 'synced', cluster: 'dev', lastSync: Date.now() - 120000 },
]

// Pod health trend demo data
const DEMO_POD_HEALTH_TREND = [
  { timestamp: Date.now() - 300000, healthy: 145, unhealthy: 3 },
  { timestamp: Date.now() - 240000, healthy: 148, unhealthy: 2 },
  { timestamp: Date.now() - 180000, healthy: 142, unhealthy: 5 },
  { timestamp: Date.now() - 120000, healthy: 150, unhealthy: 1 },
  { timestamp: Date.now() - 60000, healthy: 147, unhealthy: 4 },
  { timestamp: Date.now(), healthy: 149, unhealthy: 2 },
]

// Resource trend demo data
const DEMO_RESOURCE_TREND = [
  { timestamp: Date.now() - 300000, cpu: 45, memory: 62 },
  { timestamp: Date.now() - 240000, cpu: 52, memory: 65 },
  { timestamp: Date.now() - 180000, cpu: 48, memory: 58 },
  { timestamp: Date.now() - 120000, cpu: 55, memory: 70 },
  { timestamp: Date.now() - 60000, cpu: 50, memory: 67 },
  { timestamp: Date.now(), cpu: 53, memory: 64 },
]

// Compute overview demo data
const DEMO_COMPUTE_OVERVIEW = {
  nodes: 12,
  cpuUsage: 48,
  memoryUsage: 62,
  podCount: 156,
}

// ============================================================================
// Batch 4 demo data - ArgoCD, Prow, GPU, ML, Policy cards
// ============================================================================

// ArgoCD applications demo data
const DEMO_ARGOCD_APPLICATIONS = [
  { name: 'frontend-app', project: 'production', syncStatus: 'Synced', healthStatus: 'Healthy', namespace: 'apps' },
  { name: 'backend-api', project: 'production', syncStatus: 'OutOfSync', healthStatus: 'Progressing', namespace: 'apps' },
  { name: 'monitoring', project: 'infra', syncStatus: 'Synced', healthStatus: 'Healthy', namespace: 'monitoring' },
]

// GPU inventory demo data
const DEMO_GPU_INVENTORY = [
  { cluster: 'vllm-d', node: 'gpu-node-1', model: 'NVIDIA A100 80GB', memory: 85899345920, utilization: 72 },
  { cluster: 'vllm-d', node: 'gpu-node-2', model: 'NVIDIA A100 80GB', memory: 85899345920, utilization: 85 },
  { cluster: 'ml-train', node: 'ml-worker-1', model: 'NVIDIA H100', memory: 85899345920, utilization: 45 },
]

// Prow jobs demo data
const DEMO_PROW_JOBS = [
  { name: 'pull-kubestellar-verify', type: 'presubmit', state: 'success', startTime: Date.now() - 120000 },
  { name: 'periodic-e2e-tests', type: 'periodic', state: 'pending', startTime: Date.now() - 60000 },
  { name: 'post-kubestellar-deploy', type: 'postsubmit', state: 'failure', startTime: Date.now() - 300000 },
]

// ML jobs demo data
const DEMO_ML_JOBS = [
  { name: 'train-llm-v2', namespace: 'ml-workloads', status: 'Running', progress: 75, cluster: 'ml-train' },
  { name: 'fine-tune-bert', namespace: 'ml-workloads', status: 'Completed', progress: 100, cluster: 'ml-train' },
  { name: 'eval-model-v3', namespace: 'ml-eval', status: 'Pending', progress: 0, cluster: 'vllm-d' },
]

// ML notebooks demo data
const DEMO_ML_NOTEBOOKS = [
  { name: 'data-exploration', namespace: 'ml-notebooks', status: 'Running', user: 'data-scientist', cluster: 'ml-train' },
  { name: 'model-analysis', namespace: 'ml-notebooks', status: 'Stopped', user: 'ml-engineer', cluster: 'ml-train' },
]

// OPA policies demo data
const DEMO_OPA_POLICIES = [
  { name: 'require-labels', namespace: 'gatekeeper-system', status: 'active', violations: 3, cluster: 'prod-east' },
  { name: 'deny-privileged', namespace: 'gatekeeper-system', status: 'active', violations: 0, cluster: 'prod-east' },
  { name: 'require-requests', namespace: 'gatekeeper-system', status: 'warn', violations: 12, cluster: 'staging' },
]

// Kyverno policies demo data
const DEMO_KYVERNO_POLICIES = [
  { name: 'require-image-tag', namespace: 'kyverno', status: 'enforce', violations: 2, cluster: 'prod-east' },
  { name: 'disallow-latest', namespace: 'kyverno', status: 'audit', violations: 5, cluster: 'staging' },
]

// Alert rules demo data
const DEMO_ALERT_RULES = [
  { name: 'HighCPUUsage', severity: 'warning', state: 'firing', group: 'kubernetes', cluster: 'prod-east' },
  { name: 'PodCrashLooping', severity: 'critical', state: 'pending', group: 'kubernetes', cluster: 'staging' },
  { name: 'NodeNotReady', severity: 'critical', state: 'inactive', group: 'nodes', cluster: 'dev' },
]

// Chart versions demo data
const DEMO_CHART_VERSIONS = [
  { chart: 'nginx-ingress', current: '4.6.0', latest: '4.8.0', updateAvailable: true, cluster: 'prod-east' },
  { chart: 'cert-manager', current: '1.12.0', latest: '1.12.0', updateAvailable: false, cluster: 'prod-east' },
  { chart: 'prometheus', current: '45.0.0', latest: '47.0.0', updateAvailable: true, cluster: 'monitoring' },
]

// CRD health demo data
const DEMO_CRD_HEALTH = [
  { name: 'applications.argoproj.io', version: 'v1alpha1', status: 'healthy', instances: 15, cluster: 'prod-east' },
  { name: 'certificates.cert-manager.io', version: 'v1', status: 'healthy', instances: 8, cluster: 'prod-east' },
  { name: 'inferencepools.llm.kubestellar.io', version: 'v1', status: 'degraded', instances: 2, cluster: 'vllm-d' },
]

// Compliance score demo data
const DEMO_COMPLIANCE_SCORE = {
  overall: 85,
  categories: [
    { name: 'Security', score: 92, passed: 46, failed: 4 },
    { name: 'Reliability', score: 78, passed: 39, failed: 11 },
    { name: 'Best Practices', score: 85, passed: 68, failed: 12 },
  ],
}

// Namespace events demo data
const DEMO_NAMESPACE_EVENTS = [
  { type: 'Normal', reason: 'Scheduled', message: 'Pod scheduled', object: 'pod/api-7d8f', namespace: 'production', count: 1, lastSeen: Date.now() - 30000 },
  { type: 'Warning', reason: 'BackOff', message: 'Container restarting', object: 'pod/worker-5c6d', namespace: 'production', count: 5, lastSeen: Date.now() - 60000 },
]

// GPU overview demo data
const DEMO_GPU_OVERVIEW = {
  totalGPUs: 24,
  allocatedGPUs: 18,
  utilizationAvg: 72,
  memoryUsageAvg: 68,
}

// GPU workloads demo data
const DEMO_GPU_WORKLOADS = [
  { name: 'llm-inference-7d8f', namespace: 'ml-serving', gpus: 4, model: 'A100', utilization: 85, cluster: 'vllm-d' },
  { name: 'training-job-5c6d', namespace: 'ml-training', gpus: 8, model: 'H100', utilization: 92, cluster: 'ml-train' },
]

// Deployment progress demo data
const DEMO_DEPLOYMENT_PROGRESS = [
  { name: 'api-server', namespace: 'production', replicas: 5, ready: 5, progress: 100, status: 'complete' },
  { name: 'worker', namespace: 'production', replicas: 10, ready: 7, progress: 70, status: 'progressing' },
]

// ============================================================================
// Filtered event hooks
// These provide pre-filtered event data for specific card types
// ============================================================================

function useWarningEvents(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useCachedEvents(cluster, namespace)

  // Filter to only warning events
  const warningEvents = useMemo(() => {
    if (!result.data) return []
    return result.data.filter(e => e.type === 'Warning')
  }, [result.data])

  return {
    data: warningEvents,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: () => { result.refetch() },
  }
}

function useRecentEvents(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useCachedEvents(cluster, namespace)

  // Filter to events within the last hour
  const recentEvents = useMemo(() => {
    if (!result.data) return []
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    return result.data.filter(e => {
      if (!e.lastSeen) return false
      return new Date(e.lastSeen).getTime() >= oneHourAgo
    })
  }, [result.data])

  return {
    data: recentEvents,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: () => { result.refetch() },
  }
}

// Demo hook factories
function useClusterMetrics() {
  return useDemoDataHook(DEMO_CLUSTER_METRICS)
}

function useResourceUsage() {
  return useDemoDataHook(DEMO_RESOURCE_USAGE)
}

function useEventsTimeline() {
  return useDemoDataHook(DEMO_EVENTS_TIMELINE)
}

function useSecurityIssues() {
  return useDemoDataHook(DEMO_SECURITY_ISSUES)
}

function useActiveAlerts() {
  return useDemoDataHook(DEMO_ACTIVE_ALERTS)
}

function useStorageOverview() {
  return useDemoDataHook([DEMO_STORAGE_OVERVIEW])
}

function useNetworkOverview() {
  return useDemoDataHook([DEMO_NETWORK_OVERVIEW])
}

function useTopPods() {
  return useDemoDataHook(DEMO_TOP_PODS)
}

function useGitOpsDrift() {
  return useDemoDataHook(DEMO_GITOPS_DRIFT)
}

function usePodHealthTrend() {
  return useDemoDataHook(DEMO_POD_HEALTH_TREND)
}

function useResourceTrend() {
  return useDemoDataHook(DEMO_RESOURCE_TREND)
}

function useComputeOverview() {
  return useDemoDataHook([DEMO_COMPUTE_OVERVIEW])
}

// ============================================================================
// Batch 4 demo hooks - ArgoCD, Prow, GPU, ML, Policy cards
// ============================================================================

function useArgoCDApplications() {
  return useDemoDataHook(DEMO_ARGOCD_APPLICATIONS)
}

function useGPUInventory() {
  return useDemoDataHook(DEMO_GPU_INVENTORY)
}

function useProwJobs() {
  return useDemoDataHook(DEMO_PROW_JOBS)
}

function useMLJobs() {
  return useDemoDataHook(DEMO_ML_JOBS)
}

function useMLNotebooks() {
  return useDemoDataHook(DEMO_ML_NOTEBOOKS)
}

function useOPAPolicies() {
  return useDemoDataHook(DEMO_OPA_POLICIES)
}

function useKyvernoPolicies() {
  return useDemoDataHook(DEMO_KYVERNO_POLICIES)
}

function useAlertRules() {
  return useDemoDataHook(DEMO_ALERT_RULES)
}

function useChartVersions() {
  return useDemoDataHook(DEMO_CHART_VERSIONS)
}

function useCRDHealth() {
  return useDemoDataHook(DEMO_CRD_HEALTH)
}

function useComplianceScore() {
  return useDemoDataHook([DEMO_COMPLIANCE_SCORE])
}

function useNamespaceEvents(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useCachedEvents(cluster, namespace)

  // Filter to specific namespace if provided
  const namespaceEvents = useMemo(() => {
    if (!result.data) return []
    if (!namespace) return result.data.slice(0, 20)
    return result.data.filter(e => e.namespace === namespace)
  }, [result.data, namespace])

  return {
    data: namespaceEvents.length > 0 ? namespaceEvents : DEMO_NAMESPACE_EVENTS,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: () => { result.refetch() },
  }
}

function useGPUOverview() {
  return useDemoDataHook([DEMO_GPU_OVERVIEW])
}

function useGPUWorkloads() {
  return useDemoDataHook(DEMO_GPU_WORKLOADS)
}

function useDeploymentProgress() {
  return useDemoDataHook(DEMO_DEPLOYMENT_PROGRESS)
}

// ============================================================================
// Register all data hooks for use in unified cards
// Call this once at application startup
// ============================================================================

export function registerUnifiedHooks(): void {
  // Real data hooks (wrapped to match unified interface)
  registerDataHook('useCachedPodIssues', useUnifiedPodIssues)
  registerDataHook('useCachedEvents', useUnifiedEvents)
  registerDataHook('useCachedDeployments', useUnifiedDeployments)
  registerDataHook('useClusters', useUnifiedClusters)
  registerDataHook('usePVCs', useUnifiedPVCs)
  registerDataHook('useServices', useUnifiedServices)
  registerDataHook('useCachedDeploymentIssues', useUnifiedDeploymentIssues)
  registerDataHook('useOperators', useUnifiedOperators)
  registerDataHook('useHelmReleases', useUnifiedHelmReleases)
  registerDataHook('useConfigMaps', useUnifiedConfigMaps)
  registerDataHook('useSecrets', useUnifiedSecrets)
  registerDataHook('useIngresses', useUnifiedIngresses)
  registerDataHook('useNodes', useUnifiedNodes)
  registerDataHook('useJobs', useUnifiedJobs)
  registerDataHook('useCronJobs', useUnifiedCronJobs)
  registerDataHook('useStatefulSets', useUnifiedStatefulSets)
  registerDataHook('useDaemonSets', useUnifiedDaemonSets)
  registerDataHook('useHPAs', useUnifiedHPAs)
  registerDataHook('useReplicaSets', useUnifiedReplicaSets)
  registerDataHook('usePVs', useUnifiedPVs)
  registerDataHook('useResourceQuotas', useUnifiedResourceQuotas)
  registerDataHook('useLimitRanges', useUnifiedLimitRanges)
  registerDataHook('useNetworkPolicies', useUnifiedNetworkPolicies)
  registerDataHook('useNamespaces', useUnifiedNamespaces)
  registerDataHook('useOperatorSubscriptions', useUnifiedOperatorSubscriptions)
  registerDataHook('useServiceAccounts', useUnifiedServiceAccounts)
  registerDataHook('useK8sRoles', useUnifiedK8sRoles)
  registerDataHook('useK8sRoleBindings', useUnifiedK8sRoleBindings)
  registerDataHook('useServiceExports', useUnifiedServiceExports)
  registerDataHook('useServiceImports', useUnifiedServiceImports)

  // Filtered event hooks
  registerDataHook('useWarningEvents', useWarningEvents)
  registerDataHook('useRecentEvents', useRecentEvents)

  // Demo data hooks for cards without real data sources yet
  registerDataHook('useCachedClusterMetrics', useClusterMetrics)
  registerDataHook('useCachedResourceUsage', useResourceUsage)
  registerDataHook('useCachedEventsTimeline', useEventsTimeline)
  registerDataHook('useSecurityIssues', useSecurityIssues)
  registerDataHook('useActiveAlerts', useActiveAlerts)
  registerDataHook('useStorageOverview', useStorageOverview)
  registerDataHook('useNetworkOverview', useNetworkOverview)
  registerDataHook('useTopPods', useTopPods)
  registerDataHook('useGitOpsDrift', useGitOpsDrift)
  registerDataHook('usePodHealthTrend', usePodHealthTrend)
  registerDataHook('useResourceTrend', useResourceTrend)
  registerDataHook('useComputeOverview', useComputeOverview)

  // Batch 4 - ArgoCD, Prow, GPU, ML, Policy cards
  registerDataHook('useArgoCDApplications', useArgoCDApplications)
  registerDataHook('useGPUInventory', useGPUInventory)
  registerDataHook('useProwJobs', useProwJobs)
  registerDataHook('useMLJobs', useMLJobs)
  registerDataHook('useMLNotebooks', useMLNotebooks)
  registerDataHook('useOPAPolicies', useOPAPolicies)
  registerDataHook('useKyvernoPolicies', useKyvernoPolicies)
  registerDataHook('useAlertRules', useAlertRules)
  registerDataHook('useChartVersions', useChartVersions)
  registerDataHook('useCRDHealth', useCRDHealth)
  registerDataHook('useComplianceScore', useComplianceScore)
  registerDataHook('useNamespaceEvents', useNamespaceEvents)
  registerDataHook('useGPUOverview', useGPUOverview)
  registerDataHook('useGPUWorkloads', useGPUWorkloads)
  registerDataHook('useDeploymentProgress', useDeploymentProgress)
}

// Auto-register when this module is imported
registerUnifiedHooks()
