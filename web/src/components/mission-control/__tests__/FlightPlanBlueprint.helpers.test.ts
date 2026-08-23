import { describe, it, expect } from 'vitest'
import {
  clampInfoPanelWidth,
  clampZoom,
  computeGlowEdges,
  computeGlowProjectKeys,
  computeHealthyState,
  resolveLabelY,
  splitProjectKey,
} from '../FlightPlanBlueprint.utils'
import {
  INFO_PANEL_MIN, INFO_PANEL_MAX, ZOOM_MIN, ZOOM_MAX, NODE_RADIUS, LABEL_OFFSET_Y, MIN_LABEL_GAP,
} from '../FlightPlanBlueprint.constants'
import type { BlueprintLayout, ClusterAssignment, MissionControlState, ProjectPosition } from '../types'
import type { ClusterInfo } from '../../../hooks/mcp/types'

function makeAssignment(clusterName: string, projectNames: string[]): ClusterAssignment {
  return {
    clusterName,
    provider: 'kind',
    projectNames,
    clusterContext: clusterName,
    warnings: [],
    readiness: { cpuHeadroomPercent: 0, memHeadroomPercent: 0, storageHeadroomPercent: 0, overallScore: 0 },
  }
}

function makeState(assignments: ClusterAssignment[], targetClusters: string[] = []): MissionControlState {
  return {
    phase: 'blueprint',
    description: '',
    title: 'Test',
    projects: [],
    assignments,
    phases: [],
    overlay: 'architecture',
    deployMode: 'phased',
    targetClusters,
    aiStreaming: false,
    launchProgress: [],
  }
}

describe('computeHealthyState', () => {
  it('returns assignments unchanged when no targets and no unhealthy clusters', () => {
    const state = makeState([makeAssignment('c1', ['prometheus'])])
    const result = computeHealthyState(state, [{ name: 'c1', healthy: true } as ClusterInfo])
    expect(result.assignments).toEqual(state.assignments)
  })

  it('scopes assignments to the selected target clusters', () => {
    const state = makeState(
      [makeAssignment('c1', ['prometheus']), makeAssignment('c2', ['grafana'])],
      ['c1'],
    )
    const result = computeHealthyState(state, undefined)
    expect(result.assignments.map(a => a.clusterName)).toEqual(['c1'])
  })

  it('redistributes projects off an unhealthy cluster onto healthy ones', () => {
    const state = makeState([makeAssignment('c1', ['prometheus']), makeAssignment('c2', ['grafana'])])
    const clusters = [
      { name: 'c1', healthy: true },
      { name: 'c2', healthy: false },
    ] as ClusterInfo[]
    const result = computeHealthyState(state, clusters)
    expect(result.assignments.map(a => a.clusterName)).toEqual(['c1'])
    expect(result.assignments[0].projectNames).toEqual(['prometheus', 'grafana'])
  })

  it('treats unreachable clusters as unhealthy', () => {
    const state = makeState([makeAssignment('c1', ['prometheus']), makeAssignment('c2', ['grafana'])])
    const clusters = [
      { name: 'c1', reachable: true },
      { name: 'c2', reachable: false },
    ] as ClusterInfo[]
    const result = computeHealthyState(state, clusters)
    expect(result.assignments.map(a => a.clusterName)).toEqual(['c1'])
  })

  it('does not mutate the original assignments when redistributing', () => {
    const state = makeState([makeAssignment('c1', ['prometheus']), makeAssignment('c2', ['grafana'])])
    computeHealthyState(state, [{ name: 'c2', healthy: false }] as ClusterInfo[])
    expect(state.assignments[0].projectNames).toEqual(['prometheus'])
  })

  it('keeps assignments for clusters missing from the cluster list', () => {
    const state = makeState([makeAssignment('not-loaded-yet', ['prometheus'])])
    const result = computeHealthyState(state, [{ name: 'c1', healthy: true }] as ClusterInfo[])
    expect(result.assignments.map(a => a.clusterName)).toEqual(['not-loaded-yet'])
  })
})

describe('splitProjectKey', () => {
  it('splits a composite cluster/project key', () => {
    expect(splitProjectKey('c1/prometheus')).toEqual({ clusterName: 'c1', projectName: 'prometheus' })
  })

  it('returns nulls for a null key', () => {
    expect(splitProjectKey(null)).toEqual({ clusterName: null, projectName: null })
  })

  it('returns a null project name when the key has no separator', () => {
    expect(splitProjectKey('c1')).toEqual({ clusterName: 'c1', projectName: null })
  })
})

const posA: ProjectPosition = { projectName: 'a', cx: 10, cy: 10, clusterName: 'c1' }
const posB: ProjectPosition = { projectName: 'b', cx: 50, cy: 10, clusterName: 'c1' }
const posC: ProjectPosition = { projectName: 'c', cx: 10, cy: 60, clusterName: 'c2' }

