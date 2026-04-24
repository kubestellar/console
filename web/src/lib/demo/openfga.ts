/**
 * OpenFGA demo seed re-export.
 *
 * The canonical demo data lives alongside the OpenFGA card in
 * `components/cards/openfga_status/demoData.ts`. This file re-exports it
 * so callers outside the card folder (docs, tests, future drill-downs)
 * can import a stable demo seed from `lib/demo/openfga`.
 */

export {
  OPENFGA_DEMO_DATA,
  type OpenfgaStatusData,
  type OpenfgaStore,
  type OpenfgaAuthorizationModel,
  type OpenfgaStats,
  type OpenfgaSummary,
  type OpenfgaApiRps,
  type OpenfgaLatencyMs,
  type OpenfgaHealth,
  type OpenfgaStoreStatus,
} from '../../components/cards/openfga_status/demoData'
