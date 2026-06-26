/**
 * Shared type definitions for the Drasi Reactive Graph card.
 */

// ---------------------------------------------------------------------------
// Node-kind enumerations
// ---------------------------------------------------------------------------

export type SourceKind = 'HTTP' | 'POSTGRES' | 'COSMOSDB' | 'GREMLIN' | 'SQL'
export type ReactionKind = 'SSE' | 'SIGNALR' | 'WEBHOOK' | 'KAFKA'

// ---------------------------------------------------------------------------
// Pipeline node shapes
// ---------------------------------------------------------------------------

export interface DrasiSource {
  id: string
  name: string
  kind: SourceKind
  status: 'ready' | 'error' | 'pending'
}

export interface DrasiQuery {
  id: string
  name: string
  language: string
  status: 'ready' | 'error' | 'pending'
  sourceIds: string[]
  /** Query body (editable in the config modal for demo purposes) */
  queryText?: string
}

export interface DrasiReaction {
  id: string
  name: string
  kind: ReactionKind
  status: 'ready' | 'error' | 'pending'
  queryIds: string[]
}

// Drasi continuous-query result rows are arbitrary key/value maps — each
// query returns its own schema. The card's results table renders columns
// dynamically from the first row's keys instead of hardcoding the stock
// schema we use for demo mode.
export type LiveResultRow = Record<string, string | number | boolean | null>

export interface DrasiPipelineData {
  sources: DrasiSource[]
  queries: DrasiQuery[]
  reactions: DrasiReaction[]
  liveResults: LiveResultRow[]
}

// ---------------------------------------------------------------------------
// Layout measurement types
// ---------------------------------------------------------------------------

export interface NodeRect {
  left: number
  right: number
  top: number
  bottom: number
  centerY: number
}

export interface MeasuredRects {
  sources: Record<string, NodeRect>
  queries: Record<string, NodeRect>
  reactions: Record<string, NodeRect>
  container: { width: number; height: number }
}

// ---------------------------------------------------------------------------
// Rect equality helpers (used in useLayoutEffect to skip spurious setState)
// ---------------------------------------------------------------------------

export function nodeRectEqual(a: NodeRect | undefined, b: NodeRect | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.left === b.left && a.right === b.right && a.top === b.top && a.bottom === b.bottom && a.centerY === b.centerY
}

export function nodeMapEqual(a: Record<string, NodeRect>, b: Record<string, NodeRect>): boolean {
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) return false
  for (const k of aKeys) {
    if (!nodeRectEqual(a[k], b[k])) return false
  }
  return true
}

export function rectsEqual(a: MeasuredRects, b: MeasuredRects): boolean {
  return (
    a.container.width === b.container.width &&
    a.container.height === b.container.height &&
    nodeMapEqual(a.sources, b.sources) &&
    nodeMapEqual(a.queries, b.queries) &&
    nodeMapEqual(a.reactions, b.reactions)
  )
}

// ---------------------------------------------------------------------------
// Expanded-node details (used by ExpandModal)
// ---------------------------------------------------------------------------

export interface ExpandedNodeDetails {
  id: string
  name: string
  kind: string
  type: 'source' | 'query' | 'reaction'
  extra?: Record<string, string>
}

// ---------------------------------------------------------------------------
// Configure modal value shapes
// ---------------------------------------------------------------------------

export interface SourceConfig {
  name: string
  kind: SourceKind
}

export interface QueryConfig {
  name: string
  language: string
  queryText: string
}

// ---------------------------------------------------------------------------
// Flow line state
// ---------------------------------------------------------------------------

/**
 * Flow line state — drives the stroke color, dot color, and whether the
 * dots animate at all. Mapped from the connected node's status:
 *   active  → both endpoints ready, normal flow
 *   idle    → connected but no traffic (a query that hasn't fired yet)
 *   stopped → user hit Stop on either endpoint
 *   error   → either endpoint reports an error
 */
export type FlowLineState = 'active' | 'idle' | 'stopped' | 'error'
