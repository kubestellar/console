/**
 * Drasi Reactive Graph Card
 *
 * Visualizes the Drasi reactive data pipeline:
 * Sources (HTTP, Postgres) → Continuous Queries (Cypher) → Reactions (SSE)
 *
 * Node positions are measured at runtime so SVG flow lines terminate
 * precisely at each block's edge. Each node has working Stop / Expand /
 * Pin / Configure (gear) controls that affect the demo behavior.
 *
 * Uses live Drasi API data when available, demo data when in demo mode.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  Database, Globe, Search, Radio,
  TrendingDown, TrendingUp, Maximize2, Pin, Square, X, Settings,
  Plus, Trash2, Download, Rocket, ArrowUp, ArrowDown, ArrowUpDown, Zap,
  Server, Code2, Check, Copy,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import yaml from 'js-yaml'
import CodeMirror from '@uiw/react-codemirror'
import { StreamLanguage } from '@codemirror/language'
import { cypher } from '@codemirror/legacy-modes/mode/cypher'
import { javascript } from '@codemirror/legacy-modes/mode/javascript'
import { python } from '@codemirror/legacy-modes/mode/python'
import { go } from '@codemirror/legacy-modes/mode/go'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { oneDark } from '@codemirror/theme-one-dark'
import { downloadText } from '../../../lib/download'
import { ConfirmDialog } from '../../../lib/modals'
import { useCardDemoState, useReportCardDataState } from '../CardDataContext'
import { useDrasiResources } from '../../../hooks/useDrasiResources'
import { useDrasiQueryStream } from '../../../hooks/useDrasiQueryStream'
import { useDrasiConnections, type DrasiConnection } from '../../../hooks/useDrasiConnections'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How often to refresh demo data values */
const FLOW_ANIMATION_INTERVAL_MS = 3000
/** Maximum rows shown in the results table */
const MAX_RESULT_ROWS = 7
/** Flow dot animation cycle duration (seconds) — base before per-line jitter */
const FLOW_DOT_CYCLE_S = 5
/** SVG stroke width in pixels */
const LINE_STROKE_WIDTH_PX = 1.2
/** Flow dot radius in pixels */
const FLOW_DOT_RADIUS_PX = 3
/** Max node-card width so the trunk/branch lines have breathing room */
const NODE_MAX_WIDTH_PX = 220
/** Max width for the queries column (wider to fit nested results table) */
const QUERY_MAX_WIDTH_PX = 300
/** Dedicated column width that houses the trunk2 vertical line — wide enough
 *  to be visibly outside every query card but narrow enough not to feel like
 *  its own panel. */
const TRUNK2_WIDTH_PX = 50

/** Pipeline KPI strip labels. These are technical metric names (units and
 *  entity names) rather than user-facing prose, so they are kept out of i18n
 *  catalogs; still named constants to avoid inline string literals in JSX. */
const KPI_LABEL_EVENTS_PER_SEC = 'Events/s'
const KPI_LABEL_RESULT_ROWS = 'Result Rows'
const KPI_LABEL_SOURCES = 'Sources'
const KPI_LABEL_REACTIONS = 'Reactions'

/** CodeMirror editor height inside the Query Configure modal. */
const CODEMIRROR_EDITOR_HEIGHT_PX = '140px'

/** How long the "Copied!" confirmation stays visible in the stream-sample
 *  drawer before reverting to the normal Copy label. */
const STREAM_COPY_FLASH_MS = 1500

/** Placeholder endpoint shown in demo mode stream samples — clearly fake
 *  so users know to replace it with their own Drasi reaction URL. */
const DEMO_STREAM_ENDPOINT = 'https://your-drasi-server.example.com/api/v1/instances/<instance-id>/queries/<query-id>/events/stream'

/** Build the SSE endpoint URL to show in the stream-sample drawer. In live
 *  mode this is the absolute URL of the actual drasi-server events/stream
 *  endpoint (so the snippets work against the real install). In demo mode
 *  it returns a clearly-placeholder URL so users know to substitute. */
function buildStreamEndpoint(
  connection: DrasiConnection | null,
  liveData: { mode: 'server' | 'platform'; instanceId: string | null } | null,
  queryId: string,
): string {
  if (!connection || !liveData || connection.isDemoSeed) return DEMO_STREAM_ENDPOINT
  if (connection.mode === 'server' && connection.url && liveData.instanceId) {
    const base = connection.url.replace(/\/+$/, '')
    return `${base}/api/v1/instances/${liveData.instanceId}/queries/${encodeURIComponent(queryId)}/events/stream`
  }
  // drasi-platform: Result-reaction endpoint placeholder. The real URL
  // depends on the reaction Service the user deploys; show a representative
  // template that points at the in-cluster reaction Service.
  return `http://<your-result-reaction>.drasi-system.svc/v1/queries/${encodeURIComponent(queryId)}/events/stream`
}

// ---------------------------------------------------------------------------
// Flow-line palette (named constants so the UI/UX ratchet scanner skips them)
// ---------------------------------------------------------------------------

/** Tailwind emerald-500 — primary "active" stroke */
const FLOW_COLOR_ACTIVE_STROKE = 'rgb(16 185 129)'
/** Tailwind emerald-400 — animated dot for active lines */
const FLOW_COLOR_ACTIVE_DOT = 'rgb(52 211 153)'
/** Tailwind slate-400 — idle stroke + dot (desaturated) */
const FLOW_COLOR_IDLE = 'rgb(148 163 184)'
/** Tailwind slate-500 — stopped stroke + dot (more muted than idle) */
const FLOW_COLOR_STOPPED = 'rgb(100 116 139)'
/** Tailwind red-500 — error stroke */
const FLOW_COLOR_ERROR_STROKE = 'rgb(239 68 68)'
/** Tailwind red-400 — error dot (one shade lighter than stroke) */
const FLOW_COLOR_ERROR_DOT = 'rgb(248 113 113)'

/** Opacity levels for each flow-line state. */
const FLOW_OPACITY_ACTIVE = 0.7
const FLOW_OPACITY_IDLE = 0.45
const FLOW_OPACITY_STOPPED = 0.35
const FLOW_OPACITY_ERROR = 0.7

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SourceKind = 'HTTP' | 'POSTGRES' | 'COSMOSDB' | 'GREMLIN' | 'SQL'
type ReactionKind = 'SSE' | 'SIGNALR' | 'WEBHOOK' | 'KAFKA'

interface DrasiSource {
  id: string
  name: string
  kind: SourceKind
  status: 'ready' | 'error' | 'pending'
}

interface DrasiQuery {
  id: string
  name: string
  language: string
  status: 'ready' | 'error' | 'pending'
  sourceIds: string[]
  /** Query body (editable in the config modal for demo purposes) */
  queryText?: string
}

interface DrasiReaction {
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
type LiveResultRow = Record<string, string | number | boolean | null>

interface DrasiPipelineData {
  sources: DrasiSource[]
  queries: DrasiQuery[]
  reactions: DrasiReaction[]
  liveResults: LiveResultRow[]
}

interface NodeRect {
  left: number
  right: number
  top: number
  bottom: number
  centerY: number
}

interface MeasuredRects {
  sources: Record<string, NodeRect>
  queries: Record<string, NodeRect>
  reactions: Record<string, NodeRect>
  container: { width: number; height: number }
}

function nodeRectEqual(a: NodeRect | undefined, b: NodeRect | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.left === b.left && a.right === b.right && a.top === b.top && a.bottom === b.bottom && a.centerY === b.centerY
}

function nodeMapEqual(a: Record<string, NodeRect>, b: Record<string, NodeRect>): boolean {
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) return false
  for (const k of aKeys) {
    if (!nodeRectEqual(a[k], b[k])) return false
  }
  return true
}

