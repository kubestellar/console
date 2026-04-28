/**
 * KubeVela Status Card — Demo Data & Type Definitions
 *
 * KubeVela is a CNCF Incubating project that implements the Open Application
 * Model (OAM) on Kubernetes. Platform teams author reusable component and
 * trait definitions; application teams deploy Application CRs that reference
 * those building blocks.
 *
 * This card surfaces:
 *  - Active Application CRs (prod / staging / dev)
 *  - Workflow progress (steps completed / total, current phase)
 *  - Component + trait counts per Application
 *  - Controller health (vela-core pod readiness)
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real KubeVela controller bridge lands (`/api/kubevela/status`), the hook's
 * fetcher will pick up live data automatically with no component changes.
 *
 * Source: kubestellar/console-marketplace#43
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KubeVelaHealth = 'healthy' | 'degraded' | 'not-installed'

export type KubeVelaAppStatus =
  | 'running'
  | 'workflowSuspending'
  | 'workflowTerminated'
  | 'workflowFailed'
  | 'unhealthy'
  | 'deleting'

export type WorkflowStepPhase =
  | 'succeeded'
  | 'running'
  | 'pending'
  | 'failed'
  | 'skipped'
  | 'suspending'

export interface KubeVelaTrait {
  type: string
  description: string
}

export interface KubeVelaWorkflowStep {
  name: string
  type: string
  phase: WorkflowStepPhase
  message?: string
}

export interface KubeVelaApplication {
  name: string
  namespace: string
  cluster: string
  status: KubeVelaAppStatus
  componentCount: number
  traitCount: number
  workflowSteps: KubeVelaWorkflowStep[]
  workflowStepsCompleted: number
  workflowStepsTotal: number
  traits: KubeVelaTrait[]
  message?: string
  ageMinutes: number
}

export interface KubeVelaControllerPod {
  name: string
  namespace: string
  cluster: string
  status: 'running' | 'pending' | 'failed'
  replicasReady: number
  replicasDesired: number
}

export interface KubeVelaStats {
  totalApplications: number
  runningApplications: number
  failedApplications: number
  totalComponents: number
  totalTraits: number
  controllerVersion: string
}

export interface KubeVelaSummary {
  totalApplications: number
  runningApplications: number
  failedApplications: number
  totalControllerPods: number
  runningControllerPods: number
}

export interface KubeVelaStatusData {
  health: KubeVelaHealth
  applications: KubeVelaApplication[]
  controllerPods: KubeVelaControllerPod[]
  stats: KubeVelaStats
  summary: KubeVelaSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo-data constants (named — no magic numbers)
// ---------------------------------------------------------------------------

const DEMO_CONTROLLER_VERSION = '1.9.11'

// Ages (in minutes) for demo Applications
const AGE_ONE_DAY_MIN = 1440
const AGE_TWELVE_HOURS_MIN = 720
const AGE_FOUR_HOURS_MIN = 240
const AGE_THIRTY_MIN = 30

// Freshness of the "last check" timestamp (75 seconds in the past)
const DEMO_LAST_CHECK_AGE_MS = 75_000

// ---------------------------------------------------------------------------
// Demo data — shown when KubeVela is not installed or in demo mode
// ---------------------------------------------------------------------------

const DEMO_APPLICATIONS: KubeVelaApplication[] = [
  {
    name: 'frontend-web',
    namespace: 'production',
    cluster: 'prod-east',
    status: 'running',
    componentCount: 3,
    traitCount: 2,
    workflowStepsCompleted: 4,
    workflowStepsTotal: 4,
    workflowSteps: [
      { name: 'build-image', type: 'apply-component', phase: 'succeeded' },
      { name: 'apply-frontend', type: 'apply-component', phase: 'succeeded' },
      { name: 'apply-ingress', type: 'apply-component', phase: 'succeeded' },
      { name: 'wait-healthy', type: 'wait-condition', phase: 'succeeded' },
    ],
    traits: [
      { type: 'scaler', description: 'Replicas: 3' },
      { type: 'gateway', description: 'Expose via Ingress' },
    ],
    ageMinutes: AGE_ONE_DAY_MIN,
  },
  {
    name: 'payments-api',
    namespace: 'production',
    cluster: 'prod-east',
    status: 'running',
    componentCount: 2,
    traitCount: 3,
    workflowStepsCompleted: 3,
    workflowStepsTotal: 3,
    workflowSteps: [
      { name: 'deploy-api', type: 'apply-component', phase: 'succeeded' },
      { name: 'deploy-worker', type: 'apply-component', phase: 'succeeded' },
      { name: 'smoke-test', type: 'webhook', phase: 'succeeded' },
    ],
    traits: [
      { type: 'scaler', description: 'Replicas: 4' },
      { type: 'sidecar', description: 'envoy proxy' },
      { type: 'labels', description: 'tier=backend' },
    ],
    ageMinutes: AGE_TWELVE_HOURS_MIN,
  },
  {
    name: 'data-pipeline',
    namespace: 'staging',
    cluster: 'staging-west',
    status: 'workflowFailed',
    componentCount: 4,
    traitCount: 1,
    workflowStepsCompleted: 2,
    workflowStepsTotal: 5,
    workflowSteps: [
      { name: 'provision-db', type: 'apply-component', phase: 'succeeded' },
      { name: 'load-schema', type: 'apply-component', phase: 'succeeded' },
      {
        name: 'deploy-etl',
        type: 'apply-component',
        phase: 'failed',
        message: 'OOMKilled: pod exceeded memory limit (2Gi)',
      },
      { name: 'run-backfill', type: 'apply-component', phase: 'pending' },
      { name: 'verify-output', type: 'webhook', phase: 'pending' },
    ],
    traits: [{ type: 'resource', description: 'memory: 2Gi' }],
    message: 'Workflow step "deploy-etl" failed: OOMKilled',
    ageMinutes: AGE_FOUR_HOURS_MIN,
  },
  {
    name: 'feature-flags',
    namespace: 'dev',
    cluster: 'dev-local',
    status: 'workflowSuspending',
    componentCount: 1,
    traitCount: 1,
    workflowStepsCompleted: 1,
    workflowStepsTotal: 3,
    workflowSteps: [
      { name: 'deploy-service', type: 'apply-component', phase: 'succeeded' },
      {
        name: 'manual-approval',
        type: 'suspend',
        phase: 'suspending',
        message: 'Waiting for manual approval gate',
      },
      { name: 'promote-prod', type: 'apply-component', phase: 'pending' },
    ],
    traits: [{ type: 'scaler', description: 'Replicas: 1' }],
    message: 'Awaiting manual approval',
    ageMinutes: AGE_THIRTY_MIN,
  },
]

const DEMO_CONTROLLER_PODS: KubeVelaControllerPod[] = [
  {
    name: 'kubevela-vela-core-7d8b9c4f5-abcde',
    namespace: 'vela-system',
    cluster: 'prod-east',
    status: 'running',
    replicasReady: 1,
    replicasDesired: 1,
  },
  {
    name: 'kubevela-cluster-gateway-6c9d8e7f4-fghij',
    namespace: 'vela-system',
    cluster: 'prod-east',
    status: 'running',
    replicasReady: 1,
    replicasDesired: 1,
  },
]

const DEMO_RUNNING_APPS = DEMO_APPLICATIONS.filter(
  a => a.status === 'running',
).length
const DEMO_FAILED_APPS = DEMO_APPLICATIONS.filter(
  a => a.status === 'workflowFailed' || a.status === 'unhealthy',
).length
const DEMO_TOTAL_COMPONENTS = DEMO_APPLICATIONS.reduce(
  (sum, a) => sum + a.componentCount,
  0,
)
const DEMO_TOTAL_TRAITS = DEMO_APPLICATIONS.reduce(
  (sum, a) => sum + a.traitCount,
  0,
)
const DEMO_RUNNING_CONTROLLER_PODS = DEMO_CONTROLLER_PODS.filter(
  p => p.status === 'running',
).length

export const KUBEVELA_DEMO_DATA: KubeVelaStatusData = {
  health: 'degraded',
  applications: DEMO_APPLICATIONS,
  controllerPods: DEMO_CONTROLLER_PODS,
  stats: {
    totalApplications: DEMO_APPLICATIONS.length,
    runningApplications: DEMO_RUNNING_APPS,
    failedApplications: DEMO_FAILED_APPS,
    totalComponents: DEMO_TOTAL_COMPONENTS,
    totalTraits: DEMO_TOTAL_TRAITS,
    controllerVersion: DEMO_CONTROLLER_VERSION,
  },
  summary: {
    totalApplications: DEMO_APPLICATIONS.length,
    runningApplications: DEMO_RUNNING_APPS,
    failedApplications: DEMO_FAILED_APPS,
    totalControllerPods: DEMO_CONTROLLER_PODS.length,
    runningControllerPods: DEMO_RUNNING_CONTROLLER_PODS,
  },
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_AGE_MS).toISOString(),
}
