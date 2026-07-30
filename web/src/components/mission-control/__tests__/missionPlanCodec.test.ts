import { describe, it, expect } from 'vitest'
import { encodePlan, decodePlan, planToState } from '../missionPlanCodec'
import type { MissionControlState } from '../types'

describe('missionPlanCodec', () => {
  const mockState: MissionControlState = {
    title: 'Test Plan',
    description: 'Test Description',
    projects: [
      {
        name: 'proj-1',
        displayName: 'Project 1',
        category: 'cat-1',
        priority: 'P1',
        reason: 'reason-1',
        dependencies: [],
      },
    ],
    assignments: [
      {
        clusterName: 'cluster-1',
        provider: 'kind',
        projectNames: ['proj-1'],
        clusterContext: 'cluster-1',
        warnings: [],
        readiness: { cpuHeadroomPercent: 0, memHeadroomPercent: 0, storageHeadroomPercent: 0, overallScore: 0 },
      },
    ],
    phases: [
      {
        phase: 1,
        name: 'Phase 1',
        projectNames: ['proj-1'],
        estimatedSeconds: 60,
      },
    ],
    deployMode: 'phased',
    phase: 'blueprint',
  }

  it('encodes and decodes a plan correctly', () => {
    const encoded = encodePlan(mockState, 'Test Notes')
    expect(typeof encoded).toBe('string')

    const decoded = decodePlan(encoded)
    expect(decoded).not.toBeNull()
    expect(decoded?.title).toBe(mockState.title)
    expect(decoded?.description).toBe(mockState.description)
    expect(decoded?.notes).toBe('Test Notes')
    expect(decoded?.projects).toHaveLength(1)
    expect(decoded?.projects[0].name).toBe('proj-1')
    expect(decoded?.assignments).toHaveLength(1)
    expect(decoded?.assignments[0].clusterName).toBe('cluster-1')
  })

  it('handles empty notes in encodePlan', () => {
    const encoded = encodePlan(mockState)
    const decoded = decodePlan(encoded)
    expect(decoded?.notes).toBeUndefined()
  })

  it('returns null for invalid encoded strings', () => {
    expect(decodePlan('invalid-base64')).toBeNull()
    expect(decodePlan(btoa('{}'))).toBeNull() // Missing version and title
  })

  it('converts a plan back to a partial state', () => {
    const encoded = encodePlan(mockState)
    const decoded = decodePlan(encoded)!
    const state = planToState(decoded)

    expect(state.title).toBe(mockState.title)
    expect(state.description).toBe(mockState.description)
    expect(state.projects).toHaveLength(1)
    expect(state.projects![0].name).toBe('proj-1')
    expect(state.assignments).toHaveLength(1)
    expect(state.assignments![0].clusterName).toBe('cluster-1')
    expect(state.assignments![0].clusterContext).toBe('cluster-1')
    expect(state.phase).toBe('blueprint')
  })
})
