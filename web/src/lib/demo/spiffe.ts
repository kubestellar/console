/**
 * SPIFFE demo seed re-export.
 *
 * The canonical demo data lives alongside the SPIFFE card in
 * `components/cards/spiffe_status/demoData.ts`. This file re-exports it
 * so callers outside the card folder (docs, tests, future drill-downs)
 * can import a stable demo seed from `lib/demo/spiffe`.
 */

export {
  SPIFFE_DEMO_DATA,
  type SpiffeStatusData,
  type SpiffeRegistrationEntry,
  type SpiffeFederatedDomain,
  type SpiffeStats,
  type SpiffeSummary,
  type SpiffeHealth,
  type SvidType,
  type FederationStatus,
} from '../../components/cards/spiffe_status/demoData'