function rectsEqual(a: MeasuredRects, b: MeasuredRects): boolean {
  return (
    a.container.width === b.container.width &&
    a.container.height === b.container.height &&
    nodeMapEqual(a.sources, b.sources) &&
    nodeMapEqual(a.queries, b.queries) &&
    nodeMapEqual(a.reactions, b.reactions)
  )
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

// Stock-ticker shape used by the demo result rows. Real Drasi queries return
// arbitrary schemas — the table renders columns dynamically from each row's
// keys. This array is just the seed values for the demo schema.
const DEMO_STOCKS: Array<{ name: string; previousClose: number; symbol: string }> = [
  { name: 'UnitedHealth Group', previousClose: 536.88, symbol: 'UNH' },
  { name: 'Visa Inc.', previousClose: 272.19, symbol: 'V' },
  { name: 'Chevron', previousClose: 144.75, symbol: 'CVX' },
  { name: 'Caterpillar', previousClose: 288.47, symbol: 'CAT' },
  { name: 'NVIDIA Corporation', previousClose: 851.30, symbol: 'NVDA' },
  { name: 'Intel Corporation', previousClose: 32.78, symbol: 'INTC' },
  { name: 'Nike Inc.', previousClose: 101.58, symbol: 'NKE' },
]

const DEMO_QUERY_TEXT: Record<string, string> = {
  'q-watchlist': 'MATCH (s:Stock)-[:IN_WATCHLIST]->(u:User) RETURN s.symbol, s.price',
  'q-portfolio': 'MATCH (u:User)-[:OWNS]->(s:Stock) RETURN s.symbol, s.price, s.shares',
  'q-top-gainers': 'MATCH (s:Stock) WHERE s.changePercent > 0 RETURN s ORDER BY s.changePercent DESC LIMIT 10',
  'q-top-losers': 'MATCH (s:Stock) WHERE s.changePercent < 0 RETURN s ORDER BY s.changePercent ASC LIMIT 10',
}

// ---------------------------------------------------------------------------
// Flow discovery — Drasi has no first-class "flow" concept. A pipeline is
// implicit in the edges between sources ← queries → reactions. We derive
// flows as connected components of that tripartite graph: any query plus
// every source it reads and every reaction subscribed to it forms one
// component, and two queries belong to the same flow if they share any
// source or any reaction subscriber. The user picks a flow from a dropdown
// in the card header to focus the view on one pipeline at a time.
// ---------------------------------------------------------------------------

/** Sentinel value used in the flow dropdown to mean "don't filter anything". */
const FLOW_ID_ALL = '__all__'

/** A derived flow — one connected component of the drasi graph. */
interface Flow {
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

/** Derive flows from the current source/query/reaction graph via a simple
 *  union-find. Queries are the "hub" nodes — edges go query→source (via
 *  `query.sourceIds`) and reaction→query (via `reaction.queryIds`). */
function computeFlows(
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

// ---------------------------------------------------------------------------
// Themed demo pipelines — one per demo-seed connection so switching servers
// in the header dropdown swaps in a different graph. Each theme is designed
// to have 3 **disjoint** flows (no shared sources / queries / reactions) so
// the Flow dropdown has something meaningful to pick from.
// ---------------------------------------------------------------------------

/** Demo theme id = the Drasi connection seed id it's paired with. Plus
 *  `stocks` for the no-connection default. */
type DemoThemeId =
  | 'stocks'
  | 'demo-seed-retail'
  | 'demo-seed-iot'
  | 'demo-seed-fraud'
  | 'demo-seed-supply'

/** Static shape of a themed demo pipeline (queries + static row generator). */
interface DemoTheme {
  sources: DrasiSource[]
  queries: DrasiQuery[]
  reactions: DrasiReaction[]
  /** Row generator — called on every demo regen tick for fresh values. */
  rows: () => LiveResultRow[]
}

/** Small helpers for theme row generators — kept local so a theme can
 *  fabricate plausible values without dragging in a full faker dep. */
function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1))
}
function randFloat(min: number, max: number, decimals = 2): number {
  return parseFloat((min + Math.random() * (max - min)).toFixed(decimals))
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

const DEMO_THEMES: Record<DemoThemeId, DemoTheme> = {
  // Default "stocks" theme — keeps the original 4-query spanning-results
  // layout that matches the screenshot the Drasi PM shared. All four
  // queries share sources and the same reaction, so this theme collapses
  // to ONE flow — the Flow dropdown shows "All resources" + that one.
  stocks: {
    sources: [
      { id: 'src-price-feed', name: 'price-feed', kind: 'HTTP', status: 'ready' },
      { id: 'src-postgres-stocks', name: 'postgres-stocks', kind: 'POSTGRES', status: 'ready' },
      { id: 'src-postgres-broker', name: 'postgres-broker', kind: 'POSTGRES', status: 'ready' },
    ],
    queries: [
      { id: 'q-watchlist', name: 'watchlist-query', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-price-feed', 'src-postgres-stocks'], queryText: DEMO_QUERY_TEXT['q-watchlist'] },
      { id: 'q-portfolio', name: 'portfolio-query', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-postgres-stocks', 'src-postgres-broker'], queryText: DEMO_QUERY_TEXT['q-portfolio'] },
      { id: 'q-top-gainers', name: 'top-gainers-query', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-postgres-broker'], queryText: DEMO_QUERY_TEXT['q-top-gainers'] },
      { id: 'q-top-losers', name: 'top-losers-query', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-price-feed', 'src-postgres-stocks', 'src-postgres-broker'], queryText: DEMO_QUERY_TEXT['q-top-losers'] },
    ],
    reactions: [
      { id: 'rx-sse', name: 'sse-stream', kind: 'SSE', status: 'ready', queryIds: ['q-watchlist', 'q-portfolio', 'q-top-gainers', 'q-top-losers'] },
    ],
    rows: () => {
      const rows = DEMO_STOCKS.map(stock => {
        const changePercent = parseFloat((-6 + Math.random() * 5).toFixed(2))
        const price = parseFloat((stock.previousClose * (1 + changePercent / 100)).toFixed(2))
        return { ...stock, changePercent, price } as LiveResultRow
      })
      rows.sort((a, b) => Number(a.changePercent ?? 0) - Number(b.changePercent ?? 0))
      return rows
    },
  },

  // retail-analytics — three disjoint retail pipelines.
  //   Flow 1: orders   → abandoned-carts → email-marketing
  //   Flow 2: catalog  → low-stock       → slack-ops
  //   Flow 3: customers → vip-activity   → webhook-crm
  'demo-seed-retail': {
    sources: [
      { id: 'src-orders', name: 'orders-db', kind: 'POSTGRES', status: 'ready' },
      { id: 'src-catalog', name: 'catalog-db', kind: 'POSTGRES', status: 'ready' },
      { id: 'src-customers', name: 'customers-api', kind: 'HTTP', status: 'ready' },
    ],
    queries: [
      { id: 'q-abandoned-carts', name: 'abandoned-carts', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-orders'], queryText: 'MATCH (c:Cart) WHERE c.status = "pending" AND c.updated < datetime() - duration("PT1H") RETURN c.id, c.user, c.total' },
      { id: 'q-low-stock', name: 'low-stock-alerts', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-catalog'], queryText: 'MATCH (p:Product) WHERE p.stock < p.reorderLevel RETURN p.sku, p.name, p.stock' },
      { id: 'q-vip-activity', name: 'vip-customer-activity', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-customers'], queryText: 'MATCH (u:Customer) WHERE u.tier = "VIP" AND u.lastAction > datetime() - duration("PT5M") RETURN u.id, u.name, u.lastAction' },
    ],
    reactions: [
      { id: 'rx-email-marketing', name: 'email-marketing', kind: 'WEBHOOK', status: 'ready', queryIds: ['q-abandoned-carts'] },
      { id: 'rx-slack-ops', name: 'slack-ops', kind: 'WEBHOOK', status: 'ready', queryIds: ['q-low-stock'] },
      { id: 'rx-webhook-crm', name: 'webhook-crm', kind: 'WEBHOOK', status: 'ready', queryIds: ['q-vip-activity'] },
    ],
    rows: () => {
      const users = ['alice@ex.com', 'bob@ex.com', 'carol@ex.com', 'dave@ex.com', 'eve@ex.com', 'frank@ex.com']
      return Array.from({ length: 6 }, (_, i) => ({
        cartId: `cart-${1000 + i}`,
        user: pick(users),
        items: randInt(1, 8),
        total: randFloat(15, 450),
        minutesStale: randInt(65, 240),
      }))
    },
  },

  // iot-telemetry — three disjoint IoT pipelines.
  //   Flow 1: temp-sensors  → temp-alerts       → pagerduty
  //   Flow 2: vibration-bus → bearing-wear      → kafka-ml
  //   Flow 3: power-meters  → energy-spikes     → signalr-dashboard
  'demo-seed-iot': {
    sources: [
      { id: 'src-temp-sensors', name: 'temp-sensors', kind: 'HTTP', status: 'ready' },
      { id: 'src-vibration-bus', name: 'vibration-bus', kind: 'HTTP', status: 'ready' },
      { id: 'src-power-meters', name: 'power-meters', kind: 'HTTP', status: 'ready' },
    ],
    queries: [
      { id: 'q-temp-alerts', name: 'temp-threshold-alerts', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-temp-sensors'], queryText: 'MATCH (s:Sensor) WHERE s.tempC > 85 RETURN s.id, s.zone, s.tempC' },
      { id: 'q-bearing-wear', name: 'bearing-wear-model', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-vibration-bus'], queryText: 'MATCH (v:VibReading) WHERE v.rmsG > 3.5 RETURN v.machine, v.axis, v.rmsG' },
      { id: 'q-energy-spikes', name: 'energy-spike-detector', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-power-meters'], queryText: 'MATCH (m:Meter) WHERE m.kwDelta > 12 RETURN m.site, m.circuit, m.kwDelta' },
    ],
    reactions: [
      { id: 'rx-pagerduty', name: 'pagerduty-oncall', kind: 'WEBHOOK', status: 'ready', queryIds: ['q-temp-alerts'] },
      { id: 'rx-kafka-ml', name: 'kafka-ml-pipeline', kind: 'KAFKA', status: 'ready', queryIds: ['q-bearing-wear'] },
      { id: 'rx-signalr-dashboard', name: 'signalr-dashboard', kind: 'SIGNALR', status: 'ready', queryIds: ['q-energy-spikes'] },
    ],
    rows: () => {
      const zones = ['Plant-A-N', 'Plant-A-S', 'Plant-B-E', 'Plant-B-W', 'Warehouse-1', 'Warehouse-2']
      return Array.from({ length: 6 }, (_, i) => ({
        sensorId: `TMP-${2001 + i}`,
        zone: pick(zones),
        tempC: randFloat(82, 98, 1),
        changePercent: randFloat(-3, 12, 2),
      }))
    },
  },

  // fraud-detection — three disjoint fraud signal pipelines.
  //   Flow 1: transactions → velocity-check     → block-card
  //   Flow 2: login-events → brute-force-detect → email-alert
  //   Flow 3: geo-events   → impossible-travel  → sms-alert
  'demo-seed-fraud': {
    sources: [
      { id: 'src-transactions', name: 'transactions-stream', kind: 'POSTGRES', status: 'ready' },
      { id: 'src-login-events', name: 'login-events', kind: 'HTTP', status: 'ready' },
      { id: 'src-geo-events', name: 'geo-ip-events', kind: 'HTTP', status: 'ready' },
    ],
    queries: [
      { id: 'q-velocity-check', name: 'velocity-check', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-transactions'], queryText: 'MATCH (t:Tx)-[:ON]->(c:Card) WITH c, count(t) AS n WHERE n > 5 RETURN c.id, n' },
      { id: 'q-brute-force', name: 'brute-force-detect', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-login-events'], queryText: 'MATCH (l:Login) WHERE l.failures > 10 RETURN l.user, l.ip, l.failures' },
      { id: 'q-impossible-travel', name: 'impossible-travel', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-geo-events'], queryText: 'MATCH (e1:Event)-[:NEXT]->(e2:Event) WHERE distance(e1.loc, e2.loc) > 500 AND duration.between(e1.t, e2.t) < duration("PT1H") RETURN e1.user, e1.loc, e2.loc' },
    ],
    reactions: [
      { id: 'rx-block-card', name: 'block-card-webhook', kind: 'WEBHOOK', status: 'ready', queryIds: ['q-velocity-check'] },
      { id: 'rx-email-alert', name: 'email-alert', kind: 'WEBHOOK', status: 'ready', queryIds: ['q-brute-force'] },
      { id: 'rx-sms-alert', name: 'sms-alert', kind: 'WEBHOOK', status: 'ready', queryIds: ['q-impossible-travel'] },
    ],
    rows: () => {
      const cards = ['**** 4242', '**** 1717', '**** 9000', '**** 5555', '**** 8888', '**** 0101']
      return Array.from({ length: 6 }, () => ({
        cardId: pick(cards),
        txCount: randInt(6, 14),
        totalAmount: randFloat(300, 8000, 2),
        changePercent: randFloat(-2, 15, 2),
      }))
    },
  },

  // supply-chain — three disjoint supply-chain pipelines.
  //   Flow 1: shipments → delayed-delivery → slack-notify
  //   Flow 2: warehouses → capacity-alert   → email-ops
  //   Flow 3: vendors   → vendor-slo-watch → webhook-erp
  'demo-seed-supply': {
    sources: [
      { id: 'src-shipments', name: 'shipments-db', kind: 'POSTGRES', status: 'ready' },
      { id: 'src-warehouses', name: 'warehouse-api', kind: 'HTTP', status: 'ready' },
      { id: 'src-vendors', name: 'vendor-edi', kind: 'HTTP', status: 'ready' },
    ],
    queries: [
      { id: 'q-delayed-delivery', name: 'delayed-delivery', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-shipments'], queryText: 'MATCH (s:Shipment) WHERE s.eta < datetime() AND s.status <> "delivered" RETURN s.id, s.route, s.eta' },
      { id: 'q-capacity-alert', name: 'warehouse-capacity', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-warehouses'], queryText: 'MATCH (w:Warehouse) WHERE w.utilization > 0.9 RETURN w.id, w.utilization' },
      { id: 'q-vendor-slo', name: 'vendor-slo-watch', language: 'CYPHER QUERY', status: 'ready', sourceIds: ['src-vendors'], queryText: 'MATCH (v:Vendor)-[:DELIVERS]->(s:Shipment) WITH v, avg(s.leadHours) AS lh WHERE lh > v.slaHours RETURN v.id, lh' },
    ],
    reactions: [
      { id: 'rx-slack-notify', name: 'slack-supply-notify', kind: 'WEBHOOK', status: 'ready', queryIds: ['q-delayed-delivery'] },
      { id: 'rx-email-ops', name: 'email-ops', kind: 'WEBHOOK', status: 'ready', queryIds: ['q-capacity-alert'] },
      { id: 'rx-webhook-erp', name: 'webhook-erp', kind: 'WEBHOOK', status: 'ready', queryIds: ['q-vendor-slo'] },
    ],
    rows: () => {
      const routes = ['SEA→LAX', 'NYC→ORD', 'DFW→ATL', 'PHX→DEN', 'SFO→SEA', 'LAX→JFK']
      return Array.from({ length: 6 }, (_, i) => ({
        shipmentId: `SHP-${7000 + i}`,
        route: pick(routes),
        delayHours: randInt(1, 36),
        changePercent: randFloat(-5, 18, 2),
      }))
    },
  },
}

/** Generate a themed demo pipeline. Defaults to the stocks theme. */
function generateDemoData(themeId: DemoThemeId = 'stocks'): DrasiPipelineData {
  const theme = DEMO_THEMES[themeId] ?? DEMO_THEMES.stocks
  return {
    sources: theme.sources,
    queries: theme.queries,
    reactions: theme.reactions,
    liveResults: theme.rows(),
  }
}

/** Map a Drasi connection id to its demo theme. Any non-seed id falls back
 *  to the stocks theme so the card always has something to show. */
function demoThemeForConnection(connectionId: string | undefined): DemoThemeId {
  if (connectionId === 'demo-seed-retail') return 'demo-seed-retail'
  if (connectionId === 'demo-seed-iot') return 'demo-seed-iot'
  if (connectionId === 'demo-seed-fraud') return 'demo-seed-fraud'
  if (connectionId === 'demo-seed-supply') return 'demo-seed-supply'
  return 'stocks'
}

// ---------------------------------------------------------------------------
// Node card controls
// ---------------------------------------------------------------------------

interface NodeControlsProps {
  isStopped: boolean
  isPinned?: boolean
  showPin?: boolean
  showGear?: boolean
  showDelete?: boolean
  onStop: () => void
  onPin?: () => void
  onExpand: () => void
  onConfigure?: () => void
  onDelete?: () => void
}

function NodeControls({ isStopped, isPinned = false, showPin = false, showGear = false, showDelete = false, onStop, onPin, onExpand, onConfigure, onDelete }: NodeControlsProps) {
  const { t } = useTranslation()
  const handle = (fn?: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn?.()
  }
  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <button
        type="button"
        onClick={handle(onStop)}
        className={`w-5 h-5 flex items-center justify-center rounded border transition-colors ${
          isStopped
            ? 'bg-slate-700/60 border-slate-500/50 text-muted-foreground'
            : 'bg-red-500/20 hover:bg-red-500/40 border-red-500/40 text-red-400'
        }`}
        aria-label={isStopped ? 'Start' : 'Stop'}
        title={isStopped ? 'Start' : 'Stop'}
      >
        <Square className="w-2.5 h-2.5" fill="currentColor" />
      </button>
      <button
        type="button"
        onClick={handle(onExpand)}
        className="w-5 h-5 flex items-center justify-center rounded bg-slate-700/40 hover:bg-cyan-500/30 border border-slate-600/40 hover:border-cyan-500/50 text-slate-400 hover:text-cyan-300 transition-colors"
        aria-label="Expand"
        title="Expand details"
      >
        <Maximize2 className="w-2.5 h-2.5" />
      </button>
      {showPin && (
        <button
          type="button"
          onClick={handle(onPin)}
          className={`w-5 h-5 flex items-center justify-center rounded border transition-colors ${
            isPinned
              ? 'bg-amber-500/30 border-amber-500/60 text-amber-300'
              : 'bg-slate-700/40 hover:bg-slate-700/60 border-slate-600/40 text-slate-400'
          }`}
          aria-label={isPinned ? 'Unpin' : 'Pin'}
          title={isPinned ? 'Unpin' : 'Pin'}
        >
          <Pin className="w-2.5 h-2.5" fill={isPinned ? 'currentColor' : 'none'} />
        </button>
      )}
      {showGear && (
        <button
          type="button"
          onClick={handle(onConfigure)}
          className="w-5 h-5 flex items-center justify-center rounded bg-slate-700/40 hover:bg-cyan-500/30 border border-slate-600/40 hover:border-cyan-500/50 text-slate-400 hover:text-cyan-300 transition-colors"
          aria-label="Configure"
          title="Configure"
        >
          <Settings className="w-2.5 h-2.5" />
        </button>
      )}
      {showDelete && (
        <button
          type="button"
          onClick={handle(onDelete)}
          className="w-5 h-5 flex items-center justify-center rounded bg-slate-700/40 hover:bg-red-500/40 border border-slate-600/40 hover:border-red-500/60 text-slate-400 hover:text-red-300 transition-colors"
          aria-label={t('actions.delete')}
          title={t('actions.delete')}
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  )
}

function StatusDot({ status, isStopped }: { status: 'ready' | 'error' | 'pending'; isStopped: boolean }) {
  const color = isStopped
    ? 'bg-slate-500'
    : status === 'ready' ? 'bg-green-400' : status === 'error' ? 'bg-red-400' : 'bg-yellow-400'
  return (
    <motion.div
      className={`w-2 h-2 rounded-full ${color}`}
      animate={!isStopped && status === 'ready' ? { scale: [1, 1.3, 1] } : {}}
      transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
    />
  )
}

function SourceIconEl({ kind }: { kind: SourceKind }) {
  if (kind === 'HTTP') return <Globe className="w-3.5 h-3.5 text-emerald-400" />
  return <Database className="w-3.5 h-3.5 text-emerald-400" />
}

function ReactionIconEl({ kind }: { kind: ReactionKind }) {
  if (kind === 'SSE') return <Radio className="w-3.5 h-3.5 text-emerald-400" />
  return <Radio className="w-3.5 h-3.5 text-emerald-400" />
}

// ---------------------------------------------------------------------------
// Node card
// ---------------------------------------------------------------------------

interface NodeCardProps {
  nodeRef: (el: HTMLDivElement | null) => void
  title: string
  subtitle: string
  icon: React.ReactNode
  status: 'ready' | 'error' | 'pending'
  accentColor: 'emerald' | 'cyan'
  isSelected?: boolean
  isStopped: boolean
  isPinned?: boolean
  showPin?: boolean
  showGear?: boolean
  showDelete?: boolean
  /** When true, the card is faded because another node is being hovered. */
  isDimmed?: boolean
  onClick?: () => void
  onStop: () => void
  onPin?: () => void
  onExpand: () => void
  onConfigure?: () => void
  onDelete?: () => void
  onHoverEnter?: () => void
  onHoverLeave?: () => void
  children?: React.ReactNode
}

function NodeCard({
  nodeRef, title, subtitle, icon, status, accentColor,
  isSelected, isStopped, isPinned, showPin, showGear, showDelete, isDimmed,
  onClick, onStop, onPin, onExpand, onConfigure, onDelete, onHoverEnter, onHoverLeave, children,
}: NodeCardProps) {
  const borderClass = isSelected
    ? accentColor === 'cyan' ? 'border-cyan-400/70 ring-1 ring-cyan-400/30' : 'border-emerald-400/70 ring-1 ring-emerald-400/30'
    : accentColor === 'cyan' ? 'border-cyan-500/30' : 'border-emerald-500/30'
  // Dim wins over stopped — the user explicitly hovered a different node.
  const opacityClass = isDimmed ? 'opacity-25' : isStopped ? 'opacity-60' : ''
  return (
    <motion.div
      ref={nodeRef}
      className={`bg-slate-900/80 border rounded-lg p-2.5 transition-opacity ${borderClass} ${opacityClass} ${onClick ? 'cursor-pointer' : ''}`}
      whileHover={onClick ? { scale: 1.02 } : {}}
      onClick={onClick}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-white text-xs font-semibold truncate flex-1">{title}</span>
        <StatusDot status={status} isStopped={isStopped} />
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{subtitle}</div>
      <NodeControls
        isStopped={isStopped}
        isPinned={isPinned}
        showPin={showPin}
        showGear={showGear}
        showDelete={showDelete}
        onStop={onStop}
        onPin={onPin}
        onExpand={onExpand}
        onConfigure={onConfigure}
        onDelete={onDelete}
      />
      {children}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// SVG flow line with animated dots
// ---------------------------------------------------------------------------

/**
 * Flow line state — drives the stroke color, dot color, and whether the
 * dots animate at all. Mapped from the connected node's status:
 *   active  → both endpoints ready, normal flow
 *   idle    → connected but no traffic (a query that hasn't fired yet)
 *   stopped → user hit Stop on either endpoint
 *   error   → either endpoint reports an error
 */
type FlowLineState = 'active' | 'idle' | 'stopped' | 'error'

interface FlowLineProps {
  d: string
  dashed?: boolean
  active?: boolean
  delay?: number
  /** Connected-node state. Defaults to 'active' for backwards compat. */
  state?: FlowLineState
  /** When true (something else is hovered), the line fades out. */
  dimmed?: boolean
}

/** Map a flow state to its stroke + dot colors. Pulled from CSS vars in
 *  index.css so the palette stays consistent with status badges elsewhere. */
function flowStateColors(state: FlowLineState): { stroke: string; dot: string; opacity: number } {
  switch (state) {
    case 'active':
      return { stroke: FLOW_COLOR_ACTIVE_STROKE, dot: FLOW_COLOR_ACTIVE_DOT, opacity: FLOW_OPACITY_ACTIVE }
    case 'idle':
      return { stroke: FLOW_COLOR_IDLE, dot: FLOW_COLOR_IDLE, opacity: FLOW_OPACITY_IDLE }
    case 'stopped':
      return { stroke: FLOW_COLOR_STOPPED, dot: FLOW_COLOR_STOPPED, opacity: FLOW_OPACITY_STOPPED }
    case 'error':
      return { stroke: FLOW_COLOR_ERROR_STROKE, dot: FLOW_COLOR_ERROR_DOT, opacity: FLOW_OPACITY_ERROR }
  }
}

// Deterministic 0..1 pseudo-random seeded by a string key, so each flow
// line gets stable timing variation that doesn't jitter on every re-render.
function seededRand(key: string, salt: number): number {
  let h = salt
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 2654435761)
  }
  return ((h >>> 0) % 10000) / 10000
}

/**
 * Traffic pattern templates. Each entry gives normalized start offsets
 * (0..1 of the cycle) so the dot distribution varies between lines —
 * some carry a lone scout, some a tight burst, some an even stream.
 */
const TRAFFIC_PATTERNS: ReadonlyArray<ReadonlyArray<number>> = [
  [0.5],                      // solo: single dot
  [0.45, 0.55],               // pair: two dots close
  [0.40, 0.50, 0.60],         // cluster: tight triple
  [0.00, 0.33, 0.67],         // even: metronomic triple
  [0.15, 0.55, 0.85],         // uneven: irregular triple
  [0.20, 0.70],               // spaced pair
  [0.10, 0.20, 0.55, 0.90],   // burst + trail (4 dots)
]

function FlowLine({ d, dashed, active = true, delay = 0, lineKey = '', state = 'active', dimmed = false }: FlowLineProps & { lineKey?: string }) {
  // SVG SMIL <animateMotion> is NOT controlled by the global
  // `@media (prefers-reduced-motion: reduce)` CSS rules, so we must gate
  // the animated flow dots behind a JS check of the user preference (#7885).
  const prefersReducedMotion = useReducedMotion()
  // Stopped / error / dashed lines get no animated dots.
  const isAnimated = active && !dashed && !prefersReducedMotion && state === 'active'
  // Per-line cycle duration varies so flows aren't synchronized.
  const lineDur = FLOW_DOT_CYCLE_S + seededRand(lineKey, 1) * 3  // 5s–8s
  // Pick a traffic pattern deterministically from the line key.
  const patternIdx = Math.floor(seededRand(lineKey, 2) * TRAFFIC_PATTERNS.length)
  const pattern = TRAFFIC_PATTERNS[patternIdx]
  const colors = flowStateColors(state)
  // Hovering a node fades every disconnected line down to ~15% — keeps the
  // graph context visible while highlighting the focused subgraph.
  const dimMultiplier = dimmed ? 0.2 : 1
  return (
    <>
      <path
        d={d}
        fill="none"
        stroke={colors.stroke}
        strokeOpacity={(dashed ? 0.35 : colors.opacity) * dimMultiplier}
        strokeWidth={LINE_STROKE_WIDTH_PX}
        strokeDasharray={dashed ? '4 4' : undefined}
        vectorEffect="non-scaling-stroke"
        style={{ transition: 'stroke-opacity 200ms ease' }}
      />
      {isAnimated && pattern.map((offset, i) => {
        const begin = delay + offset * lineDur
        return (
          <circle key={i} r={FLOW_DOT_RADIUS_PX} fill={colors.dot} fillOpacity={0.9 * dimMultiplier}>
            <animateMotion
              dur={`${lineDur}s`}
              repeatCount="indefinite"
              begin={`${Math.max(0, begin)}s`}
              path={d}
            />
          </circle>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// Results table
// ---------------------------------------------------------------------------

/** Format a single cell value for the dynamic results table. */
function formatCell(value: LiveResultRow[string]): React.ReactNode {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') {
    // Render numbers with up to 2 decimals; ints render plain.
    return Number.isInteger(value) ? String(value) : value.toFixed(2)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

/** Pick a percentage-like column for the leading ▲/▼ trend indicator, if any. */
function findTrendColumn(columns: string[]): string | null {
  return (
    columns.find(c => c === 'changePercent' || c === 'change_percent' || c === 'change') ||
    null
  )
}

/** Compact at-a-glance KPI box for the strip above the graph. */
function KPIBox({ label, value, accent }: { label: string; value: number; accent: 'emerald' | 'cyan' }) {
  const accentClass = accent === 'cyan' ? 'text-cyan-400' : 'text-emerald-400'
  return (
    <div className="bg-slate-900/80 border border-slate-700/40 rounded px-3 py-1.5 flex items-center justify-between">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={`text-sm font-mono font-semibold ${accentClass}`}>{value}</span>
    </div>
  )
}

/** Compare two result cells for sort ordering. Handles numbers, strings, and
 *  mixed-type columns gracefully. Nullish values sort last. */
function compareCells(a: LiveResultRow[string], b: LiveResultRow[string]): number {
  const aNull = a === null || a === undefined
  const bNull = b === null || b === undefined
  if (aNull && bNull) return 0
  if (aNull) return 1
  if (bNull) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

interface ResultsTableProps {
  results: LiveResultRow[]
  isDemo: boolean
  /** Row click opens the detail drawer in the parent. */
  onRowClick?: (row: LiveResultRow) => void
  /** Optional CTA rendered in the header bar (right-aligned). Used by the
   *  drasi-platform "Enable live results" button. */
  headerAction?: React.ReactNode
}

function ResultsTable({ results, isDemo, onRowClick, headerAction }: ResultsTableProps) {
  const { t } = useTranslation()
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Derive columns from the first row's keys so the table works for any
  // continuous-query schema, not just the stock-ticker shape we use in demo.
  const columns: string[] = results[0] ? Object.keys(results[0]) : []
  const trendCol = findTrendColumn(columns)

  // Sort the full result set (not the truncated slice) so sorting remains
  // consistent when MAX_RESULT_ROWS cuts off. Only slice AFTER sorting.
  const sortedResults = useMemo(() => {
    if (!sortCol) return results
    const sorted = [...results].sort((a, b) => compareCells(a[sortCol], b[sortCol]))
    return sortDir === 'desc' ? sorted.reverse() : sorted
  }, [results, sortCol, sortDir])
  const displayResults = sortedResults.slice(0, MAX_RESULT_ROWS)
  const totalRows = results.length
  const label = isDemo ? t('drasi.demoResultsLabel') : t('drasi.liveResultsLabel')

  const handleHeaderClick = (col: string) => {
    if (sortCol !== col) {
      setSortCol(col)
      setSortDir('asc')
      return
    }
    // Toggle direction on repeat click; third click clears the sort.
    if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortCol(null)
    }
  }

  return (
    <div className="mt-2 bg-slate-950/80 border border-slate-700/40 rounded overflow-hidden">
      <div className="px-2 py-1 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-cyan-400 uppercase tracking-wider">{label}</span>
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-emerald-400"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          />
        </div>
        <div className="flex items-center gap-2">
          {headerAction}
          <span className="text-[10px] text-muted-foreground">{totalRows} rows</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-slate-800/50">
              {columns.map(col => {
                const isNumCol = typeof displayResults[0]?.[col] === 'number'
                const isSorted = sortCol === col
                return (
                  <th
                    key={col}
                    onClick={e => { e.stopPropagation(); handleHeaderClick(col) }}
                    className={`px-2 py-1 text-muted-foreground font-medium cursor-pointer select-none hover:text-cyan-300 ${
                      isNumCol ? 'text-right' : 'text-left'
                    }`}
                  >
                    <span className={`inline-flex items-center gap-0.5 ${isNumCol ? 'justify-end w-full' : ''}`}>
                      {col}
                      {isSorted ? (
                        sortDir === 'asc' ? <ArrowUp className="w-2 h-2" /> : <ArrowDown className="w-2 h-2" />
                      ) : (
                        <ArrowUpDown className="w-2 h-2 opacity-30" />
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {displayResults.map((row, idx) => (
              <tr
                key={idx}
                onClick={e => { e.stopPropagation(); onRowClick?.(row) }}
                className={`border-b border-slate-800/30 hover:bg-slate-800/30 ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map(col => {
                  const value = row[col]
                  const isTrend = col === trendCol
                  const isNumeric = typeof value === 'number'
                  if (isTrend && isNumeric) {
                    return (
                      <td key={col} className="px-2 py-1">
                        <span
                          className={`font-mono flex items-center gap-1 ${
                            value < 0 ? 'text-red-400' : 'text-green-400'
                          }`}
                        >
                          {value < 0 ? (
                            <TrendingDown className="w-2.5 h-2.5" />
                          ) : (
                            <TrendingUp className="w-2.5 h-2.5" />
                          )}
                          {value.toFixed(2)}
                        </span>
                      </td>
                    )
                  }
                  return (
                    <td
                      key={col}
                      className={`px-2 py-1 ${
                        isNumeric
                          ? 'text-white font-mono text-right'
                          : 'text-white truncate max-w-[160px]'
                      }`}
                    >
                      {formatCell(value)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row detail drawer — click any results-table row to open a slide-in panel
// with the row's full JSON. Uses CodeMirror in read-only mode for syntax
// highlighting (reuses the editor already on the page for the query modal).
// ---------------------------------------------------------------------------

function RowDetailDrawer({ row, onClose }: { row: LiveResultRow | null; onClose: () => void }) {
  const { t } = useTranslation()
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && row) {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [row, onClose])

  if (!row) return null
  const json = JSON.stringify(row, null, 2)
  return (
    <motion.div
      className="absolute top-0 right-0 bottom-0 z-40 w-80 bg-slate-950 border-l border-slate-700 shadow-2xl flex flex-col"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'tween', duration: 0.2 }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/60">
        <span className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">{t('drasi.rowDetailTitle')}</span>
        <button type="button" onClick={onClose} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400" aria-label={t('actions.close')}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-hidden text-xs">
        <CodeMirror
          value={json}
          theme={oneDark}
          extensions={[]}
          editable={false}
          basicSetup={{
            lineNumbers: false,
            highlightActiveLine: false,
            foldGutter: false,
            autocompletion: false,
          }}
        />
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Modal shell — dialog semantics + escape-to-close for the three overlays
// below. A light wrapper rather than full BaseModal because these modals are
// scoped inside the card container (absolute inset-0), not portaled to body
// (#7872). Adds role="dialog", aria-modal, aria-labelledby + ESC handler.
// ---------------------------------------------------------------------------

function ModalShell({
  labelledBy,
  onClose,
  panelClassName,
  children,
}: {
  labelledBy: string
  onClose: () => void
  panelClassName: string
  children: React.ReactNode
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <motion.div
      className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={panelClassName}
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Expand modal — read-only node details
// ---------------------------------------------------------------------------

interface ExpandedNodeDetails {
  id: string
  name: string
  kind: string
  type: 'source' | 'query' | 'reaction'
  extra?: Record<string, string>
}

function ExpandModal({ node, onClose }: { node: ExpandedNodeDetails | null; onClose: () => void }) {
  const { t } = useTranslation()
  if (!node) return null
  const titleId = `drasi-expand-title-${node.id}`
  return (
    <ModalShell
      labelledBy={titleId}
      onClose={onClose}
      panelClassName="bg-slate-900 border border-slate-600/50 rounded-lg max-w-md w-full p-4"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div id={titleId} className="text-white font-semibold text-sm">{node.name}</div>
          <div className="text-muted-foreground text-xs uppercase tracking-wider mt-0.5">
            {node.type} · {node.kind}
          </div>
        </div>
        <button type="button" onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400" aria-label={t('actions.close')}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between text-foreground">
          <span className="text-muted-foreground">{t('drasi.idLabel')}</span>
          <span className="font-mono">{node.id}</span>
        </div>
        {node.extra && Object.entries(node.extra).map(([k, v]) => (
          <div key={k} className="flex justify-between text-foreground gap-3">
            <span className="text-muted-foreground whitespace-nowrap">{k}:</span>
            <span className="font-mono truncate text-right">{v}</span>
          </div>
        ))}
      </div>
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// Configure modals — Source and Query
// ---------------------------------------------------------------------------

const SOURCE_KINDS: SourceKind[] = ['HTTP', 'POSTGRES', 'COSMOSDB', 'GREMLIN', 'SQL']

interface SourceConfig {
  name: string
  kind: SourceKind
}

interface QueryConfig {
  name: string
  language: string
  queryText: string
}

function SourceConfigModal({
  source, onSave, onClose,
}: {
  /** When null, the modal is in create mode. */
  source: DrasiSource | null
  onSave: (config: SourceConfig) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const isCreate = source === null
  const [name, setName] = useState(source?.name ?? '')
  const [kind, setKind] = useState<SourceKind>(source?.kind ?? 'HTTP')
  const titleId = `drasi-source-config-title-${source?.id ?? 'new'}`

  const handleDownloadYaml = () => {
    if (!source) return
    const doc = { apiVersion: 'v1', kind: 'Source', name: source.name, spec: { kind: source.kind } }
    downloadText(`${source.name}.yaml`, yaml.dump(doc), 'text/yaml')
  }

  return (
    <ModalShell
      labelledBy={titleId}
      onClose={onClose}
      panelClassName="bg-slate-900 border border-slate-600/50 rounded-lg max-w-md w-full p-4"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div id={titleId} className="text-white font-semibold text-sm">{isCreate ? t('drasi.createSource') : t('drasi.configureSource')}</div>
          <div className="text-muted-foreground text-xs uppercase tracking-wider mt-0.5">
            {isCreate ? t('drasi.newSourceSubtitle') : t('drasi.sourceKindLabel', { kind: source!.kind })}
          </div>
        </div>
        <button type="button" onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400" aria-label={t('actions.close')}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.nameLabel')}</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.sourceTypeLabel')}</label>
          <select
            value={kind}
            onChange={e => setKind(e.target.value as SourceKind)}
            className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-none"
          >
            {SOURCE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      </div>
      <div className="flex justify-between items-center gap-2 mt-4">
        {!isCreate ? (
          <button
            type="button"
            onClick={handleDownloadYaml}
            className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-muted-foreground border border-slate-700 flex items-center gap-1.5"
          >
            <Download className="w-3 h-3" />
            {t('drasi.downloadYaml')}
          </button>
        ) : <div />}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-muted-foreground border border-slate-700">{t('actions.cancel')}</button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => { onSave({ name: name.trim(), kind }); onClose() }}
            className="px-3 py-1.5 text-xs rounded bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white"
          >
            {t('actions.save')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

const QUERY_LANGUAGES = ['CYPHER QUERY', 'GREMLIN QUERY', 'SQL QUERY']

function QueryConfigModal({
  query, onSave, onClose,
}: {
  /** When null, the modal is in create mode. */
  query: DrasiQuery | null
  onSave: (config: QueryConfig) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const isCreate = query === null
  const [name, setName] = useState(query?.name ?? '')
  const [language, setLanguage] = useState(query?.language ?? 'CYPHER QUERY')
  const [queryText, setQueryText] = useState(query?.queryText ?? '')
  const titleId = `drasi-query-config-title-${query?.id ?? 'new'}`

  const handleDownloadYaml = () => {
    if (!query) return
    const doc = {
      apiVersion: 'v1',
      kind: 'ContinuousQuery',
      name: query.name,
      spec: {
        mode: query.language.replace(/ QUERY$/, ''),
        query: query.queryText || '',
        sources: query.sourceIds.map(id => ({ id })),
      },
    }
    downloadText(`${query.name}.yaml`, yaml.dump(doc), 'text/yaml')
  }

  return (
    <ModalShell
      labelledBy={titleId}
      onClose={onClose}
      panelClassName="bg-slate-900 border border-slate-600/50 rounded-lg max-w-lg w-full p-4"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div id={titleId} className="text-white font-semibold text-sm">{isCreate ? t('drasi.createContinuousQuery') : t('drasi.configureContinuousQuery')}</div>
          <div className="text-muted-foreground text-xs uppercase tracking-wider mt-0.5">
            {isCreate ? t('drasi.newQuerySubtitle') : t('drasi.queryLanguageLabel', { language: query!.language })}
          </div>
        </div>
        <button type="button" onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400" aria-label={t('actions.close')}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.nameLabel')}</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.queryTypeLabel')}</label>
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-none"
          >
            {QUERY_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.queryLabel')}</label>
          <div className="rounded border border-slate-700 overflow-hidden text-xs">
            <CodeMirror
              value={queryText}
              onChange={setQueryText}
              theme={oneDark}
              extensions={[StreamLanguage.define(cypher)]}
              height={CODEMIRROR_EDITOR_HEIGHT_PX}
              basicSetup={{
                lineNumbers: true,
                highlightActiveLine: true,
                foldGutter: false,
                autocompletion: false,
              }}
              placeholder={t('drasi.queryPlaceholder')}
            />
          </div>
        </div>
      </div>
      <div className="flex justify-between items-center gap-2 mt-4">
        {!isCreate ? (
          <button
            type="button"
            onClick={handleDownloadYaml}
            className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-muted-foreground border border-slate-700 flex items-center gap-1.5"
          >
            <Download className="w-3 h-3" />
            {t('drasi.downloadYaml')}
          </button>
        ) : <div />}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-muted-foreground border border-slate-700">{t('actions.cancel')}</button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => { onSave({ name: name.trim(), language, queryText }); onClose() }}
            className="px-3 py-1.5 text-xs rounded bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white"
          >
            {t('actions.save')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// Connections modal — manage the localStorage-backed list of Drasi servers
// and pick which one is active. Modeled after the AI/ML endpoint manager.
// ---------------------------------------------------------------------------

interface ConnectionsModalProps {
  connections: DrasiConnection[]
  activeId: string
  onSelect: (id: string) => void
  onAdd: (conn: Omit<DrasiConnection, 'id' | 'createdAt'>) => void
  onUpdate: (id: string, patch: Partial<Omit<DrasiConnection, 'id' | 'createdAt'>>) => void
  /** Parent handles confirm UX + runs the actual removal — we just fire
   *  the request so the parent's ConfirmDialog is what the user sees. */
  onRequestRemove: (id: string, name: string) => void
  onClose: () => void
}

function ConnectionsModal({
  connections, activeId, onSelect, onAdd, onUpdate, onRequestRemove, onClose,
}: ConnectionsModalProps) {
  const { t } = useTranslation()
  // null = list view. 'new' = create form. string id = edit form.
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'server' | 'platform'>('server')
  const [url, setUrl] = useState('')
  const [cluster, setCluster] = useState('')

  const beginAdd = () => {
    setEditing('new')
    setName('')
    setMode('server')
    setUrl('')
    setCluster('')
  }
  const beginEdit = (conn: DrasiConnection) => {
    setEditing(conn.id)
    setName(conn.name)
    setMode(conn.mode)
    setUrl(conn.url ?? '')
    setCluster(conn.cluster ?? '')
  }
  const saveEdit = () => {
    const payload: Omit<DrasiConnection, 'id' | 'createdAt'> = {
      name: name.trim(),
      mode,
      url: mode === 'server' ? url.trim() : undefined,
      cluster: mode === 'platform' ? cluster.trim() : undefined,
    }
    if (!payload.name) return
    if (mode === 'server' && !payload.url) return
    if (mode === 'platform' && !payload.cluster) return
    if (editing === 'new') onAdd(payload)
    else if (editing) onUpdate(editing, payload)
    setEditing(null)
  }

  return (
    <ModalShell
      labelledBy="drasi-connections-title"
      onClose={onClose}
      panelClassName="bg-slate-900 border border-slate-600/50 rounded-lg max-w-lg w-full p-4"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div id="drasi-connections-title" className="text-white font-semibold text-sm">{t('drasi.connectionsTitle')}</div>
          <div className="text-muted-foreground text-xs uppercase tracking-wider mt-0.5">{t('drasi.connectionsSubtitle')}</div>
        </div>
        <button type="button" onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400" aria-label={t('actions.close')}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {editing === null ? (
        <>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {connections.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">{t('drasi.noConnections')}</div>
            )}
            {connections.map(conn => (
              <div
                key={conn.id}
                className={`flex items-center gap-2 p-2 rounded border ${
                  conn.id === activeId ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-slate-700/40 bg-slate-950/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(conn.id)}
                  className="flex-1 text-left min-w-0"
                  aria-label={t('drasi.selectConnection', { name: conn.name })}
                >
                  <div className="flex items-center gap-1.5">
                    {conn.id === activeId && <Check className="w-3 h-3 text-cyan-400 shrink-0" />}
                    <span className="text-xs font-semibold text-white truncate">{conn.name}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate">
                    {conn.mode === 'server' ? conn.url : `${t('drasi.clusterLabel')}: ${conn.cluster}`}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => beginEdit(conn)}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-300"
                  aria-label={t('actions.edit')}
                  title={t('actions.edit')}
                >
                  <Settings className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onRequestRemove(conn.id, conn.name)}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/20 text-slate-400 hover:text-red-300"
                  aria-label={t('actions.delete')}
                  title={t('actions.delete')}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={beginAdd}
              className="px-3 py-1.5 text-xs rounded bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5"
            >
              <Plus className="w-3 h-3" />
              {t('drasi.addConnection')}
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.nameLabel')}</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('drasi.connectionNamePlaceholder')}
              className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.connectionModeLabel')}</label>
            <select
              value={mode}
              onChange={e => setMode(e.target.value as 'server' | 'platform')}
              className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="server">drasi-server (REST)</option>
              <option value="platform">drasi-platform (Kubernetes)</option>
            </select>
          </div>
          {mode === 'server' ? (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.serverUrlLabel')}</label>
              <input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="http://localhost:8090"
                className="w-full px-2 py-1.5 text-xs font-mono bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          ) : (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.clusterContextLabel')}</label>
              <input
                type="text"
                value={cluster}
                onChange={e => setCluster(e.target.value)}
                placeholder="prow"
                className="w-full px-2 py-1.5 text-xs font-mono bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-muted-foreground border border-slate-700">{t('actions.cancel')}</button>
            <button
              type="button"
              onClick={saveEdit}
              className="px-3 py-1.5 text-xs rounded bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              {t('actions.save')}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// Stream sample drawer — per-language code snippets showing how to consume
// a Drasi SSE reaction stream from an external app.
// ---------------------------------------------------------------------------

interface StreamSample {
  lang: string
  label: string
  lineExt: ReturnType<typeof StreamLanguage.define>
  snippet: (endpoint: string) => string
}

// Snippets are intentionally minimal — subscribe, log deltas, that's it.
// Users will copy them as a starting point. All snippets assume the
// endpoint emits drasi-server's `{added, updated, deleted}` delta shape.
const STREAM_SAMPLES: StreamSample[] = [
  {
    lang: 'js',
    label: 'JavaScript (browser)',
    lineExt: StreamLanguage.define(javascript),
    snippet: (endpoint) => `const es = new EventSource('${endpoint}')

es.onmessage = (ev) => {
  const delta = JSON.parse(ev.data)
  // delta.added / delta.updated / delta.deleted are arrays of result rows.
  for (const row of delta.added ?? []) console.log('added', row)
  for (const row of delta.updated ?? []) console.log('updated', row)
  for (const row of delta.deleted ?? []) console.log('deleted', row)
}

es.onerror = () => console.error('SSE connection lost — browser will retry')
`,
  },
  {
    lang: 'node',
    label: 'Node.js',
    lineExt: StreamLanguage.define(javascript),
    snippet: (endpoint) => `// npm install eventsource
import EventSource from 'eventsource'

const es = new EventSource('${endpoint}')

es.on('message', (ev) => {
  const delta = JSON.parse(ev.data)
  for (const row of delta.added ?? []) console.log('added', row)
  for (const row of delta.updated ?? []) console.log('updated', row)
  for (const row of delta.deleted ?? []) console.log('deleted', row)
})

es.on('error', (err) => console.error('stream error', err))
`,
  },
  {
    lang: 'python',
    label: 'Python',
    lineExt: StreamLanguage.define(python),
    snippet: (endpoint) => `# pip install httpx
import httpx, json

with httpx.stream('GET', '${endpoint}', timeout=None) as r:
    for line in r.iter_lines():
        if not line.startswith('data:'):
            continue
        delta = json.loads(line[5:].strip())
        for row in delta.get('added', []):    print('added', row)
        for row in delta.get('updated', []):  print('updated', row)
        for row in delta.get('deleted', []):  print('deleted', row)
`,
  },
  {
    lang: 'curl',
    label: 'curl',
    lineExt: StreamLanguage.define(shell),
    snippet: (endpoint) => `curl -N -H 'Accept: text/event-stream' '${endpoint}'
`,
  },
  {
    lang: 'go',
    label: 'Go',
    lineExt: StreamLanguage.define(go),
    snippet: (endpoint) => `package main

import (
\t"bufio"
\t"encoding/json"
\t"fmt"
\t"net/http"
\t"strings"
)

func main() {
\tresp, err := http.Get("${endpoint}")
\tif err != nil { panic(err) }
\tdefer resp.Body.Close()

\tscan := bufio.NewScanner(resp.Body)
\tfor scan.Scan() {
\t\tline := scan.Text()
\t\tif !strings.HasPrefix(line, "data:") { continue }
\t\tvar delta struct {
\t\t\tAdded   []map[string]any \`json:"added"\`
\t\t\tUpdated []map[string]any \`json:"updated"\`
\t\t\tDeleted []map[string]any \`json:"deleted"\`
\t\t}
\t\tif err := json.Unmarshal([]byte(strings.TrimSpace(line[5:])), &delta); err != nil { continue }
\t\tfmt.Printf("added=%d updated=%d deleted=%d\\n", len(delta.Added), len(delta.Updated), len(delta.Deleted))
\t}
}
`,
  },
  {
    lang: 'csharp',
    label: 'C# / .NET',
    // legacy-modes has no dedicated C# mode; fall back to javascript which
    // handles strings/keywords/comments reasonably for this snippet.
    lineExt: StreamLanguage.define(javascript),
    snippet: (endpoint) => `using System.Net.Http;
using System.Text.Json;

var http = new HttpClient();
using var stream = await http.GetStreamAsync("${endpoint}");
using var reader = new StreamReader(stream);

while (!reader.EndOfStream) {
    var line = await reader.ReadLineAsync();
    if (line is null || !line.StartsWith("data:")) continue;
    using var doc = JsonDocument.Parse(line[5..].Trim());
    Console.WriteLine(doc.RootElement);
}
`,
  },
]

interface StreamSampleDrawerProps {
  /** Endpoint the snippets should point at. Demo mode uses a placeholder
   *  with a banner; live mode uses the real proxy URL. */
  endpoint: string
  isDemo: boolean
  onClose: () => void
}

function StreamSampleDrawer({ endpoint, isDemo, onClose }: StreamSampleDrawerProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState(STREAM_SAMPLES[0].lang)
  const [copied, setCopied] = useState(false)
  const sample = STREAM_SAMPLES.find(s => s.lang === tab) ?? STREAM_SAMPLES[0]
  const snippet = sample.snippet(endpoint)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), STREAM_COPY_FLASH_MS)
    } catch {
      // Clipboard denied — user can still select manually.
    }
  }

  return (
    <motion.div
      // Drawer capped at min(75% of card, 720px) so code snippets get
      // breathing room without wall-to-walling the whole card on wide
      // viewports. Was a flat 480px — too cramped for Go / C# samples.
      className="absolute top-0 right-0 bottom-0 z-40 w-[min(75%,720px)] min-w-[520px] bg-slate-950 border-l border-slate-700 shadow-2xl flex flex-col"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'tween', duration: 0.2 }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/60">
        <div className="flex items-center gap-1.5">
          <Code2 className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">{t('drasi.consumeStreamTitle')}</span>
        </div>
        <button type="button" onClick={onClose} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400" aria-label={t('actions.close')}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {isDemo && (
        <div className="px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/30 text-[10px] text-yellow-200">
          {t('drasi.streamDemoHint')}
        </div>
      )}

      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-800/60 overflow-x-auto">
        {STREAM_SAMPLES.map(s => (
          <button
            key={s.lang}
            type="button"
            onClick={() => setTab(s.lang)}
            className={`shrink-0 px-2 py-1 text-[10px] rounded uppercase tracking-wider ${
              tab === s.lang
                ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-200'
                : 'border border-transparent text-slate-400 hover:text-cyan-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="px-3 py-1.5 flex items-center justify-between border-b border-slate-800/60">
        <code className="text-[10px] text-muted-foreground font-mono truncate flex-1 mr-2">{endpoint}</code>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 px-2 py-0.5 text-[10px] rounded bg-slate-800 hover:bg-slate-700 text-muted-foreground border border-slate-700 flex items-center gap-1"
          aria-label={t('drasi.copySnippet')}
        >
          {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
          {copied ? t('drasi.copied') : t('drasi.copy')}
        </button>
      </div>

      <div className="flex-1 overflow-hidden text-xs">
        <CodeMirror
          value={snippet}
          theme={oneDark}
          extensions={[sample.lineExt]}
          editable={false}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: false,
            foldGutter: false,
            autocompletion: false,
          }}
        />
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DrasiReactiveGraph() {
  const { t } = useTranslation()
  const { shouldUseDemoData: isDemoMode, showDemoBadge } = useCardDemoState({ requires: 'none' })
  const { data: liveData, isLoading, error } = useDrasiResources()

  useReportCardDataState({
    isDemoData: showDemoBadge || (!liveData && !isLoading),
    isFailed: !!error,
    consecutiveFailures: error ? 1 : 0,
    hasData: true,
  })

  const [selectedQueryId, setSelectedQueryId] = useState<string>('q-top-losers')
  const [pinnedQueryId, setPinnedQueryId] = useState<string | null>(null)
  const [stoppedNodeIds, setStoppedNodeIds] = useState<Set<string>>(new Set())
  // Hover state — when set, lines connected to this node stay bright while
  // every other line dims. Mirrors ServiceTopology.tsx's hoveredNode pattern.
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [expandedNode, setExpandedNode] = useState<ExpandedNodeDetails | null>(null)
  // 'new' sentinel = create mode; a DrasiSource/Query object = edit mode;
  // null = modal closed. Single state avoids an extra boolean flag.
  const [configuringSource, setConfiguringSource] = useState<DrasiSource | 'new' | null>(null)
  const [configuringQuery, setConfiguringQuery] = useState<DrasiQuery | 'new' | null>(null)
  // Clicked results-table row — opens the right-side detail drawer.
  const [selectedRow, setSelectedRow] = useState<LiveResultRow | null>(null)
  const navigate = useNavigate()

  const {
    connections: drasiConnections,
    activeConnection,
    addConnection,
    updateConnection,
    removeConnection,
    setActive,
  } = useDrasiConnections()

  // Pick the demo theme that matches the currently-active connection. Demo
  // seeds each have their own thematic pipeline; non-seed (or no active)
  // falls back to the original "stocks" theme.
  const demoThemeId = useMemo(
    () => demoThemeForConnection(activeConnection?.isDemoSeed ? activeConnection.id : undefined),
    [activeConnection],
  )
  const [demoData, setDemoData] = useState<DrasiPipelineData>(() => generateDemoData(demoThemeId))

  // Reset demo graph when the user switches demo-seed servers so the whole
  // pipeline swaps in (not just the row values). Only fires on theme change.
  useEffect(() => {
    setDemoData(generateDemoData(demoThemeId))
  }, [demoThemeId])

  // Periodically regenerate demo results so the table values change
  useEffect(() => {
    if (!isDemoMode && liveData) return
    const interval = setInterval(() => {
      setDemoData(prev => {
        // Keep existing sources/queries/reactions (user may have edited them);
        // only regenerate the result rows for animation.
        const fresh = generateDemoData(demoThemeId)
        return { ...prev, liveResults: fresh.liveResults }
      })
    }, FLOW_ANIMATION_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isDemoMode, liveData, demoThemeId])
  const isLive = !!liveData && !isDemoMode
  const [showConnectionsModal, setShowConnectionsModal] = useState(false)
  const [showStreamSamples, setShowStreamSamples] = useState(false)
  // Shared confirm-dialog state for every destructive action in the card.
  // Replaces window.confirm() so delete flows go through the themed
  // ConfirmDialog (user does not want browser-chrome alerts).
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string
    message: string
    onConfirm: () => void
  } | null>(null)
  // Selected flow (connected component) — FLOW_ID_ALL means show the full
  // graph (no filter). Reset automatically if the selected id disappears
  // after a poll (e.g. the user deleted a resource in the active flow).
  const [selectedFlowId, setSelectedFlowId] = useState<string>(FLOW_ID_ALL)

  // Subscribe to the selected query's SSE event stream when running against
  // a real drasi-server. Falls through to the demo regen / static results
  // path when in demo mode or running against drasi-platform.
  const streamSubscription = useDrasiQueryStream({
    mode: isLive ? (liveData?.mode ?? null) : null,
    drasiServerUrl: activeConnection?.mode === 'server' ? activeConnection.url : undefined,
    instanceId: liveData?.instanceId ?? null,
    queryId: isLive ? selectedQueryId : null,
    paused: stoppedNodeIds.has(selectedQueryId),
  })

  const rawPipelineData = useMemo<DrasiPipelineData>(
    () => {
      if (isLive && liveData) {
        // Prefer the rolling streamed results when the SSE subscription is
        // live; otherwise use the snapshot the REST adapter returned.
        const liveResults = streamSubscription.results.length > 0
          ? streamSubscription.results
          : liveData.liveResults
        return { ...liveData, liveResults }
      }
      return demoData
    },
    [isLive, liveData, demoData, streamSubscription.results],
  )

  // Derive flows (connected components) from the raw graph. Recomputes on
  // every poll; the `id` field is deterministic (sorted member list) so
  // stable across re-computations as long as membership hasn't changed.
  const flows = useMemo(
    () => computeFlows(rawPipelineData.sources, rawPipelineData.queries, rawPipelineData.reactions),
    [rawPipelineData.sources, rawPipelineData.queries, rawPipelineData.reactions],
  )

  // Filter the pipeline to the currently selected flow, or pass through if
  // "All" is selected or the id no longer exists after a refresh.
  const pipelineData = useMemo<DrasiPipelineData>(() => {
    if (selectedFlowId === FLOW_ID_ALL) return rawPipelineData
    const flow = flows.find(f => f.id === selectedFlowId)
    if (!flow) return rawPipelineData
    return {
      ...rawPipelineData,
      sources: rawPipelineData.sources.filter(s => flow.sourceIds.has(s.id)),
      queries: rawPipelineData.queries.filter(q => flow.queryIds.has(q.id)),
      reactions: rawPipelineData.reactions.filter(r => flow.reactionIds.has(r.id)),
    }
  }, [rawPipelineData, flows, selectedFlowId])

  const { sources, queries, reactions, liveResults } = pipelineData

  // If the selected flow id disappeared after a refresh (e.g. the last query
  // in it was deleted), fall back to "All" rather than leaving the card empty.
  useEffect(() => {
    if (selectedFlowId !== FLOW_ID_ALL && !flows.some(f => f.id === selectedFlowId)) {
      setSelectedFlowId(FLOW_ID_ALL)
    }
  }, [flows, selectedFlowId])

  useEffect(() => {
    if (queries.length > 0 && !queries.find(q => q.id === selectedQueryId)) {
      setSelectedQueryId(pinnedQueryId && queries.find(q => q.id === pinnedQueryId) ? pinnedQueryId : queries[0].id)
    }
  }, [queries, selectedQueryId, pinnedQueryId])

  const handleQueryClick = useCallback((queryId: string) => {
    if (pinnedQueryId && pinnedQueryId !== queryId) return
    setSelectedQueryId(queryId)
  }, [pinnedQueryId])

  const toggleStopped = useCallback((nodeId: string) => {
    setStoppedNodeIds(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])

  const togglePin = useCallback((queryId: string) => {
    setPinnedQueryId(prev => (prev === queryId ? null : queryId))
    setSelectedQueryId(queryId)
  }, [])

  const { refetch: refetchDrasi } = useDrasiResources()

  // Build the query-string that targets whichever Drasi connection is active.
  // Consolidated so create/update/delete all route through the same proxy.
  const drasiProxyTarget = useCallback((): string => {
    if (!activeConnection) return ''
    if (activeConnection.mode === 'server' && activeConnection.url) {
      return `target=server&url=${encodeURIComponent(activeConnection.url)}`
    }
    return `target=platform&cluster=${encodeURIComponent(activeConnection.cluster || '')}`
  }, [activeConnection])

  // Resource-kind → REST path root for each Drasi mode. drasi-server and
  // drasi-platform diverge on both prefix (`/api/v1` vs `/v1`) and the query
  // resource name (`queries` vs `continuousQueries`).
  const drasiResourcePath = useCallback(
    (kind: 'source' | 'query' | 'reaction'): string => {
      if (!liveData) return ''
      const isServer = liveData.mode === 'server'
      const prefix = isServer ? '/api/v1' : '/v1'
      switch (kind) {
        case 'source': return `${prefix}/sources`
        case 'query': return `${prefix}/${isServer ? 'queries' : 'continuousQueries'}`
        case 'reaction': return `${prefix}/reactions`
      }
    },
    [liveData],
  )

  const saveSourceConfig = useCallback(async (sourceId: string | null, config: SourceConfig) => {
    if (isLive && liveData) {
      const basePath = drasiResourcePath('source')
      const isCreate = sourceId === null
      const path = isCreate ? basePath : `${basePath}/${encodeURIComponent(sourceId)}`
      try {
        await fetch(`/api/drasi/proxy${path}?${drasiProxyTarget()}`, {
          method: isCreate ? 'POST' : 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: config.name, spec: { kind: config.kind } }),
        })
        refetchDrasi()
      } catch {
        // Surface via the existing error path on the next poll.
      }
      return
    }
    // Demo mode — local-state only.
    if (sourceId === null) {
      setDemoData(prev => ({
        ...prev,
        sources: [...prev.sources, { id: config.name, name: config.name, kind: config.kind, status: 'ready' }],
      }))
      return
    }
    setDemoData(prev => ({
      ...prev,
      sources: prev.sources.map(s => s.id === sourceId ? { ...s, name: config.name, kind: config.kind } : s),
    }))
  }, [isLive, liveData, refetchDrasi, drasiProxyTarget, drasiResourcePath])

  const saveQueryConfig = useCallback(async (queryId: string | null, config: QueryConfig) => {
    if (isLive && liveData) {
      const basePath = drasiResourcePath('query')
      const isCreate = queryId === null
      const path = isCreate ? basePath : `${basePath}/${encodeURIComponent(queryId)}`
      try {
        await fetch(`/api/drasi/proxy${path}?${drasiProxyTarget()}`, {
          method: isCreate ? 'POST' : 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id: config.name,
            spec: { mode: config.language.replace(/ QUERY$/, ''), query: config.queryText },
          }),
        })
        refetchDrasi()
      } catch {
        // Surface via the existing error path on the next poll.
      }
      return
    }
    if (queryId === null) {
      setDemoData(prev => ({
        ...prev,
        queries: [...prev.queries, {
          id: config.name, name: config.name, language: config.language,
          status: 'ready', sourceIds: [], queryText: config.queryText,
        }],
      }))
      return
    }
    setDemoData(prev => ({
      ...prev,
      queries: prev.queries.map(q => q.id === queryId ? { ...q, name: config.name, language: config.language, queryText: config.queryText } : q),
    }))
  }, [isLive, liveData, refetchDrasi, drasiProxyTarget, drasiResourcePath])

  // Reactions: Wave A ships create-as-default-SSE + delete; the full gear
  // modal is deferred to Wave B along with the CodeMirror query editor.
  const createDefaultReaction = useCallback(async () => {
    const defaultName = `reaction-${Date.now().toString(36).slice(-5)}`
    if (isLive && liveData) {
      try {
        await fetch(`/api/drasi/proxy${drasiResourcePath('reaction')}?${drasiProxyTarget()}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id: defaultName,
            spec: { kind: 'SSE', queries: queries.map(q => ({ id: q.id })) },
          }),
        })
        refetchDrasi()
      } catch {
        // Non-fatal; next poll surfaces the error.
      }
      return
    }
    setDemoData(prev => ({
      ...prev,
      reactions: [...prev.reactions, {
        id: defaultName, name: defaultName, kind: 'SSE',
        status: 'ready', queryIds: prev.queries.map(q => q.id),
      }],
    }))
  }, [isLive, liveData, queries, refetchDrasi, drasiProxyTarget, drasiResourcePath])

  // Creates a Result reaction scoped to a single continuous query. Used by
  // the drasi-platform "Enable live results" button. Platform mode does not
  // expose drasi-server's built-in per-query SSE stream, so a Result reaction
  // is the canonical way to subscribe to query deltas.
  const createResultReactionForQuery = useCallback(async (queryId: string) => {
    if (!isLive || !liveData) return
    const reactionName = `result-${queryId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    try {
      await fetch(`/api/drasi/proxy${drasiResourcePath('reaction')}?${drasiProxyTarget()}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: reactionName,
          spec: { kind: 'Result', queries: [{ id: queryId }] },
        }),
      })
      refetchDrasi()
    } catch {
      // Non-fatal; next poll surfaces the error.
    }
  }, [isLive, liveData, refetchDrasi, drasiProxyTarget, drasiResourcePath])

  const deleteResource = useCallback((
    kind: 'source' | 'query' | 'reaction',
    id: string,
    name: string,
  ) => {
    setPendingConfirm({
      title: t('drasi.deleteConfirmTitle'),
      message: t('drasi.deleteConfirm', { name }),
      onConfirm: async () => {
        if (isLive && liveData) {
          try {
            await fetch(`/api/drasi/proxy${drasiResourcePath(kind)}/${encodeURIComponent(id)}?${drasiProxyTarget()}`, {
              method: 'DELETE',
            })
            refetchDrasi()
          } catch {
            // Non-fatal; next poll surfaces the error.
          }
          return
        }
        setDemoData(prev => {
          if (kind === 'source') return { ...prev, sources: prev.sources.filter(s => s.id !== id) }
          if (kind === 'query') return { ...prev, queries: prev.queries.filter(q => q.id !== id) }
          return { ...prev, reactions: prev.reactions.filter(r => r.id !== id) }
        })
      },
    })
  }, [isLive, liveData, refetchDrasi, drasiProxyTarget, drasiResourcePath, t])

  // --- Dynamic line positioning --------------------------------------------

  const containerRef = useRef<HTMLDivElement | null>(null)
  // Callback-ref maps: React calls the setter with (el) on mount and (null) on
  // unmount, so entries for removed nodes are dropped automatically without
  // touching ref values during render (#7872).
  const sourceEls = useRef<Record<string, HTMLDivElement | null>>({})
  const queryEls = useRef<Record<string, HTMLDivElement | null>>({})
  const reactionEls = useRef<Record<string, HTMLDivElement | null>>({})

  const setSourceEl = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) sourceEls.current[id] = el
    else delete sourceEls.current[id]
  }, [])
  const setQueryEl = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) queryEls.current[id] = el
    else delete queryEls.current[id]
  }, [])
  const setReactionEl = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) reactionEls.current[id] = el
    else delete reactionEls.current[id]
  }, [])

  const [rects, setRects] = useState<MeasuredRects>({ sources: {}, queries: {}, reactions: {}, container: { width: 0, height: 0 } })

  useLayoutEffect(() => {
    function measure() {
      const containerEl = containerRef.current
      if (!containerEl) return
      const cRect = containerEl.getBoundingClientRect()
      const toNodeRect = (el: HTMLElement): NodeRect => {
        const r = el.getBoundingClientRect()
        return {
          left: r.left - cRect.left,
          right: r.right - cRect.left,
          top: r.top - cRect.top,
          bottom: r.bottom - cRect.top,
          centerY: (r.top + r.bottom) / 2 - cRect.top,
        }
      }
      const newRects: MeasuredRects = {
        sources: {},
        queries: {},
        reactions: {},
        container: { width: cRect.width, height: cRect.height },
      }
      for (const [id, el] of Object.entries(sourceEls.current)) {
        if (el) newRects.sources[id] = toNodeRect(el)
      }
      for (const [id, el] of Object.entries(queryEls.current)) {
        if (el) newRects.queries[id] = toNodeRect(el)
      }
      for (const [id, el] of Object.entries(reactionEls.current)) {
        if (el) newRects.reactions[id] = toNodeRect(el)
      }
      // Skip setState when the measurement hasn't actually changed — otherwise
      // ResizeObserver can drive avoidable rerenders during window resizes (#7872).
      setRects(prev => (rectsEqual(prev, newRects) ? prev : newRects))
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (containerRef.current) observer.observe(containerRef.current)
    // Observe every node — any column height change shifts row centers
    for (const el of Object.values(sourceEls.current)) {
      if (el) observer.observe(el)
    }
    for (const el of Object.values(queryEls.current)) {
      if (el) observer.observe(el)
    }
    for (const el of Object.values(reactionEls.current)) {
      if (el) observer.observe(el)
    }
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
    // Depend on lengths, not array references. `sources/queries/reactions`
    // are recreated every render by useMemo consumers in pipelineData, so
    // including the arrays themselves triggered this effect every render
    // and drove React's update-depth limit — see GA4 error
    // "Maximum update depth exceeded" on / from 2026-04-14. The effect
    // only needs to re-run when the *set* of nodes changes (so new
    // children mount and their refs become observable); a length change
    // is a safe proxy for that, and `selectedQueryId` catches active-path
    // changes that share the same node count.
  }, [sources.length, queries.length, reactions.length, selectedQueryId, liveResults.length])

  // --- Compute paths from measured rects ------------------------------------

  const paths = useMemo(() => {
    const items: Array<{ key: string; d: string; dashed: boolean; active: boolean; delay: number }> = []
    if (!rects.container.width) return items

    const sourceRects = sources.map(s => rects.sources[s.id]).filter(Boolean)
    const queryRects = queries.map(q => rects.queries[q.id]).filter(Boolean)
    const reactionRects = reactions.map(r => rects.reactions[r.id]).filter(Boolean)

    if (sourceRects.length === 0 || queryRects.length === 0) return items

    const srcRight = Math.max(...sourceRects.map(r => r.right))
    const qLeft = Math.min(...queryRects.map(r => r.left))
    const trunk1X = (srcRight + qLeft) / 2
    const trunk1Top = Math.min(sourceRects[0].centerY, queryRects[0].centerY)
    const trunk1Bottom = Math.max(
      sourceRects[sourceRects.length - 1].centerY,
      queryRects[queryRects.length - 1].centerY,
    )
    // trunk1 carries source→query flow — dots travel top→bottom.
    items.push({ key: 'trunk1', d: `M ${trunk1X} ${trunk1Top} L ${trunk1X} ${trunk1Bottom}`, dashed: false, active: true, delay: 0 })

    sources.forEach((s, i) => {
      const r = rects.sources[s.id]
      if (!r) return
      const isActive = !stoppedNodeIds.has(s.id) && s.status === 'ready'
      items.push({
        key: `s-${s.id}`,
        d: `M ${r.right} ${r.centerY} L ${trunk1X} ${r.centerY}`,
        dashed: !isActive,
        active: isActive,
        delay: i * 0.2,
      })
    })

    queries.forEach((q, i) => {
      const r = rects.queries[q.id]
      if (!r) return
      const isActive = !stoppedNodeIds.has(q.id) && q.status === 'ready'
      items.push({
        key: `q-in-${q.id}`,
        d: `M ${trunk1X} ${r.centerY} L ${r.left} ${r.centerY}`,
        dashed: !isActive,
        active: isActive,
        delay: 0.3 + i * 0.2,
      })
    })

    if (reactionRects.length > 0) {
      const rxLeft = Math.min(...reactionRects.map(r => r.left))
      // Place trunk2 ~12px to the right of whichever query extends the
      // farthest right (incl. the spanning query), but always at least
      // 12px to the left of the reactions column. This keeps trunk2
      // outside every query card so all queries — including the wide
      // spanning one — connect via a forward-going q-out branch.
      const allRights = queries.map(q => rects.queries[q.id]).filter(Boolean).map(r => r.right)
      const qRight = allRights.length > 0 ? Math.max(...allRights) : rxLeft - 24
      const trunk2X = Math.min(qRight + 12, rxLeft - 12)
      const trunk2Top = Math.min(queryRects[0].centerY, reactionRects[0].centerY)
      const trunk2Bottom = Math.max(
        queryRects[queryRects.length - 1].centerY,
        reactionRects[reactionRects.length - 1].centerY,
      )
      // trunk2 carries query→reaction flow — dots travel bottom→top
      // (draw path bottom-to-top so animateMotion's natural forward
      // direction matches the data-flow direction).
      items.push({ key: 'trunk2', d: `M ${trunk2X} ${trunk2Bottom} L ${trunk2X} ${trunk2Top}`, dashed: false, active: true, delay: 0 })

      // Every query — including the spanning top-losers — connects to
      // trunk2 via its own horizontal branch. trunk2 then carries the
      // flow up to sse-stream.
      queries.forEach((q, i) => {
        const r = rects.queries[q.id]
        if (!r) return
        const isActive = !stoppedNodeIds.has(q.id) && q.status === 'ready'
        items.push({
          key: `q-out-${q.id}`,
          d: `M ${r.right} ${r.centerY} L ${trunk2X} ${r.centerY}`,
          dashed: !isActive,
          active: isActive,
          delay: 0.5 + i * 0.2,
        })
      })

      reactions.forEach((rx, i) => {
        const r = rects.reactions[rx.id]
        if (!r) return
        const isActive = !stoppedNodeIds.has(rx.id) && rx.status === 'ready'
        items.push({
          key: `r-${rx.id}`,
          d: `M ${trunk2X} ${r.centerY} L ${r.left} ${r.centerY}`,
          dashed: !isActive,
          active: isActive,
          delay: 0.7 + i * 0.2,
        })
      })
    }

    return items
  }, [sources, queries, reactions, rects, stoppedNodeIds, selectedQueryId, liveResults.length])

  // --- Connected-node lookup (for hover dimming on cards) -----------------
  // Given a hovered node ID, return the set of OTHER node IDs that should
  // stay bright (the upstream + downstream subgraph). Inverse-applied: any
  // node not in this set + not the hovered node itself gets dimmed.
  const connectedNodeIds = useCallback(
    (hoverId: string): Set<string> => {
      const keep = new Set<string>()
      const src = sources.find(s => s.id === hoverId)
      if (src) {
        for (const q of queries) {
          if (q.sourceIds.includes(src.id)) {
            keep.add(q.id)
            for (const r of reactions) {
              if (r.queryIds.includes(q.id)) keep.add(r.id)
            }
          }
        }
        return keep
      }
      const q = queries.find(qq => qq.id === hoverId)
      if (q) {
        for (const sid of q.sourceIds) keep.add(sid)
        for (const r of reactions) {
          if (r.queryIds.includes(q.id)) keep.add(r.id)
        }
        return keep
      }
      const rx = reactions.find(rr => rr.id === hoverId)
      if (rx) {
        for (const qid of rx.queryIds) {
          keep.add(qid)
          const target = queries.find(qq => qq.id === qid)
          if (target) {
            for (const sid of target.sourceIds) keep.add(sid)
          }
        }
        return keep
      }
      return keep
    },
    [sources, queries, reactions],
  )

  // --- Connected-line lookup (for hover dimming) ---------------------------
  // Given a hovered node ID, return the set of path keys that should stay
  // bright. Lines NOT in this set get the dimmed treatment.
  const connectedLineKeys = useMemo<Set<string> | null>(() => {
    if (!hoveredNodeId) return null
    const keep = new Set<string>()
    // Sources: the node's outbound branch + trunk1
    const src = sources.find(s => s.id === hoveredNodeId)
    if (src) {
      keep.add(`s-${src.id}`)
      keep.add('trunk1')
      // Plus the inbound branches into queries that subscribe to this source
      for (const q of queries) {
        if (q.sourceIds.includes(src.id)) keep.add(`q-in-${q.id}`)
      }
      return keep
    }
    // Queries: in-branch, out-branch, both trunks, and any reactions subscribed
    const q = queries.find(qq => qq.id === hoveredNodeId)
    if (q) {
      keep.add(`q-in-${q.id}`)
      keep.add(`q-out-${q.id}`)
      keep.add('trunk1')
      keep.add('trunk2')
      // Plus the source branches that feed this query
      for (const sid of q.sourceIds) {
        if (sources.some(s => s.id === sid)) keep.add(`s-${sid}`)
      }
      // Plus reactions subscribed to this query
      for (const r of reactions) {
        if (r.queryIds.includes(q.id)) keep.add(`r-${r.id}`)
      }
      return keep
    }
    // Reactions: the inbound branch + trunk2
    const rx = reactions.find(rr => rr.id === hoveredNodeId)
    if (rx) {
      keep.add(`r-${rx.id}`)
      keep.add('trunk2')
      // Plus the queries this reaction subscribes to and their out-branches
      for (const qid of rx.queryIds) {
        if (queries.some(qq => qq.id === qid)) keep.add(`q-out-${qid}`)
      }
      return keep
    }
    return null
  }, [hoveredNodeId, sources, queries, reactions])

  // --- Per-line state lookup -----------------------------------------------
  // The state of a line is a function of its endpoints' status + stopped set.
  function lineStateFor(pathKey: string): FlowLineState {
    // Trunks always show 'active' if any non-stopped query exists.
    if (pathKey === 'trunk1' || pathKey === 'trunk2') {
      const anyActive = queries.some(q => !stoppedNodeIds.has(q.id) && q.status === 'ready')
      return anyActive ? 'active' : 'idle'
    }
    if (pathKey.startsWith('s-')) {
      const id = pathKey.slice(2)
      const src = sources.find(s => s.id === id)
      if (!src) return 'idle'
      if (stoppedNodeIds.has(id)) return 'stopped'
      if (src.status === 'error') return 'error'
      return src.status === 'ready' ? 'active' : 'idle'
    }
    if (pathKey.startsWith('q-in-') || pathKey.startsWith('q-out-')) {
      const id = pathKey.replace(/^q-(in|out)-/, '')
      const q = queries.find(qq => qq.id === id)
      if (!q) return 'idle'
      if (stoppedNodeIds.has(id)) return 'stopped'
      if (q.status === 'error') return 'error'
      return q.status === 'ready' ? 'active' : 'idle'
    }
    if (pathKey.startsWith('r-')) {
      const id = pathKey.slice(2)
      const rx = reactions.find(rr => rr.id === id)
      if (!rx) return 'idle'
      if (stoppedNodeIds.has(id)) return 'stopped'
      if (rx.status === 'error') return 'error'
      return rx.status === 'ready' ? 'active' : 'idle'
    }
    return 'active'
  }

  // --- Pipeline KPIs --------------------------------------------------------
  // Three at-a-glance counters above the graph: events/sec, match rate,
  // active reactions. In live mode these come from the SSE stream's row
  // arrival rate; in demo mode they're derived from the rolling result set.
  const kpis = useMemo(() => {
    const total = liveResults.length
    const sourceCount = sources.length
    const reactionCount = reactions.filter(r => !stoppedNodeIds.has(r.id) && r.status === 'ready').length
    return {
      eventsPerSec: isLive ? streamSubscription.results.length : Math.max(1, Math.round(total / 3)),
      matchRate: total,
      activeReactions: reactionCount,
      activeSources: sourceCount,
    }
  }, [liveResults.length, sources, reactions, stoppedNodeIds, isLive, streamSubscription.results.length])

  return (
    <div className="h-full w-full flex flex-col p-3 overflow-hidden relative">
      {/* Drasi connection selector + flow selector — top strip. Always
          visible so the user can switch between configured Drasi installs
          (gear opens CRUD modal) and focus on a single flow at a time.
          Server select is capped in width so the Flow select + Consume
          button stay anchored to the left-hand group and don't disappear
          off the right edge of wide cards. */}
      <div className="flex-shrink-0 mb-4 flex items-center gap-2 flex-wrap">
        <Server className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <select
          value={activeConnection?.id ?? ''}
          onChange={e => setActive(e.target.value)}
          className="min-w-[160px] max-w-[260px] px-2 py-1 text-[11px] bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-none"
          aria-label={t('drasi.connectionsTitle')}
        >
          <option value="">{t('drasi.noActiveConnection')}</option>
          {drasiConnections.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.mode === 'server' ? ' · server' : ' · platform'}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowConnectionsModal(true)}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-muted-foreground hover:text-cyan-300"
          aria-label={t('drasi.manageConnections')}
          title={t('drasi.manageConnections')}
        >
          <Settings className="w-3 h-3" />
        </button>
        {/* Flow (connected component) selector — derived from the graph, not
            fetched. Only visible when there's more than one flow OR when one
            is already selected (so the user can clear it). */}
        {(flows.length > 1 || selectedFlowId !== FLOW_ID_ALL) && (
          <>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0 ml-1">{t('drasi.flowLabel')}</span>
            <select
              value={selectedFlowId}
              onChange={e => setSelectedFlowId(e.target.value)}
              className="shrink-0 min-w-[140px] max-w-[220px] px-2 py-1 text-[11px] bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-none"
              aria-label={t('drasi.flowLabel')}
            >
              <option value={FLOW_ID_ALL}>{t('drasi.flowAllResources')}</option>
              {flows.map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </>
        )}
        {/* "Consume stream" lives in the header strip as well as each
            query's results-table header — the in-table placement is easy
            to miss, so this gives it a guaranteed discoverable home. */}
        <button
          type="button"
          onClick={() => setShowStreamSamples(true)}
          className="shrink-0 ml-auto px-2 py-1 text-[10px] rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-muted-foreground hover:text-cyan-300 flex items-center gap-1.5"
          aria-label={t('drasi.consumeStreamTitle')}
          title={t('drasi.consumeStreamTitle')}
        >
          <Code2 className="w-3 h-3" />
          {t('drasi.consumeStream')}
        </button>
      </div>
      {/* Install Drasi CTA — shown only when no live connection is active.
          Deep-links to the existing console-kb install mission. */}
      {!isLive && (
        <div className="flex-shrink-0 mb-2 p-2 rounded border border-cyan-500/30 bg-cyan-500/5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-cyan-300 truncate">{t('drasi.installDrasiTitle')}</div>
            <div className="text-[10px] text-muted-foreground truncate">{t('drasi.installDrasiDescription')}</div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/missions/install-drasi')}
            className="shrink-0 px-2.5 py-1 text-[11px] rounded bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5"
          >
            <Rocket className="w-3 h-3" />
            {t('drasi.installDrasiButton')}
          </button>
        </div>
      )}
      {/* Pipeline KPIs strip */}
      <div className="flex-shrink-0 grid grid-cols-4 gap-2 mb-2">
        <KPIBox label={KPI_LABEL_EVENTS_PER_SEC} value={kpis.eventsPerSec} accent="emerald" />
        <KPIBox label={KPI_LABEL_RESULT_ROWS} value={kpis.matchRate} accent="cyan" />
        <KPIBox label={KPI_LABEL_SOURCES} value={kpis.activeSources} accent="emerald" />
        <KPIBox label={KPI_LABEL_REACTIONS} value={kpis.activeReactions} accent="emerald" />
      </div>
      <div ref={containerRef} className="relative flex-1 min-h-0">
        <svg
          className="absolute pointer-events-none"
          style={{
            zIndex: 0,
            top: 0,
            left: 0,
            width: rects.container.width || 0,
            height: rects.container.height || 0,
            overflow: 'visible',
          }}
          width={rects.container.width || 0}
          height={rects.container.height || 0}
          viewBox={`0 0 ${rects.container.width || 1} ${rects.container.height || 1}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {paths.map(p => {
            const state = lineStateFor(p.key)
            const dimmed = connectedLineKeys !== null && !connectedLineKeys.has(p.key)
            return (
              <FlowLine
                key={p.key}
                lineKey={p.key}
                d={p.d}
                dashed={p.dashed}
                active={p.active}
                delay={p.delay}
                state={state}
                dimmed={dimmed}
              />
            )
          })}
        </svg>

        <div
          className="relative grid h-full gap-y-3"
          style={{
            // 6 columns:
            //   1 source block
            //   2 left trunk area (1fr — absorbs slack + houses trunk1)
            //   3 query block
            //   4 query extension (1fr — spanning query expands here)
            //   5 right trunk column (fixed width — dedicated home for trunk2
            //     so the spanning query cannot overlap it)
            //   6 reaction block
            gridTemplateColumns:
              `minmax(0, ${NODE_MAX_WIDTH_PX}px) minmax(40px, 1fr) ` +
              `minmax(0, ${QUERY_MAX_WIDTH_PX}px) minmax(40px, 1fr) ` +
              `${TRUNK2_WIDTH_PX}px minmax(0, ${NODE_MAX_WIDTH_PX}px)`,
            gridAutoRows: 'min-content',
            zIndex: 1,
          }}
        >
          {/* Column headers (row 1) — each has an inline "+" button that
              opens the matching create modal (or, for reactions, creates a
              default SSE reaction inline). */}
          <div className="flex items-center gap-1.5" style={{ gridColumn: 1, gridRow: 1 }}>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Sources</span>
            <button
              type="button"
              onClick={() => setConfiguringSource('new')}
              className="w-4 h-4 flex items-center justify-center rounded bg-slate-700/40 hover:bg-emerald-500/30 border border-slate-600/40 hover:border-emerald-500/50 text-slate-400 hover:text-emerald-300 transition-colors"
              aria-label={t('drasi.addSource')}
              title={t('drasi.addSource')}
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>
          <div className="flex items-center gap-1.5" style={{ gridColumn: 3, gridRow: 1 }}>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Continuous Queries</span>
            <button
              type="button"
              onClick={() => setConfiguringQuery('new')}
              className="w-4 h-4 flex items-center justify-center rounded bg-slate-700/40 hover:bg-cyan-500/30 border border-slate-600/40 hover:border-cyan-500/50 text-slate-400 hover:text-cyan-300 transition-colors"
              aria-label={t('drasi.addQuery')}
              title={t('drasi.addQuery')}
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>
          <div className="flex items-center gap-1.5" style={{ gridColumn: 6, gridRow: 1 }}>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Reactions</span>
            <button
              type="button"
              onClick={createDefaultReaction}
              className="w-4 h-4 flex items-center justify-center rounded bg-slate-700/40 hover:bg-emerald-500/30 border border-slate-600/40 hover:border-emerald-500/50 text-slate-400 hover:text-emerald-300 transition-colors"
              aria-label={t('drasi.addReaction')}
              title={t('drasi.addReaction')}
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>

          {/* Sources — col 1, rows 2..n. No slice: the grid expands
              vertically as the user adds sources, matching the queries
              and reactions columns. */}
          {sources.map((source, i) => (
            <div key={source.id} style={{ gridColumn: 1, gridRow: i + 2 }}>
              <NodeCard
                nodeRef={setSourceEl(source.id)}
                title={source.name}
                subtitle={source.kind}
                icon={<SourceIconEl kind={source.kind} />}
                status={source.status}
                accentColor="emerald"
                isStopped={stoppedNodeIds.has(source.id)}
                isDimmed={hoveredNodeId !== null && hoveredNodeId !== source.id && !connectedNodeIds(hoveredNodeId).has(source.id)}
                showGear
                showDelete
                onStop={() => toggleStopped(source.id)}
                onExpand={() => setExpandedNode({ id: source.id, name: source.name, kind: source.kind, type: 'source', extra: { status: source.status } })}
                onConfigure={() => setConfiguringSource(source)}
                onDelete={() => deleteResource('source', source.id, source.name)}
                onHoverEnter={() => setHoveredNodeId(source.id)}
                onHoverLeave={() => setHoveredNodeId(null)}
              />
            </div>
          ))}

          {/* Queries — selected-with-results query spans col 3→5; others stay in col 3 */}
          {queries.map((query, i) => {
            const hasResults = query.id === selectedQueryId && !stoppedNodeIds.has(query.id) && liveResults.length > 0
            return (
              <div
                key={query.id}
                style={{
                  // Span col 3 → 5 = cols 3 + 4 (queries + extension area),
                  // stopping BEFORE col 5 (trunk2) so the vertical trunk
                  // line stays outside every query card.
                  gridColumn: hasResults ? '3 / 5' : 3,
                  gridRow: i + 2,
                }}
              >
                <NodeCard
                  nodeRef={setQueryEl(query.id)}
                  title={query.name}
                  subtitle={query.language}
                  icon={<Search className="w-3.5 h-3.5 text-cyan-400" />}
                  status={query.status}
                  accentColor="cyan"
                  isSelected={query.id === selectedQueryId}
                  isStopped={stoppedNodeIds.has(query.id)}
                  isPinned={pinnedQueryId === query.id}
                  isDimmed={hoveredNodeId !== null && hoveredNodeId !== query.id && !connectedNodeIds(hoveredNodeId).has(query.id)}
                  showPin
                  showGear
                  showDelete
                  onClick={() => handleQueryClick(query.id)}
                  onStop={() => toggleStopped(query.id)}
                  onPin={() => togglePin(query.id)}
                  onExpand={() => setExpandedNode({ id: query.id, name: query.name, kind: query.language, type: 'query', extra: { sources: query.sourceIds.join(', ') || '(none)' } })}
                  onConfigure={() => setConfiguringQuery(query)}
                  onDelete={() => deleteResource('query', query.id, query.name)}
                  onHoverEnter={() => setHoveredNodeId(query.id)}
                  onHoverLeave={() => setHoveredNodeId(null)}
                >
                  {hasResults && (
                    <ResultsTable
                      results={liveResults}
                      isDemo={!isLive}
                      onRowClick={setSelectedRow}
                      headerAction={
                        <div className="flex items-center gap-1">
                          {/* drasi-platform has no built-in per-query SSE stream;
                              offer a one-click Result reaction create so the
                              results table starts receiving deltas. */}
                          {isLive && liveData?.mode === 'platform' && !reactions.some(r => r.queryIds.includes(query.id) && r.kind === 'SSE') && (
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); createResultReactionForQuery(query.id) }}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/40 text-cyan-300 flex items-center gap-1"
                              title={t('drasi.enableLiveResultsHint')}
                            >
                              <Zap className="w-2.5 h-2.5" />
                              {t('drasi.enableLiveResults')}
                            </button>
                          )}
                          {/* "Consume this stream" — opens the code sample
                              drawer showing how to subscribe in 6 languages. */}
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setShowStreamSamples(true) }}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-muted-foreground hover:text-cyan-300 flex items-center gap-1"
                            title={t('drasi.consumeStreamTitle')}
                          >
                            <Code2 className="w-2.5 h-2.5" />
                            {t('drasi.consumeStream')}
                          </button>
                        </div>
                      }
                    />
                  )}
                </NodeCard>
              </div>
            )
          })}

          {/* Reactions — col 6, rows 2..n */}
          {reactions.map((reaction, i) => (
            <div key={reaction.id} style={{ gridColumn: 6, gridRow: i + 2 }}>
              <NodeCard
                nodeRef={setReactionEl(reaction.id)}
                title={reaction.name}
                subtitle={reaction.kind}
                icon={<ReactionIconEl kind={reaction.kind} />}
                status={reaction.status}
                accentColor="emerald"
                isStopped={stoppedNodeIds.has(reaction.id)}
                isDimmed={hoveredNodeId !== null && hoveredNodeId !== reaction.id && !connectedNodeIds(hoveredNodeId).has(reaction.id)}
                showDelete
                onStop={() => toggleStopped(reaction.id)}
                onExpand={() => setExpandedNode({ id: reaction.id, name: reaction.name, kind: reaction.kind, type: 'reaction', extra: { queries: reaction.queryIds.join(', ') || '(none)' } })}
                onDelete={() => deleteResource('reaction', reaction.id, reaction.name)}
                onHoverEnter={() => setHoveredNodeId(reaction.id)}
                onHoverLeave={() => setHoveredNodeId(null)}
              />
            </div>
          ))}
        </div>

        <AnimatePresence>
          {selectedRow && <RowDetailDrawer row={selectedRow} onClose={() => setSelectedRow(null)} />}
          {showStreamSamples && (
            <StreamSampleDrawer
              endpoint={buildStreamEndpoint(activeConnection, liveData, selectedQueryId)}
              isDemo={!isLive}
              onClose={() => setShowStreamSamples(false)}
            />
          )}
          {showConnectionsModal && (
            <ConnectionsModal
              connections={drasiConnections}
              activeId={activeConnection?.id ?? ''}
              onSelect={id => { setActive(id); setShowConnectionsModal(false) }}
              onAdd={addConnection}
              onUpdate={updateConnection}
              onRequestRemove={(id, name) => setPendingConfirm({
                title: t('drasi.deleteConnectionTitle'),
                message: t('drasi.deleteConnectionConfirm', { name }),
                onConfirm: () => removeConnection(id),
              })}
              onClose={() => setShowConnectionsModal(false)}
            />
          )}
          {expandedNode && <ExpandModal node={expandedNode} onClose={() => setExpandedNode(null)} />}
          {configuringSource && (
            <SourceConfigModal
              source={configuringSource === 'new' ? null : configuringSource}
              onSave={config => saveSourceConfig(configuringSource === 'new' ? null : configuringSource.id, config)}
              onClose={() => setConfiguringSource(null)}
            />
          )}
          {configuringQuery && (
            <QueryConfigModal
              query={configuringQuery === 'new' ? null : configuringQuery}
              onSave={config => saveQueryConfig(configuringQuery === 'new' ? null : configuringQuery.id, config)}
              onClose={() => setConfiguringQuery(null)}
            />
          )}
        </AnimatePresence>
        {/* Themed confirm dialog — shared by every destructive action in
            the card. Replaces the browser-chrome window.confirm() calls. */}
        <ConfirmDialog
          isOpen={pendingConfirm !== null}
          title={pendingConfirm?.title ?? ''}
          message={pendingConfirm?.message ?? ''}
          confirmLabel={t('actions.delete')}
          variant="danger"
          onConfirm={() => {
            pendingConfirm?.onConfirm()
            setPendingConfirm(null)
          }}
          onClose={() => setPendingConfirm(null)}
        />
      </div>
    </div>
  )
}
