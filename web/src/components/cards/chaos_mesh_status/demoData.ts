/**
 * Chaos Mesh Status Card — Demo Data & Type Definitions
 */

export interface ChaosMeshExperiment {
  name: string
  namespace: string
  kind: string
  phase: 'Running' | 'Finished' | 'Failed' | 'Paused' | 'Unknown'
  startTime: string
}

export interface ChaosMeshWorkflow {
  name: string
  namespace: string
  phase: 'Running' | 'Finished' | 'Failed' | 'Unknown'
  progress: string
}

export interface ChaosMeshSummary {
  totalExperiments: number
  running: number
  finished: number
  failed: number
}

export type ChaosMeshHealth = 'healthy' | 'degraded' | 'not-installed'

export interface ChaosMeshStatusData {
  experiments: ChaosMeshExperiment[]
  workflows: ChaosMeshWorkflow[]
  summary: ChaosMeshSummary
  health: ChaosMeshHealth
}

export const INITIAL_DATA: ChaosMeshStatusData = {
  health: 'not-installed',
  experiments: [],
  workflows: [],
  summary: { totalExperiments: 0, running: 0, finished: 0, failed: 0 },
}

export const CHAOS_MESH_DEMO_DATA: ChaosMeshStatusData = {
  experiments: [
    { name: 'pod-kill-test', namespace: 'default', kind: 'PodChaos', phase: 'Running', startTime: '2026-04-24T08:00:00Z' },
    { name: 'network-delay-api', namespace: 'api', kind: 'NetworkChaos', phase: 'Finished', startTime: '2026-04-24T06:30:00Z' },
    { name: 'io-fault-db', namespace: 'database', kind: 'IOChaos', phase: 'Failed', startTime: '2026-04-23T22:00:00Z' },
  ],
  workflows: [
    { name: 'resilience-suite', namespace: 'default', phase: 'Running', progress: '2/4' },
    { name: 'network-chaos-flow', namespace: 'staging', phase: 'Finished', progress: '3/3' },
  ],
  summary: { totalExperiments: 3, running: 1, finished: 1, failed: 1 },
  health: 'degraded',
}
