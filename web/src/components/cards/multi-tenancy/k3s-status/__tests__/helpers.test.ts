import { describe, expect, it } from 'vitest'
import {
  classifyK3sPods,
  countK3sNodes,
  isK3sNode,
  isK3sPod,
  isK3sPodByImage,
  isK3sPodByLabel,
  isPodHealthy,
  parseReadyCount,
} from '../helpers'

describe('k3s-status helpers', () => {
  describe('isK3sPodByLabel', () => {
    it('detects pods with app=k3s label', () => {
      expect(isK3sPodByLabel({ app: 'k3s' })).toBe(true)
    })

    it('rejects non-K3s labels', () => {
      expect(isK3sPodByLabel({ app: 'nginx' })).toBe(false)
      expect(isK3sPodByLabel({})).toBe(false)
      expect(isK3sPodByLabel(undefined)).toBe(false)
    })
  })

  describe('isK3sPodByImage', () => {
    it('detects pods with rancher/k3s image', () => {
      expect(isK3sPodByImage([{ image: 'rancher/k3s:v1.29.0-k3s1' }])).toBe(true)
    })

    it('detects case-insensitively', () => {
      expect(isK3sPodByImage([{ image: 'Rancher/K3s:latest' }])).toBe(true)
    })

    it('rejects non-K3s images', () => {
      expect(isK3sPodByImage([{ image: 'nginx:latest' }])).toBe(false)
      expect(isK3sPodByImage([])).toBe(false)
      expect(isK3sPodByImage(undefined)).toBe(false)
    })
  })

  describe('isK3sNode', () => {
    it('detects K3s runtime', () => {
      expect(isK3sNode('containerd://k3s-1.29.0')).toBe(true)
      expect(isK3sNode('k3s://v1.29.0')).toBe(true)
    })

    it('rejects non-K3s runtime', () => {
      expect(isK3sNode('containerd://1.7.1')).toBe(false)
      expect(isK3sNode(undefined)).toBe(false)
    })
  })

  describe('isK3sPod', () => {
    it('detects by label', () => {
      expect(isK3sPod({ labels: { app: 'k3s' } })).toBe(true)
    })

    it('detects by image', () => {
      expect(isK3sPod({ containers: [{ image: 'rancher/k3s:v1.29.0' }] })).toBe(true)
    })

    it('rejects non-K3s pods', () => {
      expect(isK3sPod({ labels: { app: 'nginx' }, containers: [{ image: 'nginx:latest' }] })).toBe(false)
    })
  })

  describe('parseReadyCount', () => {
    it('parses valid ready string', () => {
      expect(parseReadyCount('1/1')).toEqual({ ready: 1, total: 1 })
    })

    it('handles invalid input', () => {
      expect(parseReadyCount(undefined)).toEqual({ ready: 0, total: 0 })
    })
  })

  describe('isPodHealthy', () => {
    it('reports healthy when running with all containers ready', () => {
      expect(isPodHealthy({ status: 'Running', ready: '1/1' })).toBe(true)
    })

    it('reports unhealthy when not running', () => {
      expect(isPodHealthy({ status: 'Pending', ready: '0/1' })).toBe(false)
    })
  })

  describe('classifyK3sPods', () => {
    it('separates server and agent pods', () => {
      const pods = [
        { name: 'k3s-server-0', namespace: 'kube-system' },
        { name: 'k3s-agent-abc', namespace: 'kube-system' },
        { name: 'my-server-pod', namespace: 'default' },
      ]

      const { serverPods, agentPods } = classifyK3sPods(pods)
      expect(serverPods).toHaveLength(2)
      expect(agentPods).toHaveLength(1)
    })

    it('handles empty input', () => {
      const { serverPods, agentPods } = classifyK3sPods([])
      expect(serverPods).toHaveLength(0)
      expect(agentPods).toHaveLength(0)
    })
  })

  describe('countK3sNodes', () => {
    it('counts nodes with K3s runtime', () => {
      const nodes = [
        { name: 'node-1', containerRuntime: 'containerd://k3s-1.29.0' },
        { name: 'node-2', containerRuntime: 'containerd://1.7.1' },
        { name: 'node-3', containerRuntime: 'k3s://v1.28.0' },
      ]

      expect(countK3sNodes(nodes)).toBe(2)
    })

    it('returns 0 for empty input', () => {
      expect(countK3sNodes([])).toBe(0)
    })
  })
})
