/**
 * Demo data for the OpenFeature status card.
 *
 * Represents a typical environment with OpenFeature providers and flag evaluations.
 * Used in demo mode or when no Kubernetes clusters are connected.
 */

const DEMO_LAST_CHECK_OFFSET_MS = 90_000 // Demo data shows as checked 90 seconds ago

export interface FeatureFlagStats {
  total: number
  enabled: number
  disabled: number
  errorRate: number // percentage 0-100
}

export interface ProviderStats {
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  evaluations: number
  cacheHitRate: number // percentage 0-100
}

export interface OpenFeatureDemoData {
  health: 'healthy' | 'degraded' | 'not-installed'
  providers: ProviderStats[]
  featureFlags: FeatureFlagStats
  totalEvaluations: number
  lastCheckTime: string
}

export const OPENFEATURE_DEMO_DATA: OpenFeatureDemoData = {
  // One provider degraded → overall degraded state for demo visibility
  health: 'degraded',
  providers: [
    {
      name: 'flagd',
      status: 'healthy',
      evaluations: 125430,
      cacheHitRate: 94.2,
    },
    {
      name: 'launchdarkly',
      status: 'degraded',
      evaluations: 89210,
      cacheHitRate: 78.5,
    },
    {
      name: 'split',
      status: 'healthy',
      evaluations: 54320,
      cacheHitRate: 91.8,
    },
  ],
  featureFlags: {
    total: 47,
    enabled: 35,
    disabled: 12,
    errorRate: 2.3,
  },
  totalEvaluations: 268960,
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_OFFSET_MS).toISOString(),
}
