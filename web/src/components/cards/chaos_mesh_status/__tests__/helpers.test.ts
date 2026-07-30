import { describe, it, expect } from 'vitest'
import { __testables } from '../useChaosMeshStatus'

const {
  getExperimentPhase,
  getWorkflowPhase,
  isExperimentFailed,
  buildChaosMeshStatus,
  coerceCardPhase,
  derivePhaseFromConditions,
} = __testables

/** Shape returned by GET /api/mcp/custom-resources (flat fields, see CustomResourceItem in Go). */
function wireItem(overrides: Record<string, unknown> = {}) {
  return {
    name: 'demo-pod-kill',
    namespace: 'chaos-demo',
    cluster: 'kind-kubestellar',
    kind: 'PodChaos',
    status: {} as Record<string, unknown>,
    ...overrides,
  }
}

describe('Chaos Mesh Hook Helpers', () => {
  describe('derivePhaseFromConditions', () => {
    it('returns Paused when Paused condition is True', () => {
      const conditions = [
        { type: 'Paused', status: 'True' },
        { type: 'AllInjected', status: 'True' },
      ]
      expect(derivePhaseFromConditions(conditions)).toBe('Paused')
    })

    it('returns Failed when Failed condition is True', () => {
      const conditions = [
        { type: 'Failed', status: 'True' },
        { type: 'AllInjected', status: 'True' },
      ]
      expect(derivePhaseFromConditions(conditions)).toBe('Failed')
    })

    it('returns Finished when AllRecovered is True', () => {
      const conditions = [
        { type: 'AllInjected', status: 'True' },
        { type: 'AllRecovered', status: 'True' },
      ]
      expect(derivePhaseFromConditions(conditions)).toBe('Finished')
    })

    it('returns Running when AllInjected is True', () => {
      const conditions = [
        { type: 'Selected', status: 'True' },
        { type: 'AllInjected', status: 'True' },
        { type: 'AllRecovered', status: 'False' },
        { type: 'Paused', status: 'False' },
      ]
      expect(derivePhaseFromConditions(conditions)).toBe('Running')
    })

    it('returns Running when only Selected is True', () => {
      const conditions = [{ type: 'Selected', status: 'True' }]
      expect(derivePhaseFromConditions(conditions)).toBe('Running')
    })

    it('returns Unknown for empty or non-array', () => {
      expect(derivePhaseFromConditions(undefined)).toBe('Unknown')
      expect(derivePhaseFromConditions([])).toBe('Unknown')
    })
  })

  describe('getExperimentPhase', () => {
    it('prefers legacy status.phase string when present', () => {
      const item = wireItem({
        status: {
          phase: 'Running',
          conditions: [{ type: 'AllRecovered', status: 'True' }],
        },
      })
      expect(getExperimentPhase(item)).toBe('Running')
    })

    it('uses conditions when status.phase is absent', () => {
      const item = wireItem({
        status: {
          conditions: [
            { type: 'Selected', status: 'True' },
            { type: 'AllInjected', status: 'True' },
          ],
        },
      })
      expect(getExperimentPhase(item)).toBe('Running')
    })

    it('returns Unknown when phase missing and conditions inconclusive', () => {
      expect(getExperimentPhase(wireItem({ status: {} }))).toBe('Unknown')
    })
  })

  describe('getWorkflowPhase', () => {
    it('uses status.phase when set', () => {
      const wf = wireItem({ kind: 'Workflow', name: 'wf-1', status: { phase: 'Finished', progress: '1/1' } })
      expect(getWorkflowPhase(wf)).toBe('Finished')
    })
  })

  describe('coerceCardPhase', () => {
    it('passes through known phases', () => {
      expect(coerceCardPhase('Running')).toBe('Running')
      expect(coerceCardPhase('Paused')).toBe('Paused')
    })

    it('maps unknown strings to Unknown', () => {
      expect(coerceCardPhase('Run')).toBe('Unknown')
      expect(coerceCardPhase('')).toBe('Unknown')
    })
  })

  describe('isExperimentFailed', () => {
    it('returns true when phase Failed', () => {
      const item = wireItem({ status: { phase: 'Failed' } })
      expect(isExperimentFailed(item)).toBe(true)
    })

    it('returns false for Running', () => {
      const item = wireItem({ status: { conditions: [{ type: 'AllInjected', status: 'True' }] } })
      expect(isExperimentFailed(item)).toBe(false)
    })
  })

  describe('buildChaosMeshStatus', () => {
    it('returns not-installed when no experiments and no workflows', () => {
      const result = buildChaosMeshStatus([], [])
      expect(result.health).toBe('not-installed')
    })

    it('returns healthy with workflows when no experiments', () => {
      const wf = wireItem({
        name: 'resilience-suite',
        namespace: 'default',
        cluster: 'kind-kubestellar',
        kind: 'Workflow',
        status: { phase: 'Running', progress: '2/4' },
      })
      const result = buildChaosMeshStatus([], [wf])
      expect(result.health).toBe('healthy')
      expect(result.workflows).toHaveLength(1)
      expect(result.experiments).toHaveLength(0)
      expect(result.summary.totalExperiments).toBe(0)
      expect(result.workflows[0].name).toBe('resilience-suite')
    })

    it('maps flat wire fields for experiments and workflows', () => {
      const podChaos = wireItem({
        name: 'demo-pod-kill',
        namespace: 'chaos-demo',
        cluster: 'kind-kubestellar',
        kind: 'PodChaos',
        status: {
          conditions: [{ type: 'AllInjected', status: 'True' }],
        },
      })
      const wf = {
        name: 'resilience-suite',
        namespace: 'default',
        cluster: 'kind-kubestellar',
        kind: 'Workflow',
        status: { phase: 'Running', progress: '2/4' },
      }
      const result = buildChaosMeshStatus([podChaos], [wf])
      expect(result.experiments[0]).toMatchObject({
        name: 'demo-pod-kill',
        namespace: 'chaos-demo',
        cluster: 'kind-kubestellar',
        kind: 'PodChaos',
        phase: 'Running',
      })
      expect(result.workflows[0]).toMatchObject({
        name: 'resilience-suite',
        namespace: 'default',
        cluster: 'kind-kubestellar',
        phase: 'Running',
        progress: '2/4',
      })
      expect(result.summary.totalExperiments).toBe(1)
      expect(result.summary.running).toBe(1)
      expect(result.health).toBe('healthy')
    })

    it('returns degraded when any experiment is failed', () => {
      const ok = wireItem({ name: 'a', status: { phase: 'Running' } })
      const bad = wireItem({ name: 'b', status: { phase: 'Failed' } })
      const result = buildChaosMeshStatus([ok, bad], [])
      expect(result.health).toBe('degraded')
      expect(result.summary.totalExperiments).toBe(2)
      expect(result.summary.failed).toBe(1)
      expect(result.summary.running).toBe(1)
    })

    it('maps flattened backend items without kind to Unknown kind', () => {
      const result = buildChaosMeshStatus(
        [
          {
            name: 'demo-pod-kill',
            namespace: 'chaos-demo',
            status: { phase: 'Running', startTime: '2026-04-24T00:00:00Z' },
          },
        ],
        [
          {
            name: 'chaos-workflow',
            namespace: 'chaos-demo',
            status: { phase: 'Running', progress: '1/2' },
          },
        ],
      )

      expect(result.summary.totalExperiments).toBe(1)
      expect(result.experiments[0].name).toBe('demo-pod-kill')
      expect(result.experiments[0].namespace).toBe('chaos-demo')
      expect(result.experiments[0].kind).toBe('Unknown')
      expect(result.workflows[0].name).toBe('chaos-workflow')
      expect(result.workflows[0].namespace).toBe('chaos-demo')
    })

    it('accepts legacy nested metadata when flat name is absent', () => {
      const result = buildChaosMeshStatus(
        [
          {
            metadata: { name: 'meta-exp', namespace: 'meta-ns' },
            status: { phase: 'Paused' },
          },
        ],
        [],
      )
      expect(result.experiments[0].name).toBe('meta-exp')
      expect(result.experiments[0].namespace).toBe('meta-ns')
      expect(result.experiments[0].phase).toBe('Paused')
    })
  })
})
