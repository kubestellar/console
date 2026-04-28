/**
 * Dapr demo seed re-export.
 *
 * The canonical demo data lives alongside the Dapr card in
 * `components/cards/dapr_status/demoData.ts`. This file re-exports it so
 * callers outside the card folder (docs, tests, future drill-downs) can
 * import a stable demo seed from `lib/demo/dapr`.
 *
 * Shape covers:
 * - Control plane pods (operator / placement / sentry / sidecarInjector)
 * - Sidecar-injected application count (and distinct namespaces)
 * - Components (state-store / pubsub / binding) with building-block counts
 */

export {
  DAPR_DEMO_DATA,
  type DaprStatusData,
  type DaprControlPlanePod,
  type DaprControlPlanePodStatus,
  type DaprComponent,
  type DaprComponentType,
  type DaprAppSidecar,
  type DaprBuildingBlockCounts,
  type DaprSummary,
  type DaprHealth,
} from '../../components/cards/dapr_status/demoData'
