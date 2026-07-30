/**
 * Unit tests for pure helper functions in useEPPRoutingData.ts
 *
 * Tests buildRawNodes, buildNodePodMap, buildLinks, buildSummaryMetrics,
 * scaleNodesForExpanded, and generatePath — all pure functions that can
 * be verified without React hook mocking.
 */
import { describe, it, expect } from 'vitest'

// Re-export helpers for testing via the barrel
import {
  buildRawNodes,
  buildNodePodMap,
  buildLinks,
  buildSummaryMetrics,
  scaleNodesForExpanded,
} from '../epp-routing-helpers'
import type { FlowNode, FlowLink } from '../useEPPRoutingData'
import type { LLMdStack } from '../../../../../hooks/useStackDiscovery'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeStack = (overrides: Partial<LLMdStack> = {}): LLMdStack => ({
  id: 'test-stack',
  name: 'test',
  cluster: 'cluster-1',
  namespace: 'default',
  model: 'llama-3',
  components: {
    prefill: [{ name: 'prefill-deploy', replicas: 2, podNames: ['prefill-pod-0', 'prefill-pod-1'] }],
    decode: [{ name: 'decode-deploy', replicas: 2, podNames: ['decode-pod-0', 'decode-pod-1'] }],
    both: [],
  },
  autoscaler: null,
  ...overrides,
})

// ---------------------------------------------------------------------------
// buildRawNodes
// ---------------------------------------------------------------------------

