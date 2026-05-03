/**
 * OpenFeature Status Card — Demo Data & Type Definitions
 *
 * OpenFeature (CNCF Incubating) is the open standard for feature flags,
 * providing a vendor-neutral SDK surface that sits in front of any flag
 * backend (flagd, LaunchDarkly, Split, ConfigCat, ...). This card surfaces
 * the operational signals a platform team needs to monitor an OpenFeature
 * deployment:
 *
 *  - Provider status (flagd, LaunchDarkly, ...) with evaluation counts and
 *    cache hit rate
 *  - Feature flags grouped by flag type (boolean / string / number / json)
 *  - Aggregate evaluation metrics (total evaluations, error rate)
 *
 * Demo data is shown when OpenFeature is not detected (demo mode, missing
 * provider CRDs, or the /api/openfeature/status endpoint returns 404).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OpenFeatureHealth = 'healthy' | 'degraded' | 'not-installed' | 'unknown'
export type OpenFeatureProviderStatus = 'healthy' | 'degraded' | 'unhealthy'
export type OpenFeatureFlagType = 'boolean' | 'string' | 'number' | 'json'

export interface OpenFeatureProvider {
  name: string
  status: OpenFeatureProviderStatus
  evaluations: number
  /** Cache hit rate as a percentage, 0–100. */
  cacheHitRate: number
}

export interface OpenFeatureFlag {
  key: string
  type: OpenFeatureFlagType
  enabled: boolean
  defaultVariant: string
  variants: number
  provider: string
  /** Number of evaluations served for this flag over the last window. */
  evaluations: number
}

export interface OpenFeatureFlagStats {
  total: number
  enabled: number
  disabled: number
  /** Error rate as a percentage, 0–100. */
  errorRate: number
}

export interface OpenFeatureStatusData {
  health: OpenFeatureHealth
  providers: OpenFeatureProvider[]
  flags: OpenFeatureFlag[]
  featureFlags: OpenFeatureFlagStats
  totalEvaluations: number
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Backwards-compatible aliases (existing code imports these names)
// ---------------------------------------------------------------------------

export type FeatureFlagStats = OpenFeatureFlagStats
export type ProviderStats = OpenFeatureProvider
export type OpenFeatureDemoData = OpenFeatureStatusData

// ---------------------------------------------------------------------------
// Demo-data constants (named — no magic numbers)
// ---------------------------------------------------------------------------

// Provider evaluation counts
const DEMO_FLAGD_EVALUATIONS = 125_430
const DEMO_LAUNCHDARKLY_EVALUATIONS = 89_210

// Provider cache hit rates (percentages)
const DEMO_FLAGD_CACHE_HIT_RATE_PCT = 94.2
const DEMO_LAUNCHDARKLY_CACHE_HIT_RATE_PCT = 78.5

// Per-flag evaluation counts
const DEMO_EVAL_NEW_CHECKOUT = 52_130
const DEMO_EVAL_BANNER_MSG = 31_004
const DEMO_EVAL_MAX_RESULTS = 18_240
const DEMO_EVAL_PRICING_CFG = 9_115
const DEMO_EVAL_CANARY_WEIGHT = 7_820
const DEMO_EVAL_ENABLE_BETA = 4_330

// Flag-stat rollups
const DEMO_FLAG_TOTAL = 6
const DEMO_FLAG_ENABLED = 4
const DEMO_FLAG_DISABLED = 2
const DEMO_FLAG_ERROR_RATE_PCT = 2.3

const DEMO_VARIANTS_BINARY = 2
const DEMO_VARIANTS_BANNER = 3
const DEMO_VARIANTS_MAX_RESULTS = 4
const DEMO_VARIANTS_JSON = 1

// Demo "last checked" offset so the card surfaces a freshness value
const DEMO_LAST_CHECK_OFFSET_MS = 90_000

// ---------------------------------------------------------------------------
// Demo data — shown when OpenFeature is not detected or in demo mode
// ---------------------------------------------------------------------------

const DEMO_PROVIDERS: OpenFeatureProvider[] = [
  {
    name: 'flagd',
    status: 'healthy',
    evaluations: DEMO_FLAGD_EVALUATIONS,
    cacheHitRate: DEMO_FLAGD_CACHE_HIT_RATE_PCT,
  },
  {
    name: 'launchdarkly',
    status: 'degraded',
    evaluations: DEMO_LAUNCHDARKLY_EVALUATIONS,
    cacheHitRate: DEMO_LAUNCHDARKLY_CACHE_HIT_RATE_PCT,
  },
]

const DEMO_FLAGS: OpenFeatureFlag[] = [
  {
    key: 'new-checkout-flow',
    type: 'boolean',
    enabled: true,
    defaultVariant: 'on',
    variants: DEMO_VARIANTS_BINARY,
    provider: 'flagd',
    evaluations: DEMO_EVAL_NEW_CHECKOUT,
  },
  {
    key: 'enable-beta-features',
    type: 'boolean',
    enabled: false,
    defaultVariant: 'off',
    variants: DEMO_VARIANTS_BINARY,
    provider: 'flagd',
    evaluations: DEMO_EVAL_ENABLE_BETA,
  },
  {
    key: 'homepage-banner-message',
    type: 'string',
    enabled: true,
    defaultVariant: 'welcome',
    variants: DEMO_VARIANTS_BANNER,
    provider: 'flagd',
    evaluations: DEMO_EVAL_BANNER_MSG,
  },
  {
    key: 'search-max-results',
    type: 'number',
    enabled: true,
    defaultVariant: 'medium',
    variants: DEMO_VARIANTS_MAX_RESULTS,
    provider: 'launchdarkly',
    evaluations: DEMO_EVAL_MAX_RESULTS,
  },
  {
    key: 'canary-deployment-weight',
    type: 'number',
    enabled: false,
    defaultVariant: 'zero',
    variants: DEMO_VARIANTS_MAX_RESULTS,
    provider: 'launchdarkly',
    evaluations: DEMO_EVAL_CANARY_WEIGHT,
  },
  {
    key: 'pricing-config',
    type: 'json',
    enabled: true,
    defaultVariant: 'default',
    variants: DEMO_VARIANTS_JSON,
    provider: 'launchdarkly',
    evaluations: DEMO_EVAL_PRICING_CFG,
  },
]

const DEMO_TOTAL_EVALUATIONS =
  DEMO_FLAGD_EVALUATIONS + DEMO_LAUNCHDARKLY_EVALUATIONS

export const OPENFEATURE_DEMO_DATA: OpenFeatureStatusData = {
  // One provider degraded → overall degraded state for demo visibility
  health: 'degraded',
  providers: DEMO_PROVIDERS,
  flags: DEMO_FLAGS,
  featureFlags: {
    total: DEMO_FLAG_TOTAL,
    enabled: DEMO_FLAG_ENABLED,
    disabled: DEMO_FLAG_DISABLED,
    errorRate: DEMO_FLAG_ERROR_RATE_PCT,
  },
  totalEvaluations: DEMO_TOTAL_EVALUATIONS,
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_OFFSET_MS).toISOString(),
}
