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
} from '../../hooks/mcp'

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
}

// Auto-register when this module is imported
registerUnifiedHooks()
