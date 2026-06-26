import { describe, it, expect } from 'vitest'
import { computeFlows, FLOW_ID_ALL } from '../DrasiFlowUtils'
import type { DrasiSource, DrasiQuery, DrasiReaction } from '../DrasiTypes'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeSource = (id: string, name = `Source-${id}`): DrasiSource => ({
  id,
  name,
  kind: 'POSTGRES',
  status: 'ready',
})

const makeQuery = (
  id: string,
  sourceIds: string[],
  name = `Query-${id}`,
): DrasiQuery => ({
  id,
  name,
  language: 'cypher',
  status: 'ready',
  sourceIds,
})

const makeReaction = (
  id: string,
  queryIds: string[],
  name = `Reaction-${id}`,
): DrasiReaction => ({
  id,
  name,
  kind: 'SSE',
  status: 'ready',
  queryIds,
})

// ---------------------------------------------------------------------------
// FLOW_ID_ALL sentinel
// ---------------------------------------------------------------------------

describe('FLOW_ID_ALL', () => {
  it('is a stable sentinel string', () => {
    expect(FLOW_ID_ALL).toBe('__all__')
  })
})

// ---------------------------------------------------------------------------
// computeFlows — edge cases
// ---------------------------------------------------------------------------

describe('computeFlows', () => {
  describe('empty inputs', () => {
    it('returns empty array when all inputs are empty', () => {
      expect(computeFlows([], [], [])).toEqual([])
    })

    it('returns one flow per isolated source', () => {
      const flows = computeFlows([makeSource('s1'), makeSource('s2')], [], [])
      expect(flows).toHaveLength(2)
    })

    it('returns one flow per isolated query', () => {
      const flows = computeFlows([], [makeQuery('q1', []), makeQuery('q2', [])], [])
      expect(flows).toHaveLength(2)
    })

    it('returns one flow per isolated reaction', () => {
      const flows = computeFlows([], [], [makeReaction('r1', []), makeReaction('r2', [])])
      expect(flows).toHaveLength(2)
    })
  })

  describe('single pipeline', () => {
    it('groups connected source→query→reaction into one flow', () => {
      const sources = [makeSource('s1')]
      const queries = [makeQuery('q1', ['s1'])]
      const reactions = [makeReaction('r1', ['q1'])]
      const flows = computeFlows(sources, queries, reactions)
      expect(flows).toHaveLength(1)
      expect(flows[0].sourceIds).toContain('s1')
      expect(flows[0].queryIds).toContain('q1')
      expect(flows[0].reactionIds).toContain('r1')
    })

    it('uses query name as flow label when a query exists', () => {
      const flows = computeFlows(
        [makeSource('s1')],
        [makeQuery('q1', ['s1'], 'My Query')],
        [makeReaction('r1', ['q1'])],
      )
      expect(flows[0].label).toBe('My Query')
    })

    it('falls back to source name when no query exists', () => {
      const flows = computeFlows([makeSource('s1', 'My Source')], [], [])
      expect(flows[0].label).toBe('My Source')
    })
  })

  describe('multiple independent pipelines', () => {
    it('produces separate flows for disjoint pipelines', () => {
      const flows = computeFlows(
        [makeSource('s1'), makeSource('s2')],
        [makeQuery('q1', ['s1']), makeQuery('q2', ['s2'])],
        [makeReaction('r1', ['q1']), makeReaction('r2', ['q2'])],
      )
      expect(flows).toHaveLength(2)
    })

    it('each flow only contains its own members', () => {
      const flows = computeFlows(
        [makeSource('s1'), makeSource('s2')],
        [makeQuery('q1', ['s1']), makeQuery('q2', ['s2'])],
        [],
      )
      const flowWithQ1 = flows.find(f => f.queryIds.has('q1'))
      const flowWithQ2 = flows.find(f => f.queryIds.has('q2'))
      expect(flowWithQ1).toBeDefined()
      expect(flowWithQ2).toBeDefined()
      expect(flowWithQ1).not.toBe(flowWithQ2)
      expect(flowWithQ1?.sourceIds).toContain('s1')
      expect(flowWithQ1?.sourceIds).not.toContain('s2')
    })
  })

  describe('shared query fan-out', () => {
    it('merges two sources into one flow when they share a query', () => {
      const flows = computeFlows(
        [makeSource('s1'), makeSource('s2')],
        [makeQuery('q1', ['s1', 's2'])],
        [],
      )
      expect(flows).toHaveLength(1)
      expect(flows[0].sourceIds).toContain('s1')
      expect(flows[0].sourceIds).toContain('s2')
    })

    it('merges multiple reactions listening to the same query', () => {
      const flows = computeFlows(
        [makeSource('s1')],
        [makeQuery('q1', ['s1'])],
        [makeReaction('r1', ['q1']), makeReaction('r2', ['q1'])],
      )
      expect(flows).toHaveLength(1)
      expect(flows[0].reactionIds).toContain('r1')
      expect(flows[0].reactionIds).toContain('r2')
    })
  })

  describe('flow id stability', () => {
    it('produces deterministic flow ids based on member sets', () => {
      const sources = [makeSource('s1')]
      const queries = [makeQuery('q1', ['s1'])]
      const reactions = [makeReaction('r1', ['q1'])]
      // Call twice with same data — ids must match
      const [a] = computeFlows(sources, queries, reactions)
      const [b] = computeFlows(sources, queries, reactions)
      expect(a.id).toBe(b.id)
    })

    it('flow id includes all member ids', () => {
      const flows = computeFlows(
        [makeSource('s1')],
        [makeQuery('q1', ['s1'])],
        [makeReaction('r1', ['q1'])],
      )
      expect(flows[0].id).toContain('s:s1')
      expect(flows[0].id).toContain('q:q1')
      expect(flows[0].id).toContain('r:r1')
    })
  })

  describe('sorting', () => {
    it('sorts flows alphabetically by label', () => {
      const flows = computeFlows(
        [],
        [makeQuery('q2', [], 'Zebra'), makeQuery('q1', [], 'Apple')],
        [],
      )
      expect(flows[0].label).toBe('Apple')
      expect(flows[1].label).toBe('Zebra')
    })
  })

  describe('dangling references', () => {
    it('ignores source ids in queries that have no matching source node', () => {
      // q1 references 'ghost-source' which is not in sources array
      const flows = computeFlows(
        [makeSource('s1')],
        [makeQuery('q1', ['s1', 'ghost-source'])],
        [],
      )
      expect(flows).toHaveLength(1)
      expect(flows[0].sourceIds).toContain('s1')
      expect(flows[0].sourceIds).not.toContain('ghost-source')
    })

    it('ignores query ids in reactions that have no matching query node', () => {
      const flows = computeFlows(
        [],
        [makeQuery('q1', [])],
        [makeReaction('r1', ['q1', 'ghost-query'])],
      )
      expect(flows).toHaveLength(1)
      expect(flows[0].queryIds).toContain('q1')
    })
  })
})
