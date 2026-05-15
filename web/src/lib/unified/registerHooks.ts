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
 *
 * Time constants imported from lib/constants/time.
 */

import { useState, useEffect } from 'react'
import { useDemoMode } from '../../hooks/useDemoMode'
import { registerDataHook } from './card/hooks/useDataSource'
import { SHORT_DELAY_MS } from '../constants/network'
import { MS_PER_SECOND, MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from '../constants/time'
import {
  useCachedPodIssues,
  useCachedEvents,
  useCachedDeployments,
  useCachedDeploymentIssues } from '../../hooks/useCachedData'
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
  useK8sRoleBindings } from '../../hooks/mcp'
import {
  useServiceExports,
  useServiceImports } from '../../hooks/useMCS'
import { useFluxStatus } from '../../components/cards/flux_status/useFluxStatus'
import { useCachedBackstage } from '../../hooks/useCachedBackstage'
import { useContourStatus } from '../../components/cards/contour_status/useContourStatus'
import { useChaosMeshStatus } from '../../components/cards/chaos_mesh_status/useChaosMeshStatus'
import { useCachedContainerd } from '../../hooks/useCachedContainerd'
import { useCachedCortex } from '../../hooks/useCachedCortex'
import { useCachedDapr } from '../../hooks/useCachedDapr'
import { useCachedDragonfly } from '../../hooks/useCachedDragonfly'
import { useCachedEnvoy } from '../../components/cards/envoy_status/useCachedEnvoy'
import { useCachedGrpc } from '../../hooks/useCachedGrpc'
import { useCachedKeda } from '../../hooks/useCachedKeda'
import { useCachedKserve } from '../../hooks/useCachedKserve'
import { useCachedKubevela } from '../../hooks/useCachedKubevela'
import { useCachedLinkerd } from '../../hooks/useCachedLinkerd'
import { useCachedOpenfeature } from '../../hooks/useCachedOpenfeature'
import { useCachedLonghorn } from '../../hooks/useCachedLonghorn'
import { useCachedOpenfga } from '../../hooks/useCachedOpenfga'
import { useCachedOtel } from '../../hooks/useCachedOtel'
import { useCachedRook } from '../../hooks/useCachedRook'
import { useCachedSpiffe } from '../../hooks/useCachedSpiffe'
import { useCachedCni } from '../../hooks/useCachedCni'
import { useCachedSpire } from '../../hooks/useCachedSpire'
import { useCachedStrimzi } from '../../hooks/useCachedStrimzi'
import { useCachedFlatcar } from '../../hooks/useCachedFlatcar'
import { useCachedTikv } from '../../hooks/useCachedTikv'
import { useCachedTuf } from '../../hooks/useCachedTuf'
import { useCachedCloudCustodian } from '../../hooks/useCachedCloudCustodian'
import { useCachedVitess } from '../../hooks/useCachedVitess'
import { useCachedWasmcloud } from '../../hooks/useCachedWasmcloud'
import { useCachedVolcano } from '../../hooks/useCachedVolcano'

const THIRTY_SECONDS_MS = 30 * MS_PER_SECOND
const TWO_MINUTES_MS = 2 * MS_PER_MINUTE
const THREE_MINUTES_MS = 3 * MS_PER_MINUTE
const FOUR_MINUTES_MS = 4 * MS_PER_MINUTE
const FIVE_MINUTES_MS = 5 * MS_PER_MINUTE
const TEN_MINUTES_MS = 10 * MS_PER_MINUTE
const FIFTEEN_MINUTES_MS = 15 * MS_PER_MINUTE
const THIRTY_MINUTES_MS = 30 * MS_PER_MINUTE
const FORTY_FIVE_MINUTES_MS = 45 * MS_PER_MINUTE
const TWO_HOURS_MS = 2 * MS_PER_HOUR
const THREE_HOURS_MS = 3 * MS_PER_HOUR
const TWO_DAYS_MS = 2 * MS_PER_DAY
const THREE_DAYS_MS = 3 * MS_PER_DAY

// ============================================================================
// Factory-generated hook registration config
// ============================================================================

type ResourceArity = 'none' | 'cluster' | 'cluster+namespace'

interface ResourceHookConfig {
  useHook: (...args: any[]) => any
  dataField: string
  arity: ResourceArity
  wrapRefetch?: boolean
  extra?: (result: any) => Record<string, unknown>
  dataFallback?: unknown
}

