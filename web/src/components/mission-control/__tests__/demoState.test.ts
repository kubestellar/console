import { describe, it, expect } from 'vitest'
import { getDemoMissionControlState } from '../demoState'

describe('demoState', () => {
  it('returns a pre-populated mission control state', () => {
    const state = getDemoMissionControlState()
    
    expect(state.phase).toBe('blueprint')
    expect(state.title).toBe('Security & Observability Stack')
    expect(state.projects).toHaveLength(5)
    expect(state.assignments).toHaveLength(3)
    expect(state.phases).toHaveLength(2)
    
    // Verify projects have required fields
    const firstProject = state.projects![0]
    expect(firstProject.name).toBe('prometheus')
    expect(firstProject.priority).toBe('required')
  })

  it('contains valid cluster assignments', () => {
    const state = getDemoMissionControlState()
    const assignments = state.assignments!
    
    expect(assignments[0].clusterName).toBe('eks-prod-us-east-1')
    expect(assignments[0].projectNames).toContain('prometheus')
    expect(assignments[0].readiness.overallScore).toBeGreaterThan(0)
  })
})
