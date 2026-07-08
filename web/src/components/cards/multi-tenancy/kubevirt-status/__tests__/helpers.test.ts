import { describe, it, expect } from 'vitest'
import {
  isKubevirtPod,
  isVirtLauncher,
  getVmStatus,
  summarizeKubevirtPods,
  countVmsByState,
  countVmTenants,
  KUBEVIRT_NAMESPACE,
  KUBEVIRT_INFRA_APP_LABELS,
  VIRT_LAUNCHER_LABEL,
} from '../helpers'

describe('kubevirt-status helpers', () => {
  describe('isKubevirtPod', () => {
    it('returns true for infra pod in kubevirt namespace', () => {
      for (const label of KUBEVIRT_INFRA_APP_LABELS) {
        expect(isKubevirtPod({ app: label }, KUBEVIRT_NAMESPACE)).toBe(true)
      }
    })

    it('returns false for infra label in wrong namespace', () => {
      expect(isKubevirtPod({ app: 'virt-operator' }, 'default')).toBe(false)
    })

    it('returns false for non-infra label in kubevirt namespace', () => {
      expect(isKubevirtPod({ app: 'virt-launcher' }, KUBEVIRT_NAMESPACE)).toBe(false)
    })

    it('returns false for undefined labels', () => {
      expect(isKubevirtPod(undefined, KUBEVIRT_NAMESPACE)).toBe(false)
    })
  })

  describe('isVirtLauncher', () => {
    it('returns true for virt-launcher label', () => {
      expect(isVirtLauncher({ app: VIRT_LAUNCHER_LABEL })).toBe(true)
    })

    it('returns false for other labels', () => {
      expect(isVirtLauncher({ app: 'virt-operator' })).toBe(false)
    })

    it('returns false for undefined labels', () => {
      expect(isVirtLauncher(undefined)).toBe(false)
    })
  })

  describe('getVmStatus', () => {
    it('returns running for healthy running pod', () => {
      expect(getVmStatus({ status: 'Running', ready: '1/1' })).toBe('running')
    })

    it('returns pending for running pod with 0 ready', () => {
      expect(getVmStatus({ status: 'Running', ready: '0/1' })).toBe('pending')
    })

    it('returns migrating for migration status', () => {
      expect(getVmStatus({ status: 'Migrating' })).toBe('migrating')
      expect(getVmStatus({ status: 'LiveMigration' })).toBe('migrating')
    })

    it('returns paused for suspended/paused status', () => {
      expect(getVmStatus({ status: 'Paused' })).toBe('paused')
      expect(getVmStatus({ status: 'Suspended' })).toBe('paused')
    })

    it('returns pending for Pending status', () => {
      expect(getVmStatus({ status: 'Pending' })).toBe('pending')
    })

    it('returns stopped for Succeeded/Completed', () => {
      expect(getVmStatus({ status: 'Succeeded' })).toBe('stopped')
      expect(getVmStatus({ status: 'Completed' })).toBe('stopped')
    })

    it('returns failed for Failed/CrashLoopBackOff', () => {
      expect(getVmStatus({ status: 'Failed' })).toBe('failed')
      expect(getVmStatus({ status: 'CrashLoopBackOff' })).toBe('failed')
    })

    it('returns unknown for unrecognized status', () => {
      expect(getVmStatus({ status: 'SomeOtherState' })).toBe('unknown')
    })

    it('returns unknown for empty/missing status', () => {
      expect(getVmStatus({})).toBe('unknown')
    })
  })

  describe('summarizeKubevirtPods', () => {
    it('counts healthy and unhealthy pods', () => {
      const pods = [
        { status: 'Running', ready: '1/1' },
        { status: 'Running', ready: '1/1' },
        { status: 'Failed', ready: '0/1' },
      ]
      const result = summarizeKubevirtPods(pods)
      expect(result).toEqual({ total: 3, healthy: 2, unhealthy: 1 })
    })

    it('returns zeros for empty array', () => {
      expect(summarizeKubevirtPods([])).toEqual({ total: 0, healthy: 0, unhealthy: 0 })
    })
  })

  describe('countVmsByState', () => {
    it('counts VMs by state', () => {
      const pods = [
        { status: 'Running', ready: '1/1' },
        { status: 'Running', ready: '1/1' },
        { status: 'Failed' },
        { status: 'Pending' },
        { status: 'Migrating' },
      ]
      const result = countVmsByState(pods)
      expect(result.running).toBe(2)
      expect(result.failed).toBe(1)
      expect(result.pending).toBe(1)
      expect(result.migrating).toBe(1)
      expect(result.stopped).toBe(0)
    })

    it('returns all zeros for empty array', () => {
      const result = countVmsByState([])
      expect(Object.values(result).every(v => v === 0)).toBe(true)
    })
  })

  describe('countVmTenants', () => {
    it('counts unique non-kubevirt namespaces', () => {
      const pods = [
        { namespace: 'tenant-a' },
        { namespace: 'tenant-a' },
        { namespace: 'tenant-b' },
        { namespace: KUBEVIRT_NAMESPACE },
      ]
      expect(countVmTenants(pods)).toBe(2)
    })

    it('excludes kubevirt namespace', () => {
      const pods = [{ namespace: KUBEVIRT_NAMESPACE }]
      expect(countVmTenants(pods)).toBe(0)
    })

    it('returns 0 for empty array', () => {
      expect(countVmTenants([])).toBe(0)
    })

    it('skips pods without namespace', () => {
      const pods = [{ name: 'pod-1' }, { namespace: 'ns-1' }]
      expect(countVmTenants(pods)).toBe(1)
    })
  })
})