function createUnifiedResourceHook(config: ResourceHookConfig) {
  return function useUnifiedResource(params?: Record<string, unknown>) {
    const cluster = config.arity !== 'none' ? (params?.cluster as string | undefined) : undefined
    const namespace = config.arity === 'cluster+namespace' ? (params?.namespace as string | undefined) : undefined

    const result = config.arity === 'none'
      ? config.useHook()
      : config.arity === 'cluster'
        ? config.useHook(cluster)
        : config.useHook(cluster, namespace)

    const data = config.dataFallback !== undefined
      ? (result[config.dataField] || config.dataFallback)
      : result[config.dataField]

    return {
      data,
      isLoading: result.isLoading,
      error: result.error ? new Error(result.error) : null,
      refetch: config.wrapRefetch ? () => { result.refetch() } : result.refetch,
      ...(config.extra ? config.extra(result) : {}),
    }
  }
}

interface CachedStatusHookConfig {
  useCachedHook: () => any
  dataField: string
  loadingField: 'showSkeleton' | 'isLoading'
  errorMode: 'message' | 'passthrough' | 'isFailed'
  errorMsg?: string
  wrapRefetch?: boolean
  optionalData?: boolean
  refetchOverride?: (result: any) => (() => void | Promise<void>)
}

function createUnifiedCachedHook(config: CachedStatusHookConfig) {
  return function useUnifiedCachedStatus() {
    const result = config.useCachedHook()

    const data = config.optionalData
      ? (result.data?.[config.dataField] ?? [])
      : result.data[config.dataField]

    const isLoading = result[config.loadingField]

    let error: Error | null = null
    if (config.errorMode === 'message') {
      error = result.error ? new Error(config.errorMsg!) : null
    } else if (config.errorMode === 'passthrough') {
      error = result.error ? new Error(result.error) : null
    } else if (config.errorMode === 'isFailed') {
      error = result.isFailed ? new Error(config.errorMsg!) : null
    }

    const refetch = config.refetchOverride
      ? config.refetchOverride(result)
      : config.wrapRefetch
        ? () => { result.refetch() }
        : (result.refetch ?? (() => {}))

    return {
      data,
      isLoading,
      error,
      refetch,
    }
  }
}

