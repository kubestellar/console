/**
 * Linkerd demo seed re-export.
 *
 * The canonical demo data lives alongside the Linkerd card in
 * `components/cards/linkerd_status/demoData.ts`. This file re-exports it
 * so callers outside the card folder (docs, tests, future drill-downs)
 * can import a stable demo seed from `lib/demo/linkerd`.
 */

export {
  LINKERD_DEMO_DATA,
  type LinkerdStatusData,
  type LinkerdMeshedDeployment,
  type LinkerdStats,
  type LinkerdSummary,
  type LinkerdHealth,
  type LinkerdPodStatus,
} from '../../components/cards/linkerd_status/demoData'
