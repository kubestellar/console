import { describe, it, expect } from 'vitest'
import {
  CONTAINERD_DEMO_DATA,
  CONTAINERD_DEMO_CONTAINERS,
  type ContainerdContainerState,
} from '../../../lib/demo/containerd'

describe('CONTAINERD_DEMO_DATA (card-level)', () => {
  it('has valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(CONTAINERD_DEMO_DATA.health)
  })

  describe('containers', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(CONTAINERD_DEMO_DATA.containers)).toBe(true)
      expect(CONTAINERD_DEMO_DATA.containers.length).toBeGreaterThan(0)
    })

    it('each container has required fields with valid state', () => {
      const validStates: ContainerdContainerState[] = ['running', 'paused', 'stopped']
      for (const c of CONTAINERD_DEMO_DATA.containers) {
        expect(typeof c.id).toBe('string')
        expect(c.id.length).toBeGreaterThan(0)
        expect(typeof c.image).toBe('string')
        expect(typeof c.namespace).toBe('string')
        expect(validStates).toContain(c.state)
        expect(typeof c.uptime).toBe('string')
        expect(typeof c.node).toBe('string')
      }
    })

    it('covers multiple container states', () => {
      const states = new Set(CONTAINERD_DEMO_DATA.containers.map(c => c.state))
      expect(states.size).toBeGreaterThanOrEqual(2)
    })
  })

  describe('summary', () => {
    it('totalContainers matches containers array length', () => {
      expect(CONTAINERD_DEMO_DATA.summary.totalContainers).toBe(
        CONTAINERD_DEMO_DATA.containers.length,
      )
    })

    it('running + paused + stopped equals totalContainers', () => {
      const { running, paused, stopped, totalContainers } = CONTAINERD_DEMO_DATA.summary
      expect(running + paused + stopped).toBe(totalContainers)
    })

    it('running count matches containers with running state', () => {
      const running = CONTAINERD_DEMO_DATA.containers.filter(c => c.state === 'running').length
      expect(CONTAINERD_DEMO_DATA.summary.running).toBe(running)
    })
  })

  it('CONTAINERD_DEMO_CONTAINERS is non-empty', () => {
    expect(CONTAINERD_DEMO_CONTAINERS.length).toBeGreaterThan(0)
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(CONTAINERD_DEMO_DATA.lastCheckTime).getTime()).not.toBeNaN()
  })
})
