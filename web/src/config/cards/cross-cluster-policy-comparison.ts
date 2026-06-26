/**
 * Cross-Cluster Policy Comparison Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const crossClusterPolicyComparisonConfig: UnifiedCardConfig = {
  type: 'cross_cluster_policy_comparison',
  title: 'Policy Comparison',
  category: 'security',
  description: 'Compare policy pass/fail status across clusters',
  icon: 'GitCompare',
  iconColor: 'text-purple-400',
  defaultWidth: 6,
  defaultHeight: 3,
  dataSource: { type: 'hook', hook: 'useCrossClusterPolicyComparison' },
  content: { type: 'custom' },
  emptyState: { icon: 'GitCompare', title: 'No Data', message: 'No Kyverno clusters detected', variant: 'info' },
  loadingState: { type: 'table', count: 4 },
  isDemoData: false,
  isLive: true,
}
export default crossClusterPolicyComparisonConfig
