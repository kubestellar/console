import { describe, it, expect } from 'vitest'
import {
  isOvnPod,
  extractUdns,
  summarizeOvnPods,
  OVN_NODE_LABEL,
  OVN_MASTER_LABEL,
  OVN_CONTROLLER_LABEL,
  UDN_ANNOTATION_KEY,
  UDN_TOPOLOGY_ANNOTATION_KEY,
  UDN_ROLE_ANNOTATION_KEY,
} from '../helpers'

describe('ovn-status helpers', () => {
  describe('isOvnPod', () => {
    it('returns true for ovnkube-node label', () => {
      expect(isOvnPod({ app: OVN_NODE_LABEL })).toBe(true)
    })

    it('returns true for ovnkube-master label', () => {
      expect(isOvnPod({ app: OVN_MASTER_LABEL })).toBe(true)
    })

    it('returns true for ovnkube-controller label', () => {
      expect(isOvnPod({ app: OVN_CONTROLLER_LABEL })).toBe(true)
    })

    it('returns false for non-OVN label', () => {
      expect(isOvnPod({ app: 'nginx' })).toBe(false)
    })

    it('returns false for undefined labels', () => {
      expect(isOvnPod(undefined)).toBe(false)
    })

    it('returns false for empty labels', () => {
      expect(isOvnPod({})).toBe(false)
    })
  })

  describe('extractUdns', () => {
    it('extracts UDN info from pods with UDN annotation', () => {
      const pods = [
        {
          name: 'pod-1',
          annotations: {
            [UDN_ANNOTATION_KEY]: 'my-network',
            [UDN_TOPOLOGY_ANNOTATION_KEY]: 'layer2',
            [UDN_ROLE_ANNOTATION_KEY]: 'primary',
          },
        },
      ]
      const result = extractUdns(pods)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        name: 'my-network',
        networkType: 'layer2',
        role: 'primary',
      })
    })

    it('handles layer3/L3 topology annotation', () => {
      const pods = [
        {
          name: 'pod-1',
          annotations: {
            [UDN_ANNOTATION_KEY]: 'net-1',
            [UDN_TOPOLOGY_ANNOTATION_KEY]: 'L3',
            [UDN_ROLE_ANNOTATION_KEY]: 'secondary',
          },
        },
      ]
      const result = extractUdns(pods)
      expect(result[0].networkType).toBe('layer3')
      expect(result[0].role).toBe('secondary')
    })

    it('defaults to unknown for missing topology/role', () => {
      const pods = [
        {
          name: 'pod-1',
          annotations: { [UDN_ANNOTATION_KEY]: 'net-1' },
        },
      ]
      const result = extractUdns(pods)
      expect(result[0].networkType).toBe('unknown')
      expect(result[0].role).toBe('unknown')
    })

    it('de-duplicates by UDN name', () => {
      const pods = [
        { name: 'pod-1', annotations: { [UDN_ANNOTATION_KEY]: 'shared-net' } },
        { name: 'pod-2', annotations: { [UDN_ANNOTATION_KEY]: 'shared-net' } },
      ]
      expect(extractUdns(pods)).toHaveLength(1)
    })

    it('skips pods without UDN annotation', () => {
      const pods = [
        { name: 'pod-1', annotations: {} },
        { name: 'pod-2' },
      ]
      expect(extractUdns(pods)).toHaveLength(0)
    })

    it('handles empty pods array', () => {
      expect(extractUdns([])).toHaveLength(0)
    })
  })

  describe('summarizeOvnPods', () => {
    it('counts healthy and unhealthy pods', () => {
      const pods = [
        { status: 'Running', ready: '1/1' },
        { status: 'Running', ready: '2/2' },
        { status: 'CrashLoopBackOff', ready: '0/1' },
      ]
      const result = summarizeOvnPods(pods)
      expect(result.total).toBe(3)
      expect(result.healthy).toBe(2)
      expect(result.unhealthy).toBe(1)
    })

    it('returns zeros for empty array', () => {
      const result = summarizeOvnPods([])
      expect(result).toEqual({ total: 0, healthy: 0, unhealthy: 0 })
    })

    it('treats pending pods as unhealthy', () => {
      const pods = [{ status: 'Pending', ready: '0/1' }]
      const result = summarizeOvnPods(pods)
      expect(result.unhealthy).toBe(1)
    })
  })
})
