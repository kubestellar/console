/**
 * wasmCloud demo seed re-export.
 *
 * The canonical demo data lives alongside the wasmCloud card in
 * `components/cards/wasmcloud_status/demoData.ts`. This file re-exports it
 * so callers outside the card folder (docs, tests, future drill-downs)
 * can import a stable demo seed from `lib/demo/wasmcloud`.
 */

export {
  WASMCLOUD_DEMO_DATA,
  type WasmcloudStatusData,
  type WasmcloudHost,
  type WasmcloudActor,
  type WasmcloudProvider,
  type WasmcloudLink,
  type WasmcloudStats,
  type WasmcloudSummary,
  type WasmcloudHealth,
  type WasmcloudHostStatus,
  type WasmcloudProviderStatus,
  type WasmcloudLinkStatus,
} from '../../components/cards/wasmcloud_status/demoData'
