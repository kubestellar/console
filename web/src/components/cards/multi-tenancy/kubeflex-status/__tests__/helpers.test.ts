import { describe, it, expect } from 'vitest'
import {
  isKubeFlexControllerPod,
  isKubeFlexControlPlanePod,
  groupControlPlanes,
  countTenants,
  KUBEFLEX_NAME_LABEL_KEY,
  KUBEFLEX_NAME_LABEL_VALUE,
  KUBEFLEX_APP_LABEL_KEY,
  KUBEFLEX_CONTROLLER_LABEL_VALUE,
  KUBEFLEX_CP_LABEL_KEY,
} from '../helpers'

describe('kubeflex-status helpers', () => {
  describe('isKubeFlexControllerPod', () => {
    it('returns true for name label match', () => {
      expect(isKubeFlexControllerPod({ [KUBEFLEX_NAME_LABEL_KEY]: KUBEFLEX_NAME_LABEL_VALUE })).toBe(true)
    })

    it('returns true for app label match', () => {
      expect(isKubeFlexControllerPod({ [KUBEFLEX_APP_LABEL_KEY]: KUBEFLEX_CONTROLLER_LABEL_VALUE })).toBe(true)
    })

    it('returns false for unrelated labels', () => {
      expect(isKubeFlexControllerPod({ app: 'nginx' })).toBe(false)
    })

    it('returns false for undefined labels', () => {
      expect(isKubeFlexControllerPod(undefined)).toBe(false)
    })

    it('returns false for empty labels', () => {
      expect(isKubeFlexControllerPod({})).toBe(false)
    })
  })

  describe('isKubeFlexControlPlanePod', () => {
    it('returns true when control-plane label is present', () => {
      expect(isKubeFlexControlPlanePod({ [KUBEFLEX_CP_LABEL_KEY]: 'tenant-a' })).toBe(true)
    })

    it('returns false when control-plane label is absent', () => {
      expect(isKubeFlexControlPlanePod({ app: 'test' })).toBe(false)
    })

    it('returns false for undefined labels', () => {
      expect(isKubeFlexControlPlanePod(undefined)).toBe(false)
    })
  })

  describe('groupControlPlanes', () => {
    it('groups healthy pods by control plane name', () => {
      const pods = [
        { name: 'p1', status: 'Running', ready: '1/1', labels: { [KUBEFLEX_CP_LABEL_KEY]: 'cp-alpha' } },
        { name: 'p2', status: 'Running', ready: '1/1', labels: { [KUBEFLEX_CP_LABEL_KEY]: 'cp-alpha' } },
        { name: 'p3', status: 'Running', ready: '1/1', labels: { [KUBEFLEX_CP_LABEL_KEY]: 'cp-beta' } },
      ]
      const result = groupControlPlanes(pods)
      expect(result).toHaveLength(2)
      expect(result.find(cp => cp.name === 'cp-alpha')?.healthy).toBe(true)
      expect(result.find(cp => cp.name === 'cp-beta')?.healthy).toBe(true)
    })

    it('marks control plane as unhealthy if any pod is unhealthy', () => {
      const pods = [
        { name: 'p1', status: 'Running', ready: '1/1', labels: { [KUBEFLEX_CP_LABEL_KEY]: 'cp-alpha' } },
        { name: 'p2', status: 'CrashLoopBackOff', ready: '0/1', labels: { [KUBEFLEX_CP_LABEL_KEY]: 'cp-alpha' } },
      ]
      const result = groupControlPlanes(pods)
      expect(result).toHaveLength(1)
      expect(result[0].healthy).toBe(false)
    })

    it('ignores pods without control-plane label', () => {
      const pods = [
        { name: 'p1', status: 'Running', ready: '1/1', labels: { app: 'nginx' } },
      ]
      expect(groupControlPlanes(pods)).toHaveLength(0)
    })

    it('handles empty array', () => {
      expect(groupControlPlanes([])).toHaveLength(0)
    })
  })

  describe('countTenants', () => {
    it('counts unique namespaces', () => {
      const pods = [
        { namespace: 'tenant-a', labels: { [KUBEFLEX_CP_LABEL_KEY]: 'cp-1' } },
        { namespace: 'tenant-a', labels: { [KUBEFLEX_CP_LABEL_KEY]: 'cp-1' } },
        { namespace: 'tenant-b', labels: { [KUBEFLEX_CP_LABEL_KEY]: 'cp-2' } },
      ]
      expect(countTenants(pods)).toBe(2)
    })

    it('returns 0 for empty array', () => {
      expect(countTenants([])).toBe(0)
    })

    it('skips pods without namespace', () => {
      const pods = [
        { labels: { [KUBEFLEX_CP_LABEL_KEY]: 'cp-1' } },
        { namespace: 'ns-1', labels: { [KUBEFLEX_CP_LABEL_KEY]: 'cp-2' } },
      ]
      expect(countTenants(pods)).toBe(1)
    })
  })
})
