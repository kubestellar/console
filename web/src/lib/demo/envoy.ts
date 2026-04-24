/**
 * Envoy demo seed re-export.
 *
 * The canonical demo data lives alongside the Envoy card in
 * `components/cards/envoy_status/demoData.ts`. This file re-exports it
 * so callers outside the card folder (docs, tests, future drill-downs)
 * can import a stable demo seed from `lib/demo/envoy`.
 */

export {
  ENVOY_DEMO_DATA,
  type EnvoyStatusData,
  type EnvoyListener,
  type EnvoyUpstreamCluster,
  type EnvoyStats,
  type EnvoySummary,
  type EnvoyHealth,
  type EnvoyListenerStatus,
  type EnvoyClusterHealth,
} from '../../components/cards/envoy_status/demoData'
