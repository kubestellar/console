import { describe, it, expect } from 'vitest'
import { __testables } from '../useChaosMeshStatus'

const { getExperimentPhase, isExperimentFailed, buildChaosMeshStatus } = __testables

const validExp = {
  metadata: { name: 'test-1', namespace: 'default' },
  kind: 'PodChaos',
  status: { phase: 'Running', startTime: '2026-04-24T00:00:00Z' }
}

const failedExp = {
  metadata: { name: 'test-2', namespace: 'default' },
  kind: 'NetworkChaos',
  status: { phase: 'Failed', startTime: '2026-04-24T00:00:00Z' }
}

const workflow = {
  metadata: { name: 'wf-1', namespace: 'default' },
  status: { phase: 'Running', progress: '1/3' }
}

describe('Chaos Mesh Hook Helpers', () => {
  describe('getExperimentPhase', () => {
    it('returns phase when available', () => {
      expect(getExperimentPhase(validExp)).toBe('Running')
    })

    it('returns Unknown when phase is missing', () => {
      expect(getExperimentPhase({ metadata: { name: 'test' } })).toBe('Unknown')
    })
  })

  describe('isExperimentFailed', () => {
    it('returns true for Failed phase', () => {
      expect(isExperimentFailed(failedExp)).toBe(true)
    })

    it('returns false for non-Failed phase', () => {
      expect(isExperimentFailed(validExp)).toBe(false)
    })
  })

  describe('buildChaosMeshStatus', () => {
    it('returns not-installed when no experiments exist', () => {
      const result = buildChaosMeshStatus([], [])
      expect(result.health).toBe('not-installed')
    })

    it('returns healthy when no experiments are failed', () => {
      const result = buildChaosMeshStatus([validExp], [workflow])
      expect(result.health).toBe('healthy')
      expect(result.summary.totalExperiments).toBe(1)
      expect(result.summary.running).toBe(1)
    })

    it('returns degraded when any experiment is failed', () => {
      const result = buildChaosMeshStatus([validExp, failedExp], [workflow])
      expect(result.health).toBe('degraded')
      expect(result.summary.totalExperiments).toBe(2)
      expect(result.summary.failed).toBe(1)
      expect(result.summary.running).toBe(1)
    })

    it('maps workflows correctly', () => {
      const result = buildChaosMeshStatus([validExp], [workflow])
      expect(result.workflows).toHaveLength(1)
      expect(result.workflows[0].name).toBe('wf-1')
      expect(result.workflows[0].phase).toBe('Running')
      expect(result.workflows[0].progress).toBe('1/3')
    })
  })
})
