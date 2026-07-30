/**
 * KEDA demo seed re-export.
 *
 * The canonical demo data lives alongside the KEDA card in
 * `components/cards/keda_status/demoData.ts`. This file re-exports it so
 * callers outside the card folder (docs, tests, future drill-downs,
 * unified-system consumers) can import a stable demo seed from
 * `lib/demo/keda` — mirrors the pattern used by `lib/demo/linkerd`,
 * `lib/demo/tikv`, `lib/demo/envoy`, and `lib/demo/containerd`.
 */

export {
  KEDA_DEMO_DATA,
  type KedaDemoData,
  type KedaScaledObject,
  type KedaScaledObjectStatus,
  type KedaTrigger,
  type KedaTriggerType,
} from '../../components/cards/keda_status/demoData'