describe('buildRawNodes', () => {
  it('returns demo NODES when no stack and isDemoMode is true', () => {
    const nodes = buildRawNodes(null, true)
    expect(nodes.length).toBe(7) // requests, epp, 3 prefill, 2 decode
    expect(nodes[0].id).toBe('requests')
    expect(nodes[1].id).toBe('epp')
  })

  it('returns empty array when no stack and isDemoMode is false', () => {
    const nodes = buildRawNodes(null, false)
    expect(nodes).toEqual([])
  })

  it('builds disaggregated nodes from a stack with prefill + decode', () => {
    const stack = makeStack()
    const nodes = buildRawNodes(stack, false)
    // Should have: requests, epp, prefill-0, prefill-1, decode-0, decode-1
    expect(nodes.length).toBe(6)
    expect(nodes.filter(n => n.id.startsWith('prefill-')).length).toBe(2)
    expect(nodes.filter(n => n.id.startsWith('decode-')).length).toBe(2)
  })

  it('builds decode-only nodes when no prefill replicas', () => {
    const stack = makeStack({
      components: {
        prefill: [],
        decode: [{ name: 'decode-deploy', replicas: 3, podNames: [] }],
        both: [],
      },
    })
    const nodes = buildRawNodes(stack, false)
    const decodeNodes = nodes.filter(n => n.type === 'decode')
    expect(decodeNodes.length).toBe(3)
    // When only decode, x position should be 75
    expect(decodeNodes[0].x).toBe(75)
  })

  it('builds prefill-only nodes when no decode replicas', () => {
    const stack = makeStack({
      components: {
        prefill: [{ name: 'prefill-deploy', replicas: 2, podNames: [] }],
        decode: [],
        both: [],
      },
    })
    const nodes = buildRawNodes(stack, false)
    const prefillNodes = nodes.filter(n => n.type === 'prefill')
    expect(prefillNodes.length).toBe(2)
    expect(prefillNodes[0].x).toBe(75)
  })

  it('builds unified server nodes from "both" component', () => {
    const stack = makeStack({
      components: {
        prefill: [],
        decode: [],
        both: [{ name: 'server-deploy', replicas: 3, podNames: ['s0', 's1', 's2'] }],
      },
    })
    const nodes = buildRawNodes(stack, false)
    const serverNodes = nodes.filter(n => n.id.startsWith('server-'))
    expect(serverNodes.length).toBe(3)
  })

  it('builds ghost nodes when autoscaler present but no replicas', () => {
    const stack = makeStack({
      components: { prefill: [], decode: [], both: [] },
      autoscaler: { minReplicas: 0, maxReplicas: 5 } as LLMdStack['autoscaler'],
    })
    const nodes = buildRawNodes(stack, false)
    const ghostNodes = nodes.filter(n => n.isGhost)
    expect(ghostNodes.length).toBe(3) // min(maxReplicas, 3)
    expect(ghostNodes[0].label).toBe('(scaled to 0)')
  })

  it('caps prefill nodes at 10', () => {
    const stack = makeStack({
      components: {
        prefill: [{ name: 'prefill-deploy', replicas: 15, podNames: [] }],
        decode: [{ name: 'decode-deploy', replicas: 1, podNames: [] }],
        both: [],
      },
    })
    const nodes = buildRawNodes(stack, false)
    const prefillNodes = nodes.filter(n => n.id.startsWith('prefill-'))
    expect(prefillNodes.length).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// buildNodePodMap
// ---------------------------------------------------------------------------

describe('buildNodePodMap', () => {
  it('returns empty map when no stack', () => {
    expect(buildNodePodMap(null)).toEqual({})
  })

  it('maps prefill node IDs to their pod names', () => {
    const stack = makeStack()
    const map = buildNodePodMap(stack)
    expect(map['prefill-0']).toEqual(['prefill-pod-0'])
    expect(map['prefill-1']).toEqual(['prefill-pod-1'])
  })

  it('maps decode node IDs to their pod names', () => {
    const stack = makeStack()
    const map = buildNodePodMap(stack)
    expect(map['decode-0']).toEqual(['decode-pod-0'])
    expect(map['decode-1']).toEqual(['decode-pod-1'])
  })

  it('maps unified server node IDs', () => {
    const stack = makeStack({
      components: {
        prefill: [],
        decode: [],
        both: [{ name: 'server', replicas: 2, podNames: ['srv-0', 'srv-1'] }],
      },
    })
    const map = buildNodePodMap(stack)
    expect(map['server-0']).toEqual(['srv-0'])
    expect(map['server-1']).toEqual(['srv-1'])
  })

  it('skips pods without a name', () => {
    const stack = makeStack({
      components: {
        prefill: [{ name: 'prefill', replicas: 2, podNames: [undefined as unknown as string, 'pod-1'] }],
        decode: [],
        both: [],
      },
    })
    const map = buildNodePodMap(stack)
    expect(map['prefill-0']).toBeUndefined()
    expect(map['prefill-1']).toEqual(['pod-1'])
  })
})

// ---------------------------------------------------------------------------
// buildLinks
// ---------------------------------------------------------------------------

describe('buildLinks', () => {
  it('returns default demo links when no target nodes exist', () => {
    const nodes: FlowNode[] = [
      { id: 'requests', label: 'Requests', x: 12, y: 50, type: 'source', color: '#3b82f6' },
      { id: 'epp', label: 'EPP', x: 38, y: 50, type: 'router', color: '#f59e0b' },
    ]
    const links = buildLinks(nodes)
    // Should return the default hardcoded links
    expect(links.length).toBeGreaterThan(1)
    expect(links[0].source).toBe('requests')
    expect(links[0].target).toBe('epp')
  })

  it('builds prefill + decode links for disaggregated topology', () => {
    const nodes: FlowNode[] = [
      { id: 'requests', label: 'Requests', x: 12, y: 50, type: 'source', color: '#3b82f6' },
      { id: 'epp', label: 'EPP', x: 38, y: 50, type: 'router', color: '#f59e0b' },
      { id: 'prefill-0', label: 'Prefill-0', x: 65, y: 25, type: 'prefill', color: '#9333ea' },
      { id: 'prefill-1', label: 'Prefill-1', x: 65, y: 75, type: 'prefill', color: '#9333ea' },
      { id: 'decode-0', label: 'Decode-0', x: 90, y: 50, type: 'decode', color: '#22c55e' },
    ]
    const links = buildLinks(nodes)
    // Should have: requests→epp, epp→prefill-0, epp→prefill-1, epp→decode-0,
    // prefill-0→decode-0, prefill-1→decode-0
    const eppToPrefill = links.filter(l => l.source === 'epp' && l.target.startsWith('prefill'))
    const eppToDecode = links.filter(l => l.source === 'epp' && l.target.startsWith('decode'))
    const prefillToDecode = links.filter(l => l.source.startsWith('prefill') && l.target.startsWith('decode'))
    expect(eppToPrefill.length).toBe(2)
    expect(eppToDecode.length).toBe(1)
    expect(prefillToDecode.length).toBe(2) // each prefill connects to each decode
  })

  it('builds links for server-only topology', () => {
    const nodes: FlowNode[] = [
      { id: 'requests', label: 'Requests', x: 12, y: 50, type: 'source', color: '#3b82f6' },
      { id: 'epp', label: 'EPP', x: 38, y: 50, type: 'router', color: '#f59e0b' },
      { id: 'server-0', label: 'Server-0', x: 75, y: 25, type: 'prefill', color: '#9333ea' },
      { id: 'server-1', label: 'Server-1', x: 75, y: 75, type: 'prefill', color: '#9333ea' },
    ]
    const links = buildLinks(nodes)
    const serverLinks = links.filter(l => l.target.startsWith('server-'))
    expect(serverLinks.length).toBe(2)
    expect(serverLinks[0].type).toBe('prefill')
  })

  it('always includes requests→epp as the first link', () => {
    const nodes: FlowNode[] = [
      { id: 'requests', label: 'Requests', x: 12, y: 50, type: 'source', color: '#3b82f6' },
      { id: 'epp', label: 'EPP', x: 38, y: 50, type: 'router', color: '#f59e0b' },
      { id: 'prefill-0', label: 'Prefill-0', x: 65, y: 50, type: 'prefill', color: '#9333ea' },
    ]
    const links = buildLinks(nodes)
    expect(links[0]).toEqual(expect.objectContaining({ source: 'requests', target: 'epp', percentage: 100 }))
  })
})

// ---------------------------------------------------------------------------
// buildSummaryMetrics
// ---------------------------------------------------------------------------

describe('buildSummaryMetrics', () => {
  it('calculates prefill and decode RPS from links sourced from epp', () => {
    const links: FlowLink[] = [
      { source: 'requests', target: 'epp', value: 450, percentage: 100, type: 'prefill' },
      { source: 'epp', target: 'prefill-0', value: 200, percentage: 44, type: 'prefill' },
      { source: 'epp', target: 'prefill-1', value: 150, percentage: 33, type: 'prefill' },
      { source: 'epp', target: 'decode-0', value: 100, percentage: 22, type: 'decode' },
    ]
    const metrics = buildSummaryMetrics(links)
    expect(metrics.totalRps).toBe(450)
    expect(metrics.prefillRps).toBe(350) // 200 + 150
    expect(metrics.decodeRps).toBe(100)
    expect(metrics.prefillPercent).toBe(78) // Math.round(350/450*100)
    expect(metrics.decodePercent).toBe(22) // Math.round(100/450*100)
  })

  it('returns zeros when no epp→target links exist', () => {
    const links: FlowLink[] = [
      { source: 'requests', target: 'epp', value: 450, percentage: 100, type: 'prefill' },
    ]
    const metrics = buildSummaryMetrics(links)
    expect(metrics.prefillRps).toBe(0)
    expect(metrics.decodeRps).toBe(0)
    expect(metrics.prefillPercent).toBe(0)
    expect(metrics.decodePercent).toBe(0)
  })

  it('handles all-prefill routing (no decode targets)', () => {
    const links: FlowLink[] = [
      { source: 'requests', target: 'epp', value: 450, percentage: 100, type: 'prefill' },
      { source: 'epp', target: 'prefill-0', value: 225, percentage: 50, type: 'prefill' },
      { source: 'epp', target: 'prefill-1', value: 225, percentage: 50, type: 'prefill' },
    ]
    const metrics = buildSummaryMetrics(links)
    expect(metrics.prefillRps).toBe(450)
    expect(metrics.decodeRps).toBe(0)
    expect(metrics.prefillPercent).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// scaleNodesForExpanded
// ---------------------------------------------------------------------------

describe('scaleNodesForExpanded', () => {
  const sampleNodes: FlowNode[] = [
    { id: 'requests', label: 'Requests', x: 12, y: 50, type: 'source', color: '#3b82f6' },
    { id: 'epp', label: 'EPP', x: 38, y: 50, type: 'router', color: '#f59e0b' },
    { id: 'decode-0', label: 'Decode-0', x: 90, y: 50, type: 'decode', color: '#22c55e' },
  ]

  it('returns nodes unchanged when not expanded', () => {
    const result = scaleNodesForExpanded(sampleNodes, false)
    expect(result).toEqual(sampleNodes)
  })

  it('returns empty array unchanged', () => {
    expect(scaleNodesForExpanded([], true)).toEqual([])
  })

  it('scales node x positions when expanded', () => {
    const result = scaleNodesForExpanded(sampleNodes, true)
    // Formula: 10 + (node.x - 12) * (210 / 78)
    expect(result[0].x).toBeCloseTo(10) // 10 + (12-12) * scale = 10
    expect(result[1].x).toBeCloseTo(10 + (38 - 12) * (210 / 78))
    expect(result[2].x).toBeCloseTo(10 + (90 - 12) * (210 / 78))
  })

  it('preserves y positions', () => {
    const result = scaleNodesForExpanded(sampleNodes, true)
    result.forEach((node, i) => {
      expect(node.y).toBe(sampleNodes[i].y)
    })
  })

  it('preserves all other node properties', () => {
    const result = scaleNodesForExpanded(sampleNodes, true)
    result.forEach((node, i) => {
      expect(node.id).toBe(sampleNodes[i].id)
      expect(node.label).toBe(sampleNodes[i].label)
      expect(node.type).toBe(sampleNodes[i].type)
      expect(node.color).toBe(sampleNodes[i].color)
    })
  })
})
