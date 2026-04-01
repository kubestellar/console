/**
 * Workload & Deployment Card Config Tests
 */
import { describe, it, expect } from 'vitest'
import { deploymentIssuesConfig } from '../deployment-issues'
import { deploymentMissionsConfig } from '../deployment-missions'
import { deploymentProgressConfig } from '../deployment-progress'
import { deploymentStatusConfig } from '../deployment-status'
import { deploymentRolloutTrackerConfig } from '../deployment-rollout-tracker'
import { workloadDeploymentConfig } from '../workload-deployment'
import { workloadMonitorConfig } from '../workload-monitor'
import { appStatusConfig } from '../app-status'
import { cronJobStatusConfig } from '../cronjob-status'
import { daemonSetStatusConfig } from '../daemonset-status'
import { hpaStatusConfig } from '../hpa-status'
import { jobStatusConfig } from '../job-status'
import { replicaSetStatusConfig } from '../replicaset-status'
import { statefulSetStatusConfig } from '../statefulset-status'

const workloadCards = [
  { name: 'deploymentIssues', config: deploymentIssuesConfig },
  { name: 'deploymentMissions', config: deploymentMissionsConfig },
  { name: 'deploymentProgress', config: deploymentProgressConfig },
  { name: 'deploymentStatus', config: deploymentStatusConfig },
  { name: 'deploymentRolloutTracker', config: deploymentRolloutTrackerConfig },
  { name: 'workloadDeployment', config: workloadDeploymentConfig },
  { name: 'workloadMonitor', config: workloadMonitorConfig },
  { name: 'appStatus', config: appStatusConfig },
  { name: 'cronJobStatus', config: cronJobStatusConfig },
  { name: 'daemonSetStatus', config: daemonSetStatusConfig },
  { name: 'hpaStatus', config: hpaStatusConfig },
  { name: 'jobStatus', config: jobStatusConfig },
  { name: 'replicaSetStatus', config: replicaSetStatusConfig },
  { name: 'statefulSetStatus', config: statefulSetStatusConfig },
]

describe('Workload card configs', () => {
  it.each(workloadCards)('$name has valid type, title, category', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
  })

  it.each(workloadCards)('$name has content and dataSource', ({ config }) => {
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })
})
