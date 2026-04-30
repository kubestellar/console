import { describe, it, expect } from 'vitest'
import {
  KUBEVELA_DEMO_DATA,
  type KubeVelaHealth,
  type KubeVelaAppStatus,
  type WorkflowStepPhase,
} from '../kubevela_status/demoData'

describe('KUBEVELA_DEMO_DATA', () => {
  it('is defined', () => {
    expect(KUBEVELA_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const validHealth: KubeVelaHealth[] = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(validHealth).toContain(KUBEVELA_DEMO_DATA.health)
  })

  it('has applications array with entries', () => {
    expect(Array.isArray(KUBEVELA_DEMO_DATA.applications)).toBe(true)
    expect(KUBEVELA_DEMO_DATA.applications.length).toBeGreaterThan(0)
  })

  it('each application has required fields', () => {
    for (const app of KUBEVELA_DEMO_DATA.applications) {
      expect(typeof app.name).toBe('string')
      expect(typeof app.namespace).toBe('string')
      expect(typeof app.cluster).toBe('string')
      const validStatuses: KubeVelaAppStatus[] = ['running', 'workflow-failed', 'workflow-suspended', 'deleting', 'rendering', 'runningWorkflow', 'workflowTerminated', 'workflowFinished', 'unknown']
      expect(validStatuses).toContain(app.status)
    }
  })

  it('each application has components', () => {
    for (const app of KUBEVELA_DEMO_DATA.applications) {
      expect(Array.isArray(app.components)).toBe(true)
      expect(typeof app.componentCount).toBe('number')
    }
  })

  it('application workflows have valid step phases', () => {
    const validPhases: WorkflowStepPhase[] = ['succeeded', 'failed', 'skipped', 'running', 'pending', 'stopped']
    for (const app of KUBEVELA_DEMO_DATA.applications) {
      if (app.workflowSteps) {
        for (const step of app.workflowSteps) {
          expect(validPhases).toContain(step.phase)
        }
      }
    }
  })

  it('has controllerPods array', () => {
    expect(Array.isArray(KUBEVELA_DEMO_DATA.controllerPods)).toBe(true)
    expect(KUBEVELA_DEMO_DATA.controllerPods.length).toBeGreaterThan(0)
  })

  it('each controller pod has required fields', () => {
    for (const pod of KUBEVELA_DEMO_DATA.controllerPods) {
      expect(typeof pod.name).toBe('string')
      expect(typeof pod.ready).toBe('boolean')
    }
  })

  it('has stats with required numeric fields', () => {
    expect(typeof KUBEVELA_DEMO_DATA.stats.totalApplications).toBe('number')
    expect(typeof KUBEVELA_DEMO_DATA.stats.runningApplications).toBe('number')
    expect(typeof KUBEVELA_DEMO_DATA.stats.failedApplications).toBe('number')
    expect(typeof KUBEVELA_DEMO_DATA.stats.totalComponents).toBe('number')
    expect(typeof KUBEVELA_DEMO_DATA.stats.totalTraits).toBe('number')
  })

  it('has summary with controllerVersion', () => {
    expect(typeof KUBEVELA_DEMO_DATA.summary.controllerVersion).toBe('string')
    expect(typeof KUBEVELA_DEMO_DATA.summary.velaCLIVersion).toBe('string')
  })
})
