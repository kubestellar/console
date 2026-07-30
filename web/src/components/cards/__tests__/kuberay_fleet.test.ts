import { describe, it, expect } from 'vitest'
import {
  KUBERAY_FLEET_DEMO_DATA,
  type RayClusterState,
  type RayJobStatus,
  type RayServiceStatus,
} from '../kuberay_fleet/demoData'

describe('KUBERAY_FLEET_DEMO_DATA', () => {
  it('is defined', () => {
    expect(KUBERAY_FLEET_DEMO_DATA).toBeDefined()
  })

  it('detected field is boolean', () => {
    expect(typeof KUBERAY_FLEET_DEMO_DATA.detected).toBe('boolean')
  })

  it('has rayClusters array with entries', () => {
    expect(Array.isArray(KUBERAY_FLEET_DEMO_DATA.rayClusters)).toBe(true)
    expect(KUBERAY_FLEET_DEMO_DATA.rayClusters.length).toBeGreaterThan(0)
  })

  it('each rayCluster has required fields', () => {
    const validStates: RayClusterState[] = ['ready', 'unhealthy', 'suspended', 'unknown']
    for (const cluster of KUBERAY_FLEET_DEMO_DATA.rayClusters) {
      expect(typeof cluster.name).toBe('string')
      expect(typeof cluster.namespace).toBe('string')
      expect(typeof cluster.cluster).toBe('string')
      expect(validStates).toContain(cluster.state)
      expect(typeof cluster.desiredWorkers).toBe('number')
      expect(typeof cluster.availableWorkers).toBe('number')
      expect(typeof cluster.gpuCount).toBe('number')
    }
  })

  it('availableWorkers <= desiredWorkers per cluster', () => {
    for (const cluster of KUBERAY_FLEET_DEMO_DATA.rayClusters) {
      expect(cluster.availableWorkers).toBeLessThanOrEqual(cluster.desiredWorkers)
    }
  })

  it('has rayJobs array', () => {
    expect(Array.isArray(KUBERAY_FLEET_DEMO_DATA.rayJobs)).toBe(true)
  })

  it('each rayJob has required fields', () => {
    const validStatuses: RayJobStatus[] = ['RUNNING', 'SUCCEEDED', 'FAILED', 'PENDING', 'STOPPED']
    for (const job of KUBERAY_FLEET_DEMO_DATA.rayJobs) {
      expect(typeof job.name).toBe('string')
      expect(typeof job.namespace).toBe('string')
      expect(validStatuses).toContain(job.jobStatus)
    }
  })

  it('has rayServices array', () => {
    expect(Array.isArray(KUBERAY_FLEET_DEMO_DATA.rayServices)).toBe(true)
  })

  it('each rayService has required fields', () => {
    const validStatuses: RayServiceStatus[] = ['Running', 'Deploying', 'FailedToGetOrCreateRayCluster', 'WaitForServeDeploymentReady', 'Unknown']
    for (const svc of KUBERAY_FLEET_DEMO_DATA.rayServices) {
      expect(typeof svc.name).toBe('string')
      expect(validStatuses).toContain(svc.status)
    }
  })

  it('has totalGPUs count', () => {
    expect(typeof KUBERAY_FLEET_DEMO_DATA.totalGPUs).toBe('number')
    expect(KUBERAY_FLEET_DEMO_DATA.totalGPUs).toBeGreaterThanOrEqual(0)
  })
})
