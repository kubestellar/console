import { describe, expect, it } from 'vitest'
import {
  countVmTenants,
  countVmsByState,
  getVmStatus,
  isKubevirtPod,
  isPodHealthy,
  isVirtLauncher,
  parseReadyCount,
  summarizeKubevirtPods,
} from '../helpers'

describe('kubevirt-status helpers', () => {
  describe('isKubevirtPod', () => {
    it('detects virt-operator pods in kubevirt namespace', () => {
      expect(isKubevirtPod({ app: 'virt-operator' }, 'kubevirt')).toBe(true)
    })

    it('detects virt-controller pods in kubevirt namespace', () => {
      expect(isKubevirtPod({ app: 'virt-controller' }, 'kubevirt')).toBe(true)
    })

    it('detects virt-api pods in kubevirt namespace', () => {
      expect(isKubevirtPod({ app: 'virt-api' }, 'kubevirt')).toBe(true)
    })

    it('detects virt-handler pods in kubevirt namespace', () => {
      expect(isKubevirtPod({ app: 'virt-handler' }, 'kubevirt')).toBe(true)
    })

    it('rejects KubeVirt pods in wrong namespace', () => {
      expect(isKubevirtPod({ app: 'virt-operator' }, 'default')).toBe(false)
    })

    it('rejects non-KubeVirt pods', () => {
      expect(isKubevirtPod({ app: 'nginx' }, 'kubevirt')).toBe(false)
      expect(isKubevirtPod({}, 'kubevirt')).toBe(false)
      expect(isKubevirtPod(undefined, undefined)).toBe(false)
    })
  })

  describe('isVirtLauncher', () => {
    it('detects virt-launcher pods', () => {
      expect(isVirtLauncher({ app: 'virt-launcher' })).toBe(true)
    })

    it('rejects non-launcher pods', () => {
      expect(isVirtLauncher({ app: 'virt-operator' })).toBe(false)
      expect(isVirtLauncher({})).toBe(false)
      expect(isVirtLauncher(undefined)).toBe(false)
    })
  })

  describe('parseReadyCount', () => {
    it('parses valid ready string', () => {
      expect(parseReadyCount('1/1')).toEqual({ ready: 1, total: 1 })
    })

    it('handles partial readiness', () => {
      expect(parseReadyCount('0/2')).toEqual({ ready: 0, total: 2 })
    })

    it('handles invalid input safely', () => {
      expect(parseReadyCount(undefined)).toEqual({ ready: 0, total: 0 })
      expect(parseReadyCount('invalid')).toEqual({ ready: 0, total: 0 })
    })
  })

  describe('isPodHealthy', () => {
    it('reports healthy when running with all containers ready', () => {
      expect(isPodHealthy({ status: 'Running', ready: '2/2' })).toBe(true)
    })

    it('reports unhealthy when not running', () => {
      expect(isPodHealthy({ status: 'Pending', ready: '0/1' })).toBe(false)
    })

    it('reports unhealthy when containers not ready', () => {
      expect(isPodHealthy({ status: 'Running', ready: '0/1' })).toBe(false)
    })
  })

  describe('getVmStatus', () => {
    it('returns running for healthy running pods', () => {
      expect(getVmStatus({ status: 'Running', ready: '1/1' })).toBe('running')
    })

    it('returns migrating for migration status', () => {
      expect(getVmStatus({ status: 'Migrating', ready: '1/1' })).toBe('migrating')
    })

    it('returns pending for pending pods', () => {
      expect(getVmStatus({ status: 'Pending', ready: '0/1' })).toBe('pending')
    })

    it('returns stopped for succeeded pods', () => {
      expect(getVmStatus({ status: 'Succeeded' })).toBe('stopped')
    })

    it('returns failed for failed pods', () => {
      expect(getVmStatus({ status: 'Failed' })).toBe('failed')
    })

    it('returns pending for running pods not yet ready', () => {
      expect(getVmStatus({ status: 'Running', ready: '0/1' })).toBe('pending')
    })

    it('returns paused for paused VMs', () => {
      expect(getVmStatus({ status: 'Paused' })).toBe('paused')
    })

    it('returns paused for suspended VMs', () => {
      expect(getVmStatus({ status: 'Suspended' })).toBe('paused')
    })

    it('returns unknown for unrecognized status', () => {
      expect(getVmStatus({ status: 'SomeWeirdStatus' })).toBe('unknown')
    })
  })

  describe('summarizeKubevirtPods', () => {
    it('counts healthy and unhealthy pods', () => {
      const pods = [
        { status: 'Running', ready: '1/1' },
        { status: 'Running', ready: '1/1' },
        { status: 'Pending', ready: '0/1' },
      ]

      const summary = summarizeKubevirtPods(pods)
      expect(summary.total).toBe(3)
      expect(summary.healthy).toBe(2)
      expect(summary.unhealthy).toBe(1)
    })

    it('handles empty input', () => {
      const summary = summarizeKubevirtPods([])
      expect(summary.total).toBe(0)
      expect(summary.healthy).toBe(0)
      expect(summary.unhealthy).toBe(0)
    })
  })

  describe('countVmsByState', () => {
    it('counts VMs by state', () => {
      const pods = [
        { status: 'Running', ready: '1/1' },
        { status: 'Running', ready: '1/1' },
        { status: 'Succeeded' },
        { status: 'Migrating', ready: '1/1' },
        { status: 'Failed' },
      ]

      const counts = countVmsByState(pods)
      expect(counts.running).toBe(2)
      expect(counts.stopped).toBe(1)
      expect(counts.migrating).toBe(1)
      expect(counts.failed).toBe(1)
    })

    it('handles empty input', () => {
      const counts = countVmsByState([])
      expect(counts.running).toBe(0)
      expect(counts.stopped).toBe(0)
    })
  })

  describe('countVmTenants', () => {
    it('counts unique namespaces excluding kubevirt', () => {
      const pods = [
        { namespace: 'tenant-a' },
        { namespace: 'tenant-a' },
        { namespace: 'tenant-b' },
        { namespace: 'kubevirt' },
      ]

      expect(countVmTenants(pods)).toBe(2)
    })

    it('returns 0 for empty input', () => {
      expect(countVmTenants([])).toBe(0)
    })
  })
})