const RESOURCE_HOOKS: Array<ResourceHookConfig & { name: string }> = [
  { name: 'useCachedPodIssues', useHook: useCachedPodIssues, dataField: 'data', arity: 'cluster+namespace', wrapRefetch: true },
  { name: 'useCachedEvents', useHook: useCachedEvents, dataField: 'data', arity: 'cluster+namespace', wrapRefetch: true },
  { name: 'useCachedDeployments', useHook: useCachedDeployments, dataField: 'data', arity: 'cluster+namespace', wrapRefetch: true },
  { name: 'useClusters', useHook: useClusters, dataField: 'clusters', arity: 'none' },
  { name: 'usePVCs', useHook: usePVCs, dataField: 'pvcs', arity: 'cluster+namespace' },
  { name: 'useServices', useHook: useServices, dataField: 'services', arity: 'cluster+namespace' },
  { name: 'useCachedDeploymentIssues', useHook: useCachedDeploymentIssues, dataField: 'issues', arity: 'cluster+namespace', dataFallback: [] },
  { name: 'useOperators', useHook: useOperators, dataField: 'operators', arity: 'cluster' },
  { name: 'useHelmReleases', useHook: useHelmReleases, dataField: 'releases', arity: 'cluster' },
  { name: 'useConfigMaps', useHook: useConfigMaps, dataField: 'configmaps', arity: 'cluster+namespace' },
  { name: 'useSecrets', useHook: useSecrets, dataField: 'secrets', arity: 'cluster+namespace' },
  { name: 'useIngresses', useHook: useIngresses, dataField: 'ingresses', arity: 'cluster+namespace', extra: (result: any) => ({ isDemoData: result.isDemoFallback }) },
  { name: 'useNodes', useHook: useNodes, dataField: 'nodes', arity: 'cluster' },
  { name: 'useJobs', useHook: useJobs, dataField: 'jobs', arity: 'cluster+namespace' },
  { name: 'useCronJobs', useHook: useCronJobs, dataField: 'cronJobs', arity: 'cluster+namespace' },
  { name: 'useStatefulSets', useHook: useStatefulSets, dataField: 'statefulSets', arity: 'cluster+namespace' },
  { name: 'useDaemonSets', useHook: useDaemonSets, dataField: 'daemonSets', arity: 'cluster+namespace' },
  { name: 'useHPAs', useHook: useHPAs, dataField: 'hpas', arity: 'cluster+namespace' },
  { name: 'useReplicaSets', useHook: useReplicaSets, dataField: 'replicaSets', arity: 'cluster+namespace' },
  { name: 'usePVs', useHook: usePVs, dataField: 'pvs', arity: 'cluster' },
  { name: 'useResourceQuotas', useHook: useResourceQuotas, dataField: 'resourceQuotas', arity: 'cluster+namespace', extra: (result: any) => ({ isDemoData: result.isDemoFallback }) },
  { name: 'useLimitRanges', useHook: useLimitRanges, dataField: 'limitRanges', arity: 'cluster+namespace' },
  { name: 'useNetworkPolicies', useHook: useNetworkPolicies, dataField: 'networkpolicies', arity: 'cluster+namespace' },
  { name: 'useNamespaces', useHook: useNamespaces, dataField: 'namespaces', arity: 'cluster' },
  { name: 'useOperatorSubscriptions', useHook: useOperatorSubscriptions, dataField: 'subscriptions', arity: 'cluster' },
  { name: 'useServiceAccounts', useHook: useServiceAccounts, dataField: 'serviceAccounts', arity: 'cluster+namespace' },
  { name: 'useK8sRoles', useHook: useK8sRoles, dataField: 'roles', arity: 'cluster+namespace' },
  { name: 'useK8sRoleBindings', useHook: useK8sRoleBindings, dataField: 'bindings', arity: 'cluster+namespace' },
  { name: 'useServiceExports', useHook: useServiceExports, dataField: 'exports', arity: 'cluster+namespace' },
  { name: 'useServiceImports', useHook: useServiceImports, dataField: 'imports', arity: 'cluster+namespace' },
]

