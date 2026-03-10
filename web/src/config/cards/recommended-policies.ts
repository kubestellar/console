/**
 * Recommended Policies Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const recommendedPoliciesConfig: UnifiedCardConfig = {
  type: 'recommended_policies',
  title: 'Recommended Policies',
  category: 'security',
  description: 'AI-powered policy gap analysis with one-click fleet-wide deployment',
  icon: 'Sparkles',
  iconColor: 'text-purple-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useRecommendedPolicies' },
  content: { type: 'custom' },
  emptyState: { icon: 'Shield', title: 'No Compliance Tools', message: 'Install Kyverno, Kubescape, or Trivy to get recommendations', variant: 'info' },
  loadingState: { type: 'table', count: 4 },
  isDemoData: false,
  isLive: true,
}
export default recommendedPoliciesConfig
