import { describe, it, expect, vi } from 'vitest'
import { buildApprovalIssueBody } from '../buildApprovalIssueBody'
import type { MissionControlState } from '../types'

describe('buildApprovalIssueBody', () => {
  const mockState: MissionControlState = {
    title: 'Test Plan',
    description: 'Test Mission Description',
    projects: [
      {
        name: 'proj-1',
        displayName: 'Project 1',
        category: 'Monitoring',
        priority: 'P1',
        reason: 'Essential',
        dependencies: [],
      },
    ],
    assignments: [
      {
        clusterName: 'cluster-alpha',
        provider: 'kind',
        projectNames: ['proj-1'],
        clusterContext: 'cluster-alpha',
        warnings: [],
        readiness: { cpuHeadroomPercent: 0, memHeadroomPercent: 0, storageHeadroomPercent: 0, overallScore: 0 },
      },
    ],
    phases: [
      {
        phase: 1,
        name: 'Initial Phase',
        projectNames: ['proj-1'],
        estimatedSeconds: 120,
      },
    ],
    deployMode: 'phased',
    phase: 'blueprint',
  }

  it('builds a correct markdown body with all sections', () => {
    const installedProjects = new Set(['proj-existing'])
    const notes = 'Urgent deployment'
    const reviewUrl = 'https://console.example.com/plan/123'

    const body = buildApprovalIssueBody(mockState, installedProjects, notes, reviewUrl)

    expect(body).toContain('## Mission Control — Deployment Approval Request')
    expect(body).toContain('Test Mission Description')
    expect(body).toContain('### Notes from Requester')
    expect(body).toContain('Urgent deployment')
    expect(body).toContain('[View this plan interactively in KubeStellar Console](https://console.example.com/plan/123)')
    
    // Project table
    expect(body).toContain('| Project | Category | Priority | Status | Reason |')
    expect(body).toContain('| Project 1 | Monitoring | P1 | Needs Deploy | Essential |')

    // Cluster table
    expect(body).toContain('| Cluster | Projects | Assignments |')
    expect(body).toContain('| cluster-alpha | 1 | proj-1 |')

    // Phase table
    expect(body).toContain('| Phase | Estimate | Projects |')
    expect(body).toContain('| 1. Initial Phase | 2 min | proj-1 |')
    
    expect(body).toContain('### Approval Checklist')
  })

  it('handles empty phases by generating defaults', () => {
    const stateWithNoPhases = { ...mockState, phases: [] }
    const body = buildApprovalIssueBody(stateWithNoPhases, new Set())
    
    // Should contain Phase 1 (default)
    expect(body).toContain('| 1. ')
  })

  it('marks already installed projects with a checkmark', () => {
    const installedProjects = new Set(['proj-1'])
    const body = buildApprovalIssueBody(mockState, installedProjects)
    
    expect(body).toContain('proj-1 ✅')
    expect(body).toContain('Installed')
  })

  it('handles missing description and notes', () => {
    const minimalisticState = { ...mockState, description: '' }
    const body = buildApprovalIssueBody(minimalisticState, new Set())
    
    expect(body).toContain('_No description provided_')
    expect(body).not.toContain('### Notes from Requester')
  })
})
