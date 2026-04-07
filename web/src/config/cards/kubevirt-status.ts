/**
 * KubeVirt Status Card Configuration
 *
 * Displays KubeVirt operator health, VM count by state (running, stopped,
 * paused, migrating, error), per-cluster breakdown, and VM details including
 * CPU/memory allocation and creation time.
 *
 * Data source: Multi-tenancy KubeVirt hook detecting virt-operator and
 * virt-launcher pods across clusters. Falls back to demo data when KubeVirt
 * is not installed or in demo mode.
 *
 * KubeVirt resources queried (via pod detection):
 * - virtualmachines.kubevirt.io (VMs — detected via virt-launcher pods)
 * - virtualmachineinstances.kubevirt.io (running VM instances)
 *
 * TODO: Add direct CRD querying via kc-agent for richer VM metadata
 * (CPU/memory from VMI spec, live migration status, node affinity).
 */

import type { UnifiedCardConfig } from '../../lib/unified/types'

export const kubevirtStatusConfig: UnifiedCardConfig = {
  type: 'kubevirt_status',
  title: 'KubeVirt Status',
  category: 'operators',
  description: 'Virtual machine status across clusters — running, stopped, paused, and error states with per-cluster breakdown',

  // Appearance
  icon: 'Monitor',
  iconColor: 'text-orange-400',
  defaultWidth: 6,
  defaultHeight: 4,

  // Data source — uses custom hook (not unified data layer)
  dataSource: {
    type: 'hook',
    hook: 'useKubevirtStatus',
  },

  // Content — custom component renders its own layout
  content: {
    type: 'custom',
    component: 'KubevirtStatus',
  },

  // Empty state when KubeVirt is not installed
  emptyState: {
    icon: 'Monitor',
    title: 'KubeVirt not detected',
    message: 'No KubeVirt operator found. Install KubeVirt to run VMs as pods for data-plane tenant isolation.',
    variant: 'info',
  },

  // Loading state
  loadingState: {
    type: 'status',
    rows: 3,
    showSearch: false,
  },

  // Metadata
  isDemoData: false,
  isLive: true,
}

export default kubevirtStatusConfig
