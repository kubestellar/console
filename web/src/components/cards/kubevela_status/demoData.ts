/**
 * Demo data for the KubeVela application delivery status card.
 *
 * Represents a typical cluster running KubeVela with several OAM Applications
 * across namespaces. Used in demo mode or when no Kubernetes clusters are
 * connected.
 */

export interface KubeVelaApplication {
  name: string
  namespace: string
  status: 'running' | 'workflowSuspending' | 'workflowTerminated' | 'workflowFailed' | 'unhealthy' | 'deleting'
  components: number
  traits: number
  workflowSteps: number
  workflowStepsCompleted: number
  message?: string
  ageMinutes: number
}

export interface KubeVelaDemoData {
  health: 'healthy' | 'degraded' | 'not-installed'
  pods: {
    ready: number
    total: number
  }
  apps: {
    total: number
    running: number
    failed: number
  }
  totalComponents: number
  totalTraits: number
  applications: KubeVelaApplication[]
  lastCheckTime: string
}

/** How far in the past the demo "last check" timestamp should be (75 seconds). */
const DEMO_LAST_CHECK_AGE_MS = 75_000

export const KUBEVELA_DEMO_DATA: KubeVelaDemoData = {
  health: 'degraded',
  pods: { ready: 2, total: 2 },
  apps: { total: 5, running: 3, failed: 1 },
  totalComponents: 12,
  totalTraits: 8,
  applications: [
    {
      name: 'frontend-app',
      namespace: 'production',
      status: 'running',
      components: 3,
      traits: 2,
      workflowSteps: 4,
      workflowStepsCompleted: 4,
      ageMinutes: 1440,
    },
    {
      name: 'backend-api',
      namespace: 'production',
      status: 'running',
      components: 2,
      traits: 3,
      workflowSteps: 3,
      workflowStepsCompleted: 3,
      ageMinutes: 720,
    },
    {
      name: 'data-pipeline',
      namespace: 'staging',
      status: 'workflowFailed',
      components: 4,
      traits: 1,
      workflowSteps: 5,
      workflowStepsCompleted: 2,
      message: 'Workflow step "deploy-db" failed: OOMKilled',
      ageMinutes: 45,
    },
    {
      name: 'ml-service',
      namespace: 'staging',
      status: 'running',
      components: 2,
      traits: 1,
      workflowSteps: 3,
      workflowStepsCompleted: 3,
      ageMinutes: 320,
    },
    {
      name: 'cache-layer',
      namespace: 'production',
      status: 'workflowSuspending',
      components: 1,
      traits: 1,
      workflowSteps: 2,
      workflowStepsCompleted: 1,
      message: 'Waiting for manual approval gate',
      ageMinutes: 12,
    },
  ],
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_AGE_MS).toISOString(),
}
