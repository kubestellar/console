import { describe, it, expect } from 'vitest'
import {
  isK3sPodByLabel,
  isK3sPodByImage,
  isK3sNode,
  isK3sPod,
  classifyK3sPods,
  countK3sNodes,
  K3S_APP_LABEL,
  K3S_IMAGE_SUBSTRING,
} from '../helpers'

describe('k3s-status helpers', () => {
  describe('isK3sPodByLabel', () => {
    it('returns true when app label matches K3S_APP_LABEL', () => {
      expect(isK3sPodByLabel({ app: K3S_APP_LABEL })).toBe(true)
    })

    it('returns false for different app label', () => {
      expect(isK3sPodByLabel({ app: 'nginx' })).toBe(false)
    })

    it('returns false for undefined labels', () => {
      expect(isK3sPodByLabel(undefined)).toBe(false)
    })

    it('returns false for empty labels object', () => {
      expect(isK3sPodByLabel({})).toBe(false)
    })
  })

  describe('isK3sPodByImage', () => {
    it('returns true when container image contains K3S_IMAGE_SUBSTRING', () => {
      expect(isK3sPodByImage([{ image: `docker.io/${K3S_IMAGE_SUBSTRING}:v1.28` }])).toBe(true)
    })

    it('returns false for non-k3s images', () => {
      expect(isK3sPodByImage([{ image: 'nginx:latest' }])).toBe(false)
    })

    it('returns false for undefined containers', () => {
      expect(isK3sPodByImage(undefined)).toBe(false)
    })

    it('returns false for empty containers array', () => {
      expect(isK3sPodByImage([])).toBe(false)
    })

    it('handles container with undefined image', () => {
      expect(isK3sPodByImage([{ image: undefined }])).toBe(false)
    })

    it('is case-insensitive on image name', () => {
      expect(isK3sPodByImage([{ image: 'RANCHER/K3S:latest' }])).toBe(true)
    })
  })

  describe('isK3sNode', () => {
    it('returns true when runtime contains K3S_RUNTIME_SUBSTRING', () => {
      expect(isK3sNode('containerd://k3s-v1.28.0')).toBe(true)
    })

    it('returns false for non-k3s runtime', () => {
      expect(isK3sNode('containerd://1.7.0')).toBe(false)
    })

    it('returns false for undefined runtime', () => {
      expect(isK3sNode(undefined)).toBe(false)
    })

    it('is case-insensitive', () => {
      expect(isK3sNode('K3S-runtime')).toBe(true)
    })
  })

  describe('isK3sPod', () => {
    it('returns true if label matches', () => {
      expect(isK3sPod({ labels: { app: K3S_APP_LABEL } })).toBe(true)
    })

    it('returns true if image matches', () => {
      expect(isK3sPod({ containers: [{ image: `${K3S_IMAGE_SUBSTRING}:v1` }] })).toBe(true)
    })

    it('returns false if neither label nor image matches', () => {
      expect(isK3sPod({ labels: { app: 'nginx' }, containers: [{ image: 'nginx:1' }] })).toBe(false)
    })
  })

  describe('classifyK3sPods', () => {
    it('classifies pods with "server" in name as serverPods', () => {
      const pods = [
        { name: 'k3s-server-0', namespace: 'default' },
        { name: 'k3s-agent-1', namespace: 'default' },
      ]
      const result = classifyK3sPods(pods)
      expect(result.serverPods).toHaveLength(1)
      expect(result.agentPods).toHaveLength(1)
      expect(result.serverPods[0].name).toBe('k3s-server-0')
    })

    it('classifies pods with "server" in namespace as serverPods', () => {
      const pods = [{ name: 'pod-1', namespace: 'kube-server-system' }]
      const result = classifyK3sPods(pods)
      expect(result.serverPods).toHaveLength(1)
    })

    it('handles empty array', () => {
      const result = classifyK3sPods([])
      expect(result.serverPods).toHaveLength(0)
      expect(result.agentPods).toHaveLength(0)
    })
  })

  describe('countK3sNodes', () => {
    it('counts nodes with K3s runtime', () => {
      const nodes = [
        { name: 'node-1', containerRuntime: 'k3s://v1.28' },
        { name: 'node-2', containerRuntime: 'containerd://1.7' },
        { name: 'node-3', containerRuntime: 'k3s://v1.27' },
      ]
      expect(countK3sNodes(nodes)).toBe(2)
    })

    it('returns 0 for empty array', () => {
      expect(countK3sNodes([])).toBe(0)
    })
  })
})
