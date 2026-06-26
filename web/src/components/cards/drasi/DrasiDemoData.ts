/**
 * Demo data and themed pipelines for the Drasi Reactive Graph card.
 *
 * Each DemoTheme describes a complete Drasi pipeline (sources, queries,
 * reactions) along with a row generator that produces fresh result values
 * on every tick. Themes are keyed by the Drasi connection seed id so the
 * card shows a different pipeline when the user switches demo-seed servers.
 */
import type { DrasiSource, DrasiQuery, DrasiReaction, DrasiPipelineData, LiveResultRow } from './DrasiTypes'

// ---------------------------------------------------------------------------
// Stock-ticker demo rows (default "stocks" theme)
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
// Helpers for theme row generators
// ---------------------------------------------------------------------------

/** Integer in [min, max] inclusive. */
export function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1))
}

/** Float in [min, max) rounded to `decimals` places. */
export function randFloat(min: number, max: number, decimals = 2): number {
  return parseFloat((min + Math.random() * (max - min)).toFixed(decimals))
}

/** Random element from a readonly array. */
export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ---------------------------------------------------------------------------
// Demo theme registry
// ---------------------------------------------------------------------------

/** Demo theme id = the Drasi connection seed id it's paired with. Plus
 *  `stocks` for the no-connection default. */
export type DemoThemeId =
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

export const DEMO_THEMES: Record<DemoThemeId, DemoTheme> = {
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Generate a themed demo pipeline. Defaults to the stocks theme. */
export function generateDemoData(themeId: DemoThemeId = 'stocks'): DrasiPipelineData {
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
export function demoThemeForConnection(connectionId: string | undefined): DemoThemeId {
  if (connectionId === 'demo-seed-retail') return 'demo-seed-retail'
  if (connectionId === 'demo-seed-iot') return 'demo-seed-iot'
  if (connectionId === 'demo-seed-fraud') return 'demo-seed-fraud'
  if (connectionId === 'demo-seed-supply') return 'demo-seed-supply'
  return 'stocks'
}
