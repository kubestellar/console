import { describe, expect, it } from 'vitest'
import {
  countTenants,
  groupControlPlanes,
  isKubeFlexControllerPod,
  isKubeFlexControlPlanePod,
  isPodHealthy,
  parseReadyCount,
} from '../helpers'

describe('kubeflex-status helpers', () => {
  describe('isKubeFlexControllerPod', () => {
    it('detects pods with app.kubernetes.io/name=kubeflex', () => {
      expect(isKubeFlexControllerPod({ 'app.kubernetes.io/name': 'kubeflex' })).toBe(true)
    })

    it('detects pods with app=kubeflex-controller', () => {
      expect(isKubeFlexControllerPod({ app: 'kubeflex-controller' })).toBe(true)
    })

    it('rejects non-KubeFlex pods', () => {
      expect(isKubeFlexControllerPod({ app: 'nginx' })).toBe(false)
      expect(isKubeFlexControllerPod({})).toBe(false)
      expect(isKubeFlexControllerPod(undefined)).toBe(false)
    })
  })

  describe('isKubeFlexControlPlanePod', () => {
    it('detects pods with kubeflex.io/control-plane label', () => {
      expect(isKubeFlexControlPlanePod({ 'kubeflex.io/control-plane': 'tenant-1' })).toBe(true)
    })

    it('rejects pods without the control-plane label', () => {
      expect(isKubeFlexControlPlanePod({ app: 'nginx' })).toBe(false)
      expect(isKubeFlexControlPlanePod(undefined)).toBe(false)
    })
  })

  describe('isPodHealthy', () => {
    it('reports healthy when running with all containers ready', () => {
      expect(isPodHealthy({ status: 'Running', ready: '1/1' })).toBe(true)
    })

    it('reports unhealthy when not running', () => {
      expect(isPodHealthy({ status: 'CrashLoopBackOff', ready: '0/1' })).toBe(false)
    })

    it('reports unhealthy when not all containers ready', () => {
      expect(isPodHealthy({ status: 'Running', ready: '1/2' })).toBe(false)
    })
  })

  describe('parseReadyCount', () => {
    it('parses valid ready string', () => {
      expect(parseReadyCount('2/2')).toEqual({ ready: 2, total: 2 })
    })

    it('handles invalid input', () => {
      expect(parseReadyCount(undefined)).toEqual({ ready: 0, total: 0 })
    })
  })

  describe('groupControlPlanes', () => {
    it('groups pods by control-plane label', () => {
      const pods = [
        { name: 'cp-1-api', status: 'Running', ready: '1/1', labels: { 'kubeflex.io/control-plane': 'tenant-1' } },
        { name: 'cp-1-etcd', status: 'Running', ready: '1/1', labels: { 'kubeflex.io/control-plane': 'tenant-1' } },
        { name: 'cp-2-api', status: 'Pending', ready: '0/1', labels: { 'kubeflex.io/control-plane': 'tenant-2' } },
      ]

      const cps = groupControlPlanes(pods)
      expect(cps).toHaveLength(2)

      const tenant1 = cps.find((cp) => cp.name === 'tenant-1')
      expect(tenant1?.healthy).toBe(true)

      const tenant2 = cps.find((cp) => cp.name === 'tenant-2')
      expect(tenant2?.healthy).toBe(false)
    })

    it('marks CP degraded if any pod is unhealthy', () => {
      const pods = [
        { name: 'cp-a-api', status: 'Running', ready: '1/1', labels: { 'kubeflex.io/control-plane': 'cp-a' } },
        { name: 'cp-a-etcd', status: 'Pending', ready: '0/1', labels: { 'kubeflex.io/control-plane': 'cp-a' } },
      ]

      const cps = groupControlPlanes(pods)
      expect(cps).toHaveLength(1)
      expect(cps[0].healthy).toBe(false)
    })

    it('handles empty input', () => {
      expect(groupControlPlanes([])).toHaveLength(0)
    })
  })

  describe('countTenants', () => {
    it('counts unique namespaces', () => {
      const pods = [
        { namespace: 'ns-a', labels: { 'kubeflex.io/control-plane': 'cp-1' } },
        { namespace: 'ns-a', labels: { 'kubeflex.io/control-plane': 'cp-1' } },
        { namespace: 'ns-b', labels: { 'kubeflex.io/control-plane': 'cp-2' } },
      ]

      expect(countTenants(pods)).toBe(2)
    })

    it('returns 0 for empty input', () => {
      expect(countTenants([])).toBe(0)
    })
  })
})
