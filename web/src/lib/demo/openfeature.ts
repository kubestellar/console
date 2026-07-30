/**
 * OpenFeature demo seed re-export.
 *
 * The canonical demo data lives alongside the OpenFeature card in
 * `components/cards/openfeature_status/demoData.ts`. This file re-exports
 * it so callers outside the card folder (docs, tests, future drill-downs)
 * can import a stable demo seed from `lib/demo/openfeature`.
 */

export {
  OPENFEATURE_DEMO_DATA,
  type OpenFeatureStatusData,
  type OpenFeatureProvider,
  type OpenFeatureProviderStatus,
  type OpenFeatureFlag,
  type OpenFeatureFlagType,
  type OpenFeatureFlagStats,
  type OpenFeatureHealth,
  // Legacy-compatible aliases (older imports)
  type OpenFeatureDemoData,
  type ProviderStats,
  type FeatureFlagStats,
} from '../../components/cards/openfeature_status/demoData'
