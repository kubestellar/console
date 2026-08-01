import { describe, it, expect, beforeAll } from 'vitest'
import { generateDrasiTopology } from '../drasiTopology'
import type { DrasiTopologyData } from '../drasiTopology'

describe('generateDrasiTopology', () => {
  let data: DrasiTopologyData

  beforeAll(() => {
    data = generateDrasiTopology()
  })

  it('returns a topology payload with all required fields', () => {
    expect(data).toEqual(
      expect.objectContaining({
        nodes: expect.any(Array),
        edges: expect.any(Array),
        totalSources: expect.any(Number),
        totalQueries: expect.any(Number),
        totalReactions: expect.any(Number),
        connectedPairs: expect.any(Number),
        orphanedNodes: expect.any(Number),
      }),
    )
  })

  it('node type counts match the totals fields', () => {
    const sources = data.nodes.filter(n => n.type === 'source').length
    const queries = data.nodes.filter(n => n.type === 'query').length
    const reactions = data.nodes.filter(n => n.type === 'reaction').length
    expect(data.totalSources).toBe(sources)
    expect(data.totalQueries).toBe(queries)
    expect(data.totalReactions).toBe(reactions)
    expect(sources + queries + reactions).toBe(data.nodes.length)
  })

  it('every node has a unique id', () => {
    const ids = data.nodes.map(n => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every node uses only the allowed status values', () => {
    for (const n of data.nodes) {
      expect(['ready', 'error', 'pending']).toContain(n.status)
    }
  })

  it('every node uses only the allowed type values', () => {
    for (const n of data.nodes) {
      expect(['source', 'query', 'reaction']).toContain(n.type)
    }
  })

  it('connectedPairs equals the number of edges', () => {
    expect(data.connectedPairs).toBe(data.edges.length)
  })

  it('every edge references existing node ids', () => {
    const ids = new Set(data.nodes.map(n => n.id))
    for (const e of data.edges) {
      expect(ids.has(e.from)).toBe(true)
      expect(ids.has(e.to)).toBe(true)
    }
  })

  it('edges flow source→query or query→reaction (never skip a tier)', () => {
    const byId = new Map(data.nodes.map(n => [n.id, n]))
    for (const e of data.edges) {
      const from = byId.get(e.from)!
      const to = byId.get(e.to)!
      const validPair =
        (from.type === 'source' && to.type === 'query') ||
        (from.type === 'query' && to.type === 'reaction')
      expect(validPair).toBe(true)
    }
  })

  it('orphanedNodes matches nodes not referenced by any edge', () => {
    const connected = new Set([
      ...data.edges.map(e => e.from),
      ...data.edges.map(e => e.to),
    ])
    const expected = data.nodes.filter(n => !connected.has(n.id)).length
    expect(data.orphanedNodes).toBe(expected)
  })

  it('is deterministic across calls (pure factory)', () => {
    const a = generateDrasiTopology()
    const b = generateDrasiTopology()
    expect(a).toEqual(b)
  })
})