const layout: BlueprintLayout = {
  clusterRects: new Map(),
  projectPositions: new Map([
    ['c1/a', posA],
    ['c1/b', posB],
    ['c2/c', posC],
  ]),
  dependencyEdges: [
    { from: 'a', to: 'b', crossCluster: false, fromPos: posA, toPos: posB },
    { from: 'a', to: 'c', crossCluster: true, fromPos: posA, toPos: posC },
  ],
  viewBox: { width: 100, height: 100 },
}

describe('computeGlowEdges', () => {
  const base = { hoveredEdge: null, hoveredProjectKey: null, hoveredProjectName: null, hoveredCluster: null, layout }

  it('returns an empty set when nothing is hovered', () => {
    expect(computeGlowEdges(base).size).toBe(0)
  })

  it('returns an empty set when the layout is null', () => {
    expect(computeGlowEdges({ ...base, layout: null, hoveredEdge: { from: 'a', to: 'b' } }).size).toBe(0)
  })

  it('glows the hovered edge scoped to its cluster', () => {
    const edges = computeGlowEdges({ ...base, hoveredEdge: { from: 'a', to: 'b' } })
    expect(Array.from(edges)).toEqual(['c1:a-b'])
  })

  it('glows same-cluster and cross-cluster edges of the hovered project', () => {
    const edges = computeGlowEdges({
      ...base,
      hoveredProjectKey: 'c1/a',
      hoveredProjectName: 'a',
      hoveredCluster: 'c1',
    })
    expect(edges.has('c1:a-b')).toBe(true)
    expect(edges.has('c1:a-c')).toBe(true)
  })

  it('does not glow same-cluster edges belonging to another cluster', () => {
    const edges = computeGlowEdges({
      ...base,
      hoveredProjectKey: 'c2/b',
      hoveredProjectName: 'b',
      hoveredCluster: 'c2',
    })
    expect(edges.has('c1:a-b')).toBe(false)
  })
})

describe('computeGlowProjectKeys', () => {
  const base = { hoveredEdge: null, hoveredProjectKey: null, hoveredProjectName: null, hoveredCluster: null, layout }

  it('returns an empty set when nothing is hovered', () => {
    expect(computeGlowProjectKeys(base).size).toBe(0)
  })

  it('glows both endpoints of a hovered edge', () => {
    const keys = computeGlowProjectKeys({ ...base, hoveredEdge: { from: 'a', to: 'b' } })
    expect(keys.has('c1/a')).toBe(true)
    expect(keys.has('c1/b')).toBe(true)
  })

  it('glows the hovered project itself', () => {
    const keys = computeGlowProjectKeys({
      ...base,
      hoveredProjectKey: 'c1/a',
      hoveredProjectName: 'a',
      hoveredCluster: 'c1',
    })
    expect(keys.has('c1/a')).toBe(true)
  })

  it('glows same-cluster and cross-cluster neighbours of the hovered project', () => {
    const keys = computeGlowProjectKeys({
      ...base,
      hoveredProjectKey: 'c1/a',
      hoveredProjectName: 'a',
      hoveredCluster: 'c1',
    })
    expect(keys.has('c1/b')).toBe(true)
    expect(keys.has('c2/c')).toBe(true)
  })
})

describe('clampInfoPanelWidth', () => {
  it('clamps below the minimum', () => {
    expect(clampInfoPanelWidth(INFO_PANEL_MIN - 100)).toBe(INFO_PANEL_MIN)
  })

  it('clamps above the maximum', () => {
    expect(clampInfoPanelWidth(INFO_PANEL_MAX + 100)).toBe(INFO_PANEL_MAX)
  })

  it('passes through an in-range width', () => {
    expect(clampInfoPanelWidth(INFO_PANEL_MIN + 1)).toBe(INFO_PANEL_MIN + 1)
  })
})

describe('clampZoom', () => {
  it('clamps below the minimum', () => {
    expect(clampZoom(ZOOM_MIN - 1)).toBe(ZOOM_MIN)
  })

  it('clamps above the maximum', () => {
    expect(clampZoom(ZOOM_MAX + 1)).toBe(ZOOM_MAX)
  })

  it('passes through an in-range zoom', () => {
    expect(clampZoom(1)).toBe(1)
  })
})

describe('resolveLabelY', () => {
  it('places the label above the edge midpoint when nothing is nearby', () => {
    const slots: { x: number; y: number }[] = []
    expect(resolveLabelY(200, 100, [], slots)).toBe(100 - LABEL_OFFSET_Y)
  })

  it('records the placed label in the slot list', () => {
    const slots: { x: number; y: number }[] = []
    resolveLabelY(200, 100, [], slots)
    expect(slots).toEqual([{ x: 200, y: 100 - LABEL_OFFSET_Y }])
  })

  it('pushes the label clear of a nearby project node', () => {
    const node: ProjectPosition = { projectName: 'a', cx: 200, cy: 92, clusterName: 'c1' }
    const y = resolveLabelY(200, 100, [node], [])
    expect(y).toBe(node.cy - NODE_RADIUS - LABEL_OFFSET_Y)
  })

  it('pushes the label above an overlapping label slot', () => {
    const slots = [{ x: 200, y: 88 }]
    const y = resolveLabelY(200, 100, [], slots)
    expect(y).toBe(88 - MIN_LABEL_GAP)
  })
})
