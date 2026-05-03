/**
 * KubeVela Status Card Configuration
 *
 * KubeVela is a CNCF Incubating project that implements the Open Application
 * Model (OAM) on Kubernetes. This card surfaces Application CRs, workflow
 * step progress, component + trait counts, and controller pod readiness.
 *
 * The runtime card component lives at
 * `components/cards/kubevela_status/index.tsx` and drives its own layout;
 * this config exists so the card participates in the unified registry
 * (browse catalog, search, marketplace mapping).
 *
 * Source: kubestellar/console-marketplace#43
 */

import type { UnifiedCardConfig } from '../../lib/unified/types'

export const kubeVelaStatusConfig: UnifiedCardConfig = {
  type: 'kubevela_status',
  title: 'KubeVela',
  category: 'workloads',
  description:
    'KubeVela Application CRs: workflow step progress, component + trait counts, and vela-core controller health.',

  // Appearance
  icon: 'Layers',
  iconColor: 'text-cyan-400',
  defaultWidth: 6,
  defaultHeight: 4,

  // Data source — routes through the unified registry to useCachedKubevela,
  // which is wired up in lib/unified/registerHooks.ts.
  dataSource: {
    type: 'hook',
    hook: 'useCachedKubevela',
  },

  // Content — list visualization with Application rows.
  content: {
    type: 'list',
    pageSize: 8,
    columns: [
      { field: 'name', header: 'Application', primary: true, render: 'truncate' },
      { field: 'namespace', header: 'Namespace', width: 140, render: 'truncate' },
      { field: 'status', header: 'Status', width: 110, render: 'status-badge' },
      { field: 'componentCount', header: 'Comps', width: 80, align: 'right' },
      { field: 'traitCount', header: 'Traits', width: 80, align: 'right' },
      { field: 'cluster', header: 'Cluster', width: 120, render: 'cluster-badge' },
    ],
  },

  emptyState: {
    icon: 'Layers',
    title: 'KubeVela not detected',
    message:
      'No KubeVela controller pods found. Deploy KubeVela to manage OAM application delivery.',
    variant: 'info',
  },

  loadingState: {
    type: 'list',
    rows: 5,
  },

  // Scaffolding: renders live if /api/kubevela/status is wired up, otherwise
  // falls back to demo data via the useCache demo path.
  isDemoData: true,
  isLive: false,
}

export default kubeVelaStatusConfig
