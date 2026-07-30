import { describe, it, expect } from 'vitest'
import { computeLayout, INTEGRATION_LABELS } from '../BlueprintLayout'
import type { MissionControlState } from '../types'

describe('BlueprintLayout', () => {
  const mockState: MissionControlState = {
    title: 'Test Layout',
    description: 'Test Description',
    projects: [
      {
        name: 'prometheus',
        displayName: 'Prometheus',
        category: 'Monitoring',
        priority: 'P1',
        reason: 'Essential',
        dependencies: [],
      },
      {
        name: 'grafana',
        displayName: 'Grafana',
        category: 'Visualization',
        priority: 'P1',
        reason: 'Essential',
        dependencies: ['prometheus'],
      },
    ],
    assignments: [
      {
        clusterName: 'cluster-1',
        provider: 'kind',
        projectNames: ['prometheus', 'grafana'],
        clusterContext: 'cluster-1',
        warnings: [],
        readiness: { cpuHeadroomPercent: 0, memHeadroomPercent: 0, storageHeadroomPercent: 0, overallScore: 0 },
      },
    ],
    phases: [],
    deployMode: 'phased',
    phase: 'blueprint',
  }

  it('computes layout for a simple single-cluster mission', () => {
    const layout = computeLayout(mockState)
    
    expect(layout.viewBox.width).toBe(560)
    expect(layout.viewBox.height).toBeGreaterThanOrEqual(360)
    
    expect(layout.clusterRects.has('cluster-1')).toBe(true)
    const rect = layout.clusterRects.get('cluster-1')!
    expect(rect.width).toBeGreaterThan(0)
    expect(rect.height).toBeGreaterThan(0)

    // Positions for projects
    expect(layout.projectPositions.has('cluster-1/prometheus')).toBe(true)
    expect(layout.projectPositions.has('cluster-1/grafana')).toBe(true)
    
    const posProm = layout.projectPositions.get('cluster-1/prometheus')!
    const posGraf = layout.projectPositions.get('cluster-1/grafana')!
    
    // They should be different
    expect(posProm.cx).not.toBe(posGraf.cx)
  })

  it('identifies explicit dependencies as edges', () => {
    const layout = computeLayout(mockState)
    
    const edge = layout.dependencyEdges.find(e => e.from === 'grafana' && e.to === 'prometheus')
    expect(edge).toBeDefined()
    expect(edge?.crossCluster).toBe(false)
  })

  it('identifies implicit integrations from INTEGRATION_LABELS', () => {
    // Add a project that has an implicit integration with prometheus but no explicit dep
    const stateWithImplicit = {
      ...mockState,
      projects: [
        ...mockState.projects,
        {
          name: 'cilium',
          displayName: 'Cilium',
          category: 'Network',
          priority: 'P1',
          reason: 'Network',
          dependencies: [],
        }
      ],
      assignments: [
        {
          ...mockState.assignments[0],
          projectNames: ['prometheus', 'grafana', 'cilium']
        }
      ]
    }
    
    const layout = computeLayout(stateWithImplicit)
    
    // prometheus -> cilium integration should exist in INTEGRATION_LABELS
    expect(INTEGRATION_LABELS['prometheus']?.['cilium']).toBe('network metrics')
    
    const edge = layout.dependencyEdges.find(e => 
      (e.from === 'prometheus' && e.to === 'cilium') || 
      (e.from === 'cilium' && e.to === 'prometheus')
    )
    expect(edge).toBeDefined()
    expect(edge?.label).toBe('network metrics')
  })

  it('handles multiple clusters and identifies cross-cluster edges', () => {
    const multiClusterState: MissionControlState = {
      ...mockState,
      assignments: [
        {
          clusterName: 'cluster-1',
          provider: 'kind',
          projectNames: ['prometheus'],
          clusterContext: 'cluster-1',
          warnings: [],
          readiness: { cpuHeadroomPercent: 0, memHeadroomPercent: 0, storageHeadroomPercent: 0, overallScore: 0 },
        },
        {
          clusterName: 'cluster-2',
          provider: 'kind',
          projectNames: ['grafana'],
          clusterContext: 'cluster-2',
          warnings: [],
          readiness: { cpuHeadroomPercent: 0, memHeadroomPercent: 0, storageHeadroomPercent: 0, overallScore: 0 },
        }
      ]
    }
    
    const layout = computeLayout(multiClusterState)
    
    expect(layout.clusterRects.size).toBe(2)
    const edge = layout.dependencyEdges.find(e => e.from === 'grafana' && e.to === 'prometheus')
    expect(edge).toBeDefined()
    expect(edge?.crossCluster).toBe(true)
  })
})
