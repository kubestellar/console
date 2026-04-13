/**
 * Demo data for the OpenKruise status card.
 *
 * Representative of a multi-cluster environment running OpenKruise for
 * advanced workload management (CloneSet, Advanced StatefulSet, Advanced
 * DaemonSet, BroadcastJob, AdvancedCronJob) and sidecar injection
 * (SidecarSet). Used when the dashboard is in demo mode or when no
 * Kubernetes clusters are connected.
 */

/** Time offsets (in milliseconds) used for relative timestamps. */
const ONE_MINUTE_MS = 60 * 1000
const FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS
const FIFTEEN_MINUTES_MS = 15 * ONE_MINUTE_MS
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS
const THREE_HOURS_MS = 3 * ONE_HOUR_MS
const SIX_HOURS_MS = 6 * ONE_HOUR_MS
const TWELVE_HOURS_MS = 12 * ONE_HOUR_MS
const ONE_DAY_MS = 24 * ONE_HOUR_MS

/* ------------------------------------------------------------------ */
/*  CloneSets                                                          */
/* ------------------------------------------------------------------ */

export interface OpenKruiseDemoCloneSet {
  name: string
  namespace: string
  cluster: string
  replicas: number
  readyReplicas: number
  updatedReplicas: number
  updatedReadyReplicas: number
  updateStrategy: 'ReCreate' | 'InPlaceIfPossible' | 'InPlaceOnly'
  partition: number
  status: 'healthy' | 'updating' | 'degraded' | 'failed'
  image: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/*  Advanced StatefulSets                                              */
/* ------------------------------------------------------------------ */

export interface OpenKruiseDemoAdvancedStatefulSet {
  name: string
  namespace: string
  cluster: string
  replicas: number
  readyReplicas: number
  updatedReplicas: number
  podManagementPolicy: 'OrderedReady' | 'Parallel'
  updateStrategy: 'RollingUpdate' | 'InPlaceIfPossible' | 'InPlaceOnly'
  status: 'healthy' | 'updating' | 'degraded' | 'failed'
  image: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/*  Advanced DaemonSets                                                */
/* ------------------------------------------------------------------ */

export interface OpenKruiseDemoAdvancedDaemonSet {
  name: string
  namespace: string
  cluster: string
  desiredScheduled: number
  currentScheduled: number
  numberReady: number
  updatedScheduled: number
  rollingUpdateType: 'Standard' | 'Surging' | 'InPlaceIfPossible'
  status: 'healthy' | 'updating' | 'degraded' | 'failed'
  image: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/*  SidecarSets (sidecar injection)                                    */
/* ------------------------------------------------------------------ */

export interface OpenKruiseDemoSidecarSet {
  name: string
  cluster: string
  selectorLabels: Record<string, string>
  namespaceSelector: string | null
  sidecarContainers: string[]
  matchedPods: number
  injectedPods: number
  updatedPods: number
  readyPods: number
  updateStrategy: 'NotUpdate' | 'RollingUpdate'
  status: 'healthy' | 'updating' | 'degraded' | 'failed'
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/*  BroadcastJobs                                                      */
/* ------------------------------------------------------------------ */

export interface OpenKruiseDemoBroadcastJob {
  name: string
  namespace: string
  cluster: string
  desired: number
  active: number
  succeeded: number
  failed: number
  completionPolicyType: 'Always' | 'Never'
  status: 'running' | 'succeeded' | 'failed' | 'pending' | 'paused'
  startedAt: string
  completedAt: string | null
}

/* ------------------------------------------------------------------ */
/*  AdvancedCronJobs                                                   */
/* ------------------------------------------------------------------ */

export interface OpenKruiseDemoAdvancedCronJob {
  name: string
  namespace: string
  cluster: string
  schedule: string
  templateKind: 'Job' | 'BroadcastJob'
  active: number
  lastScheduleTime: string | null
  status: 'active' | 'suspended' | 'failed'
  successfulRuns: number
  failedRuns: number
}

/* ------------------------------------------------------------------ */
/*  Top-level demo data shape                                          */
/* ------------------------------------------------------------------ */

export interface OpenKruiseDemoData {
  cloneSets: OpenKruiseDemoCloneSet[]
  advancedStatefulSets: OpenKruiseDemoAdvancedStatefulSet[]
  advancedDaemonSets: OpenKruiseDemoAdvancedDaemonSet[]
  sidecarSets: OpenKruiseDemoSidecarSet[]
  broadcastJobs: OpenKruiseDemoBroadcastJob[]
  advancedCronJobs: OpenKruiseDemoAdvancedCronJob[]
  controllerVersion: string
  totalInjectedPods: number
  lastCheckTime: string
}

/* ================================================================== */
/*  Demo data                                                          */
/* ================================================================== */

export const OPENKRUISE_DEMO_DATA: OpenKruiseDemoData = {
  /* ----- CloneSets ------------------------------------------------ */
  cloneSets: [
    {
      name: 'frontend-web',
      namespace: 'apps',
      cluster: 'eks-prod-us-east-1',
      replicas: 10,
      readyReplicas: 10,
      updatedReplicas: 10,
      updatedReadyReplicas: 10,
      updateStrategy: 'InPlaceIfPossible',
      partition: 0,
      status: 'healthy',
      image: 'registry.io/frontend-web:v3.4.1',
      updatedAt: new Date(Date.now() - SIX_HOURS_MS).toISOString(),
    },
    {
      name: 'payments-api',
      namespace: 'backend',
      cluster: 'eks-prod-us-east-1',
      replicas: 6,
      readyReplicas: 4,
      updatedReplicas: 4,
      updatedReadyReplicas: 3,
      updateStrategy: 'InPlaceOnly',
      partition: 2,
      status: 'updating',
      image: 'registry.io/payments-api:v2.8.0',
      updatedAt: new Date(Date.now() - FIFTEEN_MINUTES_MS).toISOString(),
    },
    {
      name: 'order-service',
      namespace: 'backend',
      cluster: 'gke-staging',
      replicas: 4,
      readyReplicas: 2,
      updatedReplicas: 4,
      updatedReadyReplicas: 2,
      updateStrategy: 'InPlaceIfPossible',
      partition: 0,
      status: 'degraded',
      image: 'registry.io/order-service:v1.2.0',
      updatedAt: new Date(Date.now() - THREE_HOURS_MS).toISOString(),
    },
    {
      name: 'recommendation-engine',
      namespace: 'ml',
      cluster: 'eks-prod-us-east-1',
      replicas: 8,
      readyReplicas: 8,
      updatedReplicas: 8,
      updatedReadyReplicas: 8,
      updateStrategy: 'ReCreate',
      partition: 0,
      status: 'healthy',
      image: 'registry.io/recommendation:v0.9.3',
      updatedAt: new Date(Date.now() - ONE_DAY_MS).toISOString(),
    },
    {
      name: 'legacy-batch',
      namespace: 'apps',
      cluster: 'aks-dev-eu',
      replicas: 3,
      readyReplicas: 0,
      updatedReplicas: 3,
      updatedReadyReplicas: 0,
      updateStrategy: 'InPlaceIfPossible',
      partition: 0,
      status: 'failed',
      image: 'registry.io/legacy-batch:v0.4.0',
      updatedAt: new Date(Date.now() - TWELVE_HOURS_MS).toISOString(),
    },
  ],

  /* ----- Advanced StatefulSets ----------------------------------- */
  advancedStatefulSets: [
    {
      name: 'kafka-broker',
      namespace: 'messaging',
      cluster: 'eks-prod-us-east-1',
      replicas: 5,
      readyReplicas: 5,
      updatedReplicas: 5,
      podManagementPolicy: 'Parallel',
      updateStrategy: 'InPlaceIfPossible',
      status: 'healthy',
      image: 'bitnami/kafka:3.7.0',
      updatedAt: new Date(Date.now() - 2 * ONE_DAY_MS).toISOString(),
    },
    {
      name: 'redis-cluster',
      namespace: 'cache',
      cluster: 'eks-prod-us-east-1',
      replicas: 6,
      readyReplicas: 5,
      updatedReplicas: 6,
      podManagementPolicy: 'OrderedReady',
      updateStrategy: 'RollingUpdate',
      status: 'updating',
      image: 'redis:7.2.4-alpine',
      updatedAt: new Date(Date.now() - FIVE_MINUTES_MS).toISOString(),
    },
    {
      name: 'postgres-shards',
      namespace: 'data',
      cluster: 'gke-staging',
      replicas: 3,
      readyReplicas: 3,
      updatedReplicas: 3,
      podManagementPolicy: 'OrderedReady',
      updateStrategy: 'InPlaceIfPossible',
      status: 'healthy',
      image: 'postgres:16.2',
      updatedAt: new Date(Date.now() - 7 * ONE_DAY_MS).toISOString(),
    },
  ],

  /* ----- Advanced DaemonSets ------------------------------------- */
  advancedDaemonSets: [
    {
      name: 'node-exporter',
      namespace: 'monitoring',
      cluster: 'eks-prod-us-east-1',
      desiredScheduled: 12,
      currentScheduled: 12,
      numberReady: 12,
      updatedScheduled: 12,
      rollingUpdateType: 'Standard',
      status: 'healthy',
      image: 'prom/node-exporter:v1.8.1',
      updatedAt: new Date(Date.now() - ONE_DAY_MS).toISOString(),
    },
    {
      name: 'fluent-bit',
      namespace: 'logging',
      cluster: 'eks-prod-us-east-1',
      desiredScheduled: 12,
      currentScheduled: 12,
      numberReady: 11,
      updatedScheduled: 8,
      rollingUpdateType: 'Surging',
      status: 'updating',
      image: 'fluent/fluent-bit:3.0.7',
      updatedAt: new Date(Date.now() - FIFTEEN_MINUTES_MS).toISOString(),
    },
    {
      name: 'cilium-agent',
      namespace: 'kube-system',
      cluster: 'gke-staging',
      desiredScheduled: 6,
      currentScheduled: 6,
      numberReady: 4,
      updatedScheduled: 6,
      rollingUpdateType: 'InPlaceIfPossible',
      status: 'degraded',
      image: 'quay.io/cilium/cilium:v1.15.5',
      updatedAt: new Date(Date.now() - THREE_HOURS_MS).toISOString(),
    },
  ],

  /* ----- SidecarSets --------------------------------------------- */
  sidecarSets: [
    {
      name: 'log-collector-sidecar',
      cluster: 'eks-prod-us-east-1',
      selectorLabels: { 'logging.enabled': 'true' },
      namespaceSelector: null,
      sidecarContainers: ['fluent-bit'],
      matchedPods: 48,
      injectedPods: 48,
      updatedPods: 48,
      readyPods: 47,
      updateStrategy: 'RollingUpdate',
      status: 'healthy',
      updatedAt: new Date(Date.now() - TWELVE_HOURS_MS).toISOString(),
    },
    {
      name: 'envoy-mesh-sidecar',
      cluster: 'eks-prod-us-east-1',
      selectorLabels: { mesh: 'envoy', tier: 'frontend' },
      namespaceSelector: 'mesh.enabled=true',
      sidecarContainers: ['envoy', 'envoy-init'],
      matchedPods: 22,
      injectedPods: 22,
      updatedPods: 16,
      readyPods: 22,
      updateStrategy: 'RollingUpdate',
      status: 'updating',
      updatedAt: new Date(Date.now() - FIVE_MINUTES_MS).toISOString(),
    },
    {
      name: 'security-scanner-sidecar',
      cluster: 'gke-staging',
      selectorLabels: { 'security.scan': 'enabled' },
      namespaceSelector: null,
      sidecarContainers: ['falco-driver'],
      matchedPods: 14,
      injectedPods: 12,
      updatedPods: 12,
      readyPods: 10,
      updateStrategy: 'NotUpdate',
      status: 'degraded',
      updatedAt: new Date(Date.now() - SIX_HOURS_MS).toISOString(),
    },
    {
      name: 'metrics-proxy-sidecar',
      cluster: 'aks-dev-eu',
      selectorLabels: { 'metrics.scrape': 'true' },
      namespaceSelector: null,
      sidecarContainers: ['prom-proxy'],
      matchedPods: 9,
      injectedPods: 9,
      updatedPods: 9,
      readyPods: 9,
      updateStrategy: 'RollingUpdate',
      status: 'healthy',
      updatedAt: new Date(Date.now() - 3 * ONE_DAY_MS).toISOString(),
    },
  ],

  /* ----- BroadcastJobs ------------------------------------------- */
  broadcastJobs: [
    {
      name: 'image-prepull-base',
      namespace: 'kube-system',
      cluster: 'eks-prod-us-east-1',
      desired: 12,
      active: 0,
      succeeded: 12,
      failed: 0,
      completionPolicyType: 'Always',
      status: 'succeeded',
      startedAt: new Date(Date.now() - SIX_HOURS_MS).toISOString(),
      completedAt: new Date(Date.now() - SIX_HOURS_MS + FIFTEEN_MINUTES_MS).toISOString(),
    },
    {
      name: 'node-cleanup-temp',
      namespace: 'maintenance',
      cluster: 'gke-staging',
      desired: 6,
      active: 2,
      succeeded: 3,
      failed: 1,
      completionPolicyType: 'Always',
      status: 'running',
      startedAt: new Date(Date.now() - FIFTEEN_MINUTES_MS).toISOString(),
      completedAt: null,
    },
    {
      name: 'security-patch-apply',
      namespace: 'security',
      cluster: 'eks-prod-us-east-1',
      desired: 12,
      active: 0,
      succeeded: 0,
      failed: 12,
      completionPolicyType: 'Never',
      status: 'failed',
      startedAt: new Date(Date.now() - ONE_DAY_MS).toISOString(),
      completedAt: new Date(Date.now() - ONE_DAY_MS + ONE_HOUR_MS).toISOString(),
    },
  ],

  /* ----- AdvancedCronJobs ---------------------------------------- */
  advancedCronJobs: [
    {
      name: 'nightly-image-prepull',
      namespace: 'kube-system',
      cluster: 'eks-prod-us-east-1',
      schedule: '0 2 * * *',
      templateKind: 'BroadcastJob',
      active: 0,
      lastScheduleTime: new Date(Date.now() - SIX_HOURS_MS).toISOString(),
      status: 'active',
      successfulRuns: 47,
      failedRuns: 1,
    },
    {
      name: 'weekly-node-audit',
      namespace: 'security',
      cluster: 'eks-prod-us-east-1',
      schedule: '0 3 * * 0',
      templateKind: 'BroadcastJob',
      active: 0,
      lastScheduleTime: new Date(Date.now() - 3 * ONE_DAY_MS).toISOString(),
      status: 'active',
      successfulRuns: 12,
      failedRuns: 0,
    },
    {
      name: 'staging-cleanup',
      namespace: 'maintenance',
      cluster: 'gke-staging',
      schedule: '*/15 * * * *',
      templateKind: 'Job',
      active: 1,
      lastScheduleTime: new Date(Date.now() - FIVE_MINUTES_MS).toISOString(),
      status: 'active',
      successfulRuns: 192,
      failedRuns: 4,
    },
    {
      name: 'legacy-report',
      namespace: 'reporting',
      cluster: 'aks-dev-eu',
      schedule: '0 0 1 * *',
      templateKind: 'Job',
      active: 0,
      lastScheduleTime: null,
      status: 'suspended',
      successfulRuns: 8,
      failedRuns: 0,
    },
  ],

  /* ----- Aggregate metrics --------------------------------------- */
  controllerVersion: '1.7.1',
  totalInjectedPods: 91,
  lastCheckTime: new Date(Date.now() - FIVE_MINUTES_MS).toISOString(),
}
