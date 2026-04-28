/**
 * Flux Status Card Configuration
 */
import type { UnifiedCardConfig } from '../../lib/unified/types'

export const fluxStatusConfig: UnifiedCardConfig = {
  type: 'flux_status',
  title: 'Flux CD',
  category: 'gitops',
  description: 'Flux GitOps sources, kustomizations, and Helm release reconciliation status.',
  icon: 'GitBranch',
  iconColor: 'text-cyan-400',
  defaultWidth: 6,
  defaultHeight: 4,
  dataSource: { type: 'hook', hook: 'useFluxStatus' },
  content: {
    type: 'list',
    pageSize: 8,
    columns: [
      { field: 'kind', header: 'Kind', width: 110, render: 'text' },
      { field: 'name', header: 'Name', primary: true, render: 'truncate' },
      { field: 'namespace', header: 'Namespace', width: 120, render: 'namespace-badge' },
      { field: 'cluster', header: 'Cluster', width: 120, render: 'cluster-badge' },
      { field: 'ready', header: 'Ready', width: 80, render: 'status-badge' },
    ],
  },
  emptyState: {
    icon: 'GitBranch',
    title: 'Flux not detected',
    message: 'No Flux GitRepository, Kustomization, or HelmRelease resources found.',
    variant: 'info',
  },
  loadingState: {
    type: 'list',
    rows: 5,
  },
  isDemoData: false,
  isLive: true,
}

export default fluxStatusConfig
