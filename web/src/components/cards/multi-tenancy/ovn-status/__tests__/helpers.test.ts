import { describe, expect, it } from 'vitest'
import {
  extractUdns,
  isOvnPod,
  isPodHealthy,
  parseReadyCount,
  summarizeOvnPods,
} from '../helpers'

describe('ovn-status helpers', () => {
  describe('isOvnPod', () => {
    it('detects ovnkube-node pods', () => {
      expect(isOvnPod({ app: 'ovnkube-node' })).toBe(true)
    })

    it('detects ovnkube-master pods', () => {
      expect(isOvnPod({ app: 'ovnkube-master' })).toBe(true)
    })

    it('detects ovnkube-controller pods', () => {
      expect(isOvnPod({ app: 'ovnkube-controller' })).toBe(true)
    })

    it('rejects non-OVN pods', () => {
      expect(isOvnPod({ app: 'nginx' })).toBe(false)
      expect(isOvnPod({})).toBe(false)
      expect(isOvnPod(undefined)).toBe(false)
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

  describe('parseReadyCount', () => {
    it('parses valid ready string', () => {
      expect(parseReadyCount('3/3')).toEqual({ ready: 3, total: 3 })
    })

    it('handles zero ready', () => {
      expect(parseReadyCount('0/2')).toEqual({ ready: 0, total: 2 })
    })

    it('handles invalid input safely', () => {
      expect(parseReadyCount(undefined)).toEqual({ ready: 0, total: 0 })
      expect(parseReadyCount('invalid')).toEqual({ ready: 0, total: 0 })
    })
  })

  describe('extractUdns', () => {
    it('extracts UDN info from pod annotations', () => {
      const pods = [
        {
          name: 'pod-a',
          annotations: {
            'k8s.ovn.org/user-defined-network': 'tenant-net-1',
            'k8s.ovn.org/network-topology': 'layer3',
            'k8s.ovn.org/network-role': 'primary',
          },
        },
        {
          name: 'pod-b',
          annotations: {
            'k8s.ovn.org/user-defined-network': 'shared-net',
            'k8s.ovn.org/network-topology': 'layer2',
            'k8s.ovn.org/network-role': 'secondary',
          },
        },
      ]

      const udns = extractUdns(pods)
      expect(udns).toHaveLength(2)
      expect(udns[0]).toEqual({ name: 'tenant-net-1', networkType: 'layer3', role: 'primary' })
      expect(udns[1]).toEqual({ name: 'shared-net', networkType: 'layer2', role: 'secondary' })
    })

    it('deduplicates UDNs by name', () => {
      const pods = [
        { name: 'pod-a', annotations: { 'k8s.ovn.org/user-defined-network': 'same-net' } },
        { name: 'pod-b', annotations: { 'k8s.ovn.org/user-defined-network': 'same-net' } },
      ]

      const udns = extractUdns(pods)
      expect(udns).toHaveLength(1)
    })

    it('returns empty array for pods without UDN annotations', () => {
      const pods = [{ name: 'pod-a', annotations: {} }]
      expect(extractUdns(pods)).toHaveLength(0)
    })

    it('handles undefined/empty input safely', () => {
      expect(extractUdns([])).toHaveLength(0)
    })
  })

  describe('summarizeOvnPods', () => {
    it('counts healthy and unhealthy pods', () => {
      const pods = [
        { status: 'Running', ready: '1/1' },
        { status: 'Running', ready: '1/1' },
        { status: 'Pending', ready: '0/1' },
      ]

      const summary = summarizeOvnPods(pods)
      expect(summary.total).toBe(3)
      expect(summary.healthy).toBe(2)
      expect(summary.unhealthy).toBe(1)
    })

    it('handles empty input', () => {
      const summary = summarizeOvnPods([])
      expect(summary.total).toBe(0)
      expect(summary.healthy).toBe(0)
      expect(summary.unhealthy).toBe(0)
    })
  })
})
