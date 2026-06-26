/**
 * Flow discovery utilities for the Drasi Reactive Graph card.
 *
 * Drasi has no first-class "flow" concept. A pipeline is implicit in the
 * edges between sources ← queries → reactions. We derive flows as connected
 * components of that tripartite graph using a simple union-find (DSU).
 */
import type { DrasiSource, DrasiQuery, DrasiReaction } from './DrasiTypes'

// ---------------------------------------------------------------------------
// Flow type
// ---------------------------------------------------------------------------

/** Sentinel value used in the flow dropdown to mean "don't filter anything". */
export const FLOW_ID_ALL = '__all__'

/** A derived flow — one connected component of the drasi graph. */
export interface Flow {
  /** Stable id derived from the sorted member IDs so the value survives
   *  array order changes between polls. */
  id: string
  /** Human label — first query name, or a fallback if there are zero
   *  queries in the component. */
  label: string
  sourceIds: Set<string>
  queryIds: Set<string>
  reactionIds: Set<string>
}

// ---------------------------------------------------------------------------
// computeFlows
// ---------------------------------------------------------------------------

/** Derive flows from the current source/query/reaction graph via a simple
 *  union-find. Queries are the "hub" nodes — edges go query→source (via
 *  `query.sourceIds`) and reaction→query (via `reaction.queryIds`). */
export function computeFlows(
  sources: DrasiSource[],
  queries: DrasiQuery[],
  reactions: DrasiReaction[],
): Flow[] {
  // node id schema: 's:'+sourceId, 'q:'+queryId, 'r:'+reactionId — prefixed
  // so two resource kinds with the same id don't collide in the DSU map.
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    let cur = k
    while (parent.get(cur) !== cur) {
      const p = parent.get(cur)
      if (p === undefined) { parent.set(cur, cur); return cur }
      parent.set(cur, parent.get(p) ?? p)
      cur = parent.get(cur) as string
    }
    return cur
  }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  for (const s of sources) parent.set(`s:${s.id}`, `s:${s.id}`)
  for (const q of queries) parent.set(`q:${q.id}`, `q:${q.id}`)
  for (const r of reactions) parent.set(`r:${r.id}`, `r:${r.id}`)

  for (const q of queries) {
    for (const sid of q.sourceIds) {
      if (parent.has(`s:${sid}`)) union(`q:${q.id}`, `s:${sid}`)
    }
  }
  for (const r of reactions) {
    for (const qid of r.queryIds) {
      if (parent.has(`q:${qid}`)) union(`r:${r.id}`, `q:${qid}`)
    }
  }

  // Bucket by root. Each bucket becomes one Flow.
  const buckets = new Map<string, Flow>()
  const ensure = (root: string): Flow => {
    let flow = buckets.get(root)
    if (!flow) {
      flow = { id: '', label: '', sourceIds: new Set(), queryIds: new Set(), reactionIds: new Set() }
      buckets.set(root, flow)
    }
    return flow
  }
  for (const s of sources) ensure(find(`s:${s.id}`)).sourceIds.add(s.id)
  for (const q of queries) ensure(find(`q:${q.id}`)).queryIds.add(q.id)
  for (const r of reactions) ensure(find(`r:${r.id}`)).reactionIds.add(r.id)

  // Finalize: label + stable id.
  const flows: Flow[] = []
  let flowIndex = 0
  for (const flow of buckets.values()) {
    // Label preference: first query name, else first source name, else fallback.
    flowIndex += 1
    const firstQ = queries.find(q => flow.queryIds.has(q.id))
    const firstS = sources.find(s => flow.sourceIds.has(s.id))
    flow.label = firstQ?.name ?? firstS?.name ?? `Flow ${flowIndex}`
    // Deterministic id from sorted member list — survives poll re-ordering.
    const members = [
      ...[...flow.sourceIds].map(id => `s:${id}`),
      ...[...flow.queryIds].map(id => `q:${id}`),
      ...[...flow.reactionIds].map(id => `r:${id}`),
    ].sort()
    flow.id = `flow:${members.join('|')}`
    flows.push(flow)
  }
  // Sort by label for stable dropdown ordering.
  flows.sort((a, b) => a.label.localeCompare(b.label))
  return flows
}