const CACHED_STATUS_HOOKS: Array<CachedStatusHookConfig & { name: string }> = [
  { name: 'useCachedBackstage', useCachedHook: useCachedBackstage, dataField: 'plugins', loadingField: 'isLoading', errorMode: 'passthrough' },
  { name: 'useCachedContainerd', useCachedHook: useCachedContainerd, dataField: 'containers', loadingField: 'isLoading', errorMode: 'isFailed', errorMsg: 'Failed to fetch containerd status', wrapRefetch: true },
  { name: 'useCachedCortex', useCachedHook: useCachedCortex, dataField: 'components', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch Cortex status', wrapRefetch: true },
  { name: 'useCachedDapr', useCachedHook: useCachedDapr, dataField: 'components', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch Dapr status', wrapRefetch: true },
  { name: 'useCachedDragonfly', useCachedHook: useCachedDragonfly, dataField: 'components', loadingField: 'isLoading', errorMode: 'isFailed', errorMsg: 'Failed to fetch Dragonfly status', wrapRefetch: true },
  { name: 'useCachedEnvoy', useCachedHook: useCachedEnvoy, dataField: 'listeners', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch Envoy status', wrapRefetch: true },
  { name: 'useCachedGrpc', useCachedHook: useCachedGrpc, dataField: 'services', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch gRPC status', wrapRefetch: true },
  { name: 'useCachedKeda', useCachedHook: useCachedKeda, dataField: 'scaledObjects', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch KEDA status', optionalData: true, refetchOverride: () => async () => {} },
  { name: 'useCachedKserve', useCachedHook: useCachedKserve, dataField: 'services', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch KServe status', optionalData: true, wrapRefetch: true },
  { name: 'useCachedLinkerd', useCachedHook: useCachedLinkerd, dataField: 'deployments', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch Linkerd status', wrapRefetch: true },
  { name: 'useCachedLonghorn', useCachedHook: useCachedLonghorn, dataField: 'volumes', loadingField: 'isLoading', errorMode: 'passthrough' },
  { name: 'useCachedOtel', useCachedHook: useCachedOtel, dataField: 'collectors', loadingField: 'isLoading', errorMode: 'passthrough' },
  { name: 'useCachedRook', useCachedHook: useCachedRook, dataField: 'clusters', loadingField: 'isLoading', errorMode: 'passthrough' },
  { name: 'useCachedSpiffe', useCachedHook: useCachedSpiffe, dataField: 'entries', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch SPIFFE status', wrapRefetch: true },
  { name: 'useCachedCni', useCachedHook: useCachedCni, dataField: 'nodes', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch CNI status', wrapRefetch: true },
  { name: 'useCachedOpenfeature', useCachedHook: useCachedOpenfeature, dataField: 'flags', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch OpenFeature status', wrapRefetch: true },
  { name: 'useCachedSpire', useCachedHook: useCachedSpire, dataField: 'serverPods', loadingField: 'isLoading', errorMode: 'passthrough' },
  { name: 'useCachedKubevela', useCachedHook: useCachedKubevela, dataField: 'applications', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch KubeVela status', wrapRefetch: true },
  { name: 'useCachedStrimzi', useCachedHook: useCachedStrimzi, dataField: 'clusters', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch Strimzi status', wrapRefetch: true },
  { name: 'useCachedOpenfga', useCachedHook: useCachedOpenfga, dataField: 'stores', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch OpenFGA status', wrapRefetch: true },
  { name: 'useCachedFlatcar', useCachedHook: useCachedFlatcar, dataField: 'nodes', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch Flatcar status', wrapRefetch: true },
  { name: 'useCachedTikv', useCachedHook: useCachedTikv, dataField: 'stores', loadingField: 'isLoading', errorMode: 'passthrough' },
  { name: 'useCachedTuf', useCachedHook: useCachedTuf, dataField: 'roles', loadingField: 'isLoading', errorMode: 'passthrough' },
  { name: 'useCachedCloudCustodian', useCachedHook: useCachedCloudCustodian, dataField: 'policies', loadingField: 'isLoading', errorMode: 'passthrough' },
  { name: 'useCachedVitess', useCachedHook: useCachedVitess, dataField: 'keyspaces', loadingField: 'isLoading', errorMode: 'passthrough' },
  { name: 'useCachedWasmcloud', useCachedHook: useCachedWasmcloud, dataField: 'hosts', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch wasmCloud status', wrapRefetch: true },
  { name: 'useCachedVolcano', useCachedHook: useCachedVolcano, dataField: 'jobs', loadingField: 'showSkeleton', errorMode: 'message', errorMsg: 'Failed to fetch Volcano status', wrapRefetch: true },
]

// ============================================================================
// Demo data hooks for cards that don't have real data hooks yet
// These return static demo data for visualization purposes
// ============================================================================

function useDemoDataHook<T>(demoData: T[]) {
  const { isDemoMode: demoMode } = useDemoMode()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!demoMode) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    const timer = setTimeout(() => setIsLoading(false), SHORT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [demoMode])

  return {
    data: !demoMode ? [] : isLoading ? [] : demoData,
    isLoading,
    error: null,
    refetch: () => {} }
}

// Cluster metrics demo data
const DEMO_CLUSTER_METRICS = [
  { timestamp: Date.now() - FIVE_MINUTES_MS, cpu: 45, memory: 62, pods: 156 },
  { timestamp: Date.now() - FOUR_MINUTES_MS, cpu: 48, memory: 64, pods: 158 },
  { timestamp: Date.now() - THREE_MINUTES_MS, cpu: 42, memory: 61, pods: 155 },
  { timestamp: Date.now() - TWO_MINUTES_MS, cpu: 51, memory: 67, pods: 162 },
  { timestamp: Date.now() - MS_PER_MINUTE, cpu: 47, memory: 65, pods: 159 },
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
  { timestamp: Date.now() - FIVE_MINUTES_MS, count: 12, type: 'Normal' },
  { timestamp: Date.now() - FOUR_MINUTES_MS, count: 8, type: 'Warning' },
  { timestamp: Date.now() - THREE_MINUTES_MS, count: 15, type: 'Normal' },
  { timestamp: Date.now() - TWO_MINUTES_MS, count: 5, type: 'Warning' },
  { timestamp: Date.now() - MS_PER_MINUTE, count: 10, type: 'Normal' },
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
  unbound: 3 }

// Network overview demo data
const DEMO_NETWORK_OVERVIEW = {
  services: 67,
  ingresses: 12,
  networkPolicies: 23,
  loadBalancers: 5 }

// Top pods demo data
const DEMO_TOP_PODS = [
  { name: 'api-server-7d8f9c', namespace: 'production', cpu: 850, memory: 1024, cluster: 'prod-east' },
  { name: 'ml-worker-5c6d7e', namespace: 'ml-workloads', cpu: 3200, memory: 8192, cluster: 'vllm-d' },
  { name: 'cache-redis-0', namespace: 'data', cpu: 120, memory: 512, cluster: 'staging' },
]

// GitOps drift demo data
const DEMO_GITOPS_DRIFT = [
  { app: 'frontend', status: 'synced', cluster: 'prod-east', lastSync: Date.now() - MS_PER_MINUTE },
  { app: 'backend', status: 'drifted', cluster: 'staging', lastSync: Date.now() - FIVE_MINUTES_MS },
  { app: 'monitoring', status: 'synced', cluster: 'dev', lastSync: Date.now() - TWO_MINUTES_MS },
]

// Pod health trend demo data
const DEMO_POD_HEALTH_TREND = [
  { timestamp: Date.now() - FIVE_MINUTES_MS, healthy: 145, unhealthy: 3 },
  { timestamp: Date.now() - FOUR_MINUTES_MS, healthy: 148, unhealthy: 2 },
  { timestamp: Date.now() - THREE_MINUTES_MS, healthy: 142, unhealthy: 5 },
  { timestamp: Date.now() - TWO_MINUTES_MS, healthy: 150, unhealthy: 1 },
  { timestamp: Date.now() - MS_PER_MINUTE, healthy: 147, unhealthy: 4 },
  { timestamp: Date.now(), healthy: 149, unhealthy: 2 },
]

// Resource trend demo data
const DEMO_RESOURCE_TREND = [
  { timestamp: Date.now() - FIVE_MINUTES_MS, cpu: 45, memory: 62 },
  { timestamp: Date.now() - FOUR_MINUTES_MS, cpu: 52, memory: 65 },
  { timestamp: Date.now() - THREE_MINUTES_MS, cpu: 48, memory: 58 },
  { timestamp: Date.now() - TWO_MINUTES_MS, cpu: 55, memory: 70 },
  { timestamp: Date.now() - MS_PER_MINUTE, cpu: 50, memory: 67 },
  { timestamp: Date.now(), cpu: 53, memory: 64 },
]

// Compute overview demo data
const DEMO_COMPUTE_OVERVIEW = {
  nodes: 12,
  cpuUsage: 48,
  memoryUsage: 62,
  podCount: 156 }

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
  { name: 'pull-kubestellar-verify', type: 'presubmit', state: 'success', startTime: Date.now() - TWO_MINUTES_MS },
  { name: 'periodic-e2e-tests', type: 'periodic', state: 'pending', startTime: Date.now() - MS_PER_MINUTE },
  { name: 'post-kubestellar-deploy', type: 'postsubmit', state: 'failure', startTime: Date.now() - FIVE_MINUTES_MS },
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
  ] }

// Namespace events demo data
const DEMO_NAMESPACE_EVENTS = [
  { type: 'Normal', reason: 'Scheduled', message: 'Pod scheduled', object: 'pod/api-7d8f', namespace: 'production', count: 1, lastSeen: Date.now() - THIRTY_SECONDS_MS },
  { type: 'Warning', reason: 'BackOff', message: 'Container restarting', object: 'pod/worker-5c6d', namespace: 'production', count: 5, lastSeen: Date.now() - MS_PER_MINUTE },
]

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
// Batch 5 demo data - GitOps, Security, Status cards
// ============================================================================

// ArgoCD health demo data (stats-grid)
const DEMO_ARGOCD_HEALTH = {
  healthy: 12,
  degraded: 2,
  progressing: 1,
  missing: 0 }

// ArgoCD sync status demo data (stats-grid)
const DEMO_ARGOCD_SYNC_STATUS = {
  synced: 11,
  outOfSync: 3,
  unknown: 1 }

// Gateway status demo data
const DEMO_GATEWAY_STATUS = [
  { name: 'api-gateway', class: 'istio', addresses: 2, status: 'Programmed', cluster: 'prod-east' },
  { name: 'internal-gw', class: 'nginx', addresses: 1, status: 'Programmed', cluster: 'staging' },
]

// Kustomization status demo data
const DEMO_KUSTOMIZATION_STATUS = [
  { name: 'apps', namespace: 'flux-system', ready: true, lastApplied: Date.now() - TWO_MINUTES_MS },
  { name: 'infra', namespace: 'flux-system', ready: true, lastApplied: Date.now() - FIVE_MINUTES_MS },
  { name: 'monitoring', namespace: 'flux-system', ready: false, lastApplied: Date.now() - TEN_MINUTES_MS },
]

// Provider health demo data
const DEMO_PROVIDER_HEALTH = [
  { provider: 'AWS', type: 'cloud', status: 'healthy', latency: 45 },
  { provider: 'OpenAI', type: 'ai', status: 'healthy', latency: 120 },
  { provider: 'Azure', type: 'cloud', status: 'degraded', latency: 250 },
]

// Upgrade status demo data
const DEMO_UPGRADE_STATUS = [
  { cluster: 'prod-east', currentVersion: '1.28.5', availableVersion: '1.29.2', status: 'available' },
  { cluster: 'staging', currentVersion: '1.29.1', availableVersion: '1.29.2', status: 'available' },
  { cluster: 'dev', currentVersion: '1.29.2', availableVersion: '1.29.2', status: 'current' },
]

// Prow status demo data (stats-grid)
const DEMO_PROW_STATUS = {
  running: 5,
  passed: 42,
  failed: 3,
  pending: 2 }

// Prow history demo data
const DEMO_PROW_HISTORY = [
  { job: 'e2e-tests', result: 'success', duration: 1200, finishedAt: Date.now() - MS_PER_HOUR },
  { job: 'unit-tests', result: 'success', duration: 300, finishedAt: Date.now() - TWO_HOURS_MS },
  { job: 'lint', result: 'failure', duration: 60, finishedAt: Date.now() - THREE_HOURS_MS },
]

// Helm history demo data
const DEMO_HELM_HISTORY = [
  { revision: 5, chart: 'nginx-ingress-4.6.0', appVersion: '1.9.0', status: 'deployed', updated: Date.now() - MS_PER_DAY },
  { revision: 4, chart: 'nginx-ingress-4.5.2', appVersion: '1.8.0', status: 'superseded', updated: Date.now() - TWO_DAYS_MS },
]

// External secrets demo data (stats-grid)
const DEMO_EXTERNAL_SECRETS = {
  total: 25,
  ready: 23,
  failed: 2 }

// Cert manager demo data (stats-grid)
const DEMO_CERT_MANAGER = {
  certificates: 15,
  ready: 14,
  expiringSoon: 1,
  expired: 0 }

// Vault secrets demo data
const DEMO_VAULT_SECRETS = [
  { path: 'secret/data/api-keys', status: 'synced', lastSync: Date.now() - MS_PER_MINUTE },
  { path: 'secret/data/db-creds', status: 'synced', lastSync: Date.now() - TWO_MINUTES_MS },
]

// Falco alerts demo data
const DEMO_FALCO_ALERTS = [
  { rule: 'Terminal shell in container', severity: 'Warning', count: 3, lastSeen: Date.now() - FIVE_MINUTES_MS },
  { rule: 'Sensitive file read', severity: 'Notice', count: 12, lastSeen: Date.now() - TEN_MINUTES_MS },
]

// Kubescape scan demo data (stats-grid)
const DEMO_KUBESCAPE_SCAN = {
  passed: 85,
  failed: 12,
  skipped: 3,
  riskScore: 22 }

// Trivy scan demo data (stats-grid)
const DEMO_TRIVY_SCAN = {
  critical: 2,
  high: 8,
  medium: 25,
  low: 45 }

// Event summary demo data (stats-grid)
const DEMO_EVENT_SUMMARY = {
  normal: 156,
  warning: 23,
  error: 5 }

// App status demo data
const DEMO_APP_STATUS = [
  { name: 'frontend', namespace: 'production', status: 'healthy', pods: 3, cluster: 'prod-east' },
  { name: 'backend', namespace: 'production', status: 'degraded', pods: 5, cluster: 'prod-east' },
]

// GPU status demo data (stats-grid)
const DEMO_GPU_STATUS = {
  total: 24,
  available: 6,
  allocated: 18,
  errored: 0 }

// GPU utilization demo data (chart)
const DEMO_GPU_UTILIZATION = [
  { timestamp: Date.now() - FIVE_MINUTES_MS, utilization: 72, memory: 68 },
  { timestamp: Date.now() - FOUR_MINUTES_MS, utilization: 78, memory: 72 },
  { timestamp: Date.now() - THREE_MINUTES_MS, utilization: 65, memory: 60 },
  { timestamp: Date.now() - TWO_MINUTES_MS, utilization: 82, memory: 78 },
  { timestamp: Date.now() - MS_PER_MINUTE, utilization: 75, memory: 70 },
  { timestamp: Date.now(), utilization: 80, memory: 74 },
]

// GPU usage trend demo data (chart)
const DEMO_GPU_USAGE_TREND = [
  { timestamp: Date.now() - MS_PER_HOUR, avgUtilization: 68 },
  { timestamp: Date.now() - FORTY_FIVE_MINUTES_MS, avgUtilization: 72 },
  { timestamp: Date.now() - THIRTY_MINUTES_MS, avgUtilization: 78 },
  { timestamp: Date.now() - FIFTEEN_MINUTES_MS, avgUtilization: 74 },
  { timestamp: Date.now(), avgUtilization: 76 },
]

// Policy violations demo data
const DEMO_POLICY_VIOLATIONS = [
  { policy: 'require-labels', resource: 'deployment/api', namespace: 'default', severity: 'warning', cluster: 'prod-east' },
  { policy: 'deny-privileged', resource: 'pod/debug', namespace: 'kube-system', severity: 'critical', cluster: 'staging' },
]

// Namespace overview demo data (stats-grid)
const DEMO_NAMESPACE_OVERVIEW = {
  pods: 45,
  deployments: 12,
  services: 8,
  configmaps: 15 }

// Namespace quotas demo data
const DEMO_NAMESPACE_QUOTAS = [
  { namespace: 'production', cpuUsed: '4', cpuLimit: '8', memUsed: '8Gi', memLimit: '16Gi' },
  { namespace: 'staging', cpuUsed: '2', cpuLimit: '4', memUsed: '4Gi', memLimit: '8Gi' },
]

// Namespace RBAC demo data
const DEMO_NAMESPACE_RBAC = [
  { subject: 'developers', type: 'Group', role: 'edit', namespace: 'production' },
  { subject: 'ci-bot', type: 'ServiceAccount', role: 'admin', namespace: 'production' },
]

// Resource capacity demo data (stats-grid)
const DEMO_RESOURCE_CAPACITY = {
  cpuTotal: 96,
  cpuUsed: 48,
  memoryTotal: 384,
  memoryUsed: 256 }

// ============================================================================
// Batch 6 demo data - Remaining compatible cards
// ============================================================================

// GitHub activity demo data
const DEMO_GITHUB_ACTIVITY = [
  { type: 'PushEvent', repo: 'kubestellar/console', actor: 'developer1', timestamp: Date.now() - MS_PER_HOUR },
  { type: 'PullRequestEvent', repo: 'kubestellar/console', actor: 'developer2', timestamp: Date.now() - TWO_HOURS_MS },
  { type: 'IssuesEvent', repo: 'kubestellar/kubestellar', actor: 'contributor', timestamp: Date.now() - THREE_HOURS_MS },
]

// RSS feed demo data
const DEMO_RSS_FEED = [
  { title: 'Kubernetes 1.30 Released', source: 'k8s.io', pubDate: Date.now() - MS_PER_DAY },
  { title: 'New CNCF Project Announcement', source: 'cncf.io', pubDate: Date.now() - TWO_DAYS_MS },
  { title: 'Cloud Native Best Practices', source: 'blog.k8s.io', pubDate: Date.now() - THREE_DAYS_MS },
]

// Kubecost overview demo data (chart/donut)
const DEMO_KUBECOST_OVERVIEW = {
  totalCost: 12500,
  breakdown: [
    { category: 'Compute', cost: 7500 },
    { category: 'Storage', cost: 2500 },
    { category: 'Network', cost: 1500 },
    { category: 'Other', cost: 1000 },
  ] }

// OpenCost overview demo data
const DEMO_OPENCOST_OVERVIEW = {
  totalCost: 8500,
  breakdown: [
    { category: 'CPU', cost: 4500 },
    { category: 'Memory', cost: 2500 },
    { category: 'Storage', cost: 1000 },
    { category: 'GPU', cost: 500 },
  ] }

// Cluster costs demo data
const DEMO_CLUSTER_COSTS = [
  { cluster: 'prod-east', dailyCost: 450, monthlyCost: 13500, trend: 'up' },
  { cluster: 'staging', dailyCost: 120, monthlyCost: 3600, trend: 'stable' },
  { cluster: 'dev', dailyCost: 80, monthlyCost: 2400, trend: 'down' },
]

// ============================================================================
// Table-driven demo hook registration
// ============================================================================

const DEMO_HOOK_TABLE: Array<{ name: string; data: unknown[] }> = [
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

// ============================================================================
// Filtered event hooks and manual status hooks
// ============================================================================

/** Maximum namespace events to return when no namespace filter is set */
const MAX_NAMESPACE_EVENTS_UNFILTERED = 20

function useWarningEvents(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useCachedEvents(cluster, namespace)

  const warningEvents = (() => {
    if (!result.data) return []
    return result.data.filter(e => e.type === 'Warning')
  })()

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

  const recentEvents = (() => {
    if (!result.data) return []
    const oneHourAgo = Date.now() - MS_PER_HOUR
    return result.data.filter(e => {
      if (!e.lastSeen) return false
      return new Date(e.lastSeen).getTime() >= oneHourAgo
    })
  })()

  return {
    data: recentEvents,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: () => { result.refetch() },
  }
}

function useNamespaceEvents(params?: Record<string, unknown>) {
  const cluster = params?.cluster as string | undefined
  const namespace = params?.namespace as string | undefined
  const result = useCachedEvents(cluster, namespace)

  const namespaceEvents = (() => {
    if (!result.data) return []
    if (!namespace) return result.data.slice(0, MAX_NAMESPACE_EVENTS_UNFILTERED)
    return result.data.filter(e => e.namespace === namespace)
  })()

  return {
    data: namespaceEvents.length > 0 ? namespaceEvents : DEMO_NAMESPACE_EVENTS,
    isLoading: result.isLoading,
    error: result.error ? new Error(result.error) : null,
    refetch: () => { result.refetch() },
  }
}

function useUnifiedFluxStatus() {
  const result = useFluxStatus()
  const data = [
    ...result.data.resources.sources,
    ...result.data.resources.kustomizations,
    ...result.data.resources.helmReleases,
  ]

  return {
    data,
    isLoading: result.showSkeleton,
    error: result.error ? new Error('Failed to fetch Flux status') : null,
    refetch: () => {},
  }
}

function useUnifiedContourStatus() {
  const result = useContourStatus()
  return {
    data: result.data.proxies,
    isLoading: result.showSkeleton,
    error: result.error ? new Error('Failed to fetch Contour status') : null,
    refetch: () => {},
  }
}

function useUnifiedChaosMeshStatus() {
  const result = useChaosMeshStatus()
  return {
    data: result.data,
    isLoading: result.showSkeleton,
    error: result.error ? new Error('Failed to fetch Chaos Mesh status') : null,
    refetch: () => { void result.refetch() },
  }
}

// ============================================================================
// Register all data hooks for use in unified cards
// Call this once at application startup
// ============================================================================

export function registerUnifiedHooks(): void {
  for (const { name, ...config } of RESOURCE_HOOKS) {
    registerDataHook(name, createUnifiedResourceHook(config))
  }

  registerDataHook('useWarningEvents', useWarningEvents)
  registerDataHook('useRecentEvents', useRecentEvents)
  registerDataHook('useNamespaceEvents', useNamespaceEvents)
  registerDataHook('useFluxStatus', useUnifiedFluxStatus)
  registerDataHook('useContourStatus', useUnifiedContourStatus)
  registerDataHook('useChaosMeshStatus', useUnifiedChaosMeshStatus)

  for (const { name, ...config } of CACHED_STATUS_HOOKS) {
    registerDataHook(name, createUnifiedCachedHook(config))
  }

  for (const { name, data } of DEMO_HOOK_TABLE) {
    registerDataHook(name, () => useDemoDataHook(data))
  }
}

// Auto-register when this module is imported
registerUnifiedHooks()
