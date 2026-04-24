/**
 * Deployment Risk Score Card Configuration
 *
 * Correlates Argo CD sync/health, Kyverno violations, and pod restart rates
 * into a single 0-100 risk score per namespace.
 *
 * See https://github.com/kubestellar/console/issues/9827
 */

import type { UnifiedCardConfig } from '../../lib/unified/types'

export const deploymentRiskScoreConfig: UnifiedCardConfig = {
  type: 'deployment_risk_score',
  title: 'Deployment Risk Score',
  category: 'security',
  description:
    'Correlates Argo CD sync status, Kyverno violations, and pod restart rates into a single 0-100 risk index per namespace.',

  // Appearance
  icon: 'ShieldAlert',
  iconColor: 'text-yellow-400',
  defaultWidth: 6,
  defaultHeight: 4,

  // Data source — the card component itself pulls from multiple hooks
  // (useArgoCDApplications + useKyverno + useCachedAllPods), so this is
  // a composite source and we use `static` to skip the auto-wired
  // single-hook loader. The component handles its own data fetching.
  dataSource: { type: 'static' },

  // Content — the card renders its own list view. `custom` tells the
  // unified renderer to defer to the component registered in
  // cardRegistry.ts under the matching type id.
  content: { type: 'custom', component: 'DeploymentRiskScore' },

  // Empty state — fired when no namespaces have signals across all sources
  emptyState: {
    icon: 'ShieldCheck',
    title: 'No deployment risk detected',
    message: 'Argo CD, Kyverno, and pod restart signals all clean.',
    variant: 'success',
  },

  // Loading state
  loadingState: {
    type: 'list',
    rows: 5,
  },

  // Metadata
  isDemoData: true,
  isLive: false,
}

export default deploymentRiskScoreConfig
