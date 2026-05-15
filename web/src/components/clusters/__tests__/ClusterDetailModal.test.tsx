/**
 * ClusterDetailModal Component Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { ClusterHealth, ClusterInfo } from '../../../hooks/mcp/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) => {
      if (key === 'cluster.andMoreClusters') return `+${options?.count || 0} more`
      return key
    },
  }),
}))

const clusterInfo: ClusterInfo = {
  name: 'prod-cluster',
  server: 'https://prod.example.com:6443',
  healthy: true,
  aliases: ['team/prod/cluster-alias', 'shared/prod/cluster-backup'],
  namespaces: [],
}

const health: ClusterHealth = {
  cluster: 'prod-cluster',
  healthy: true,
  apiServer: 'https://prod.example.com:6443',
  nodeCount: 3,
  readyNodes: 3,
  podCount: 12,
}

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => ({ deduplicatedClusters: [clusterInfo], clusters: [clusterInfo] }),
  useClusterHealth: () => ({ health, isLoading: false, error: null }),
  usePodIssues: () => ({ issues: [] }),
  useDeploymentIssues: () => ({ issues: [] }),
  useGPUNodes: () => ({ nodes: [], isLoading: false, isRefreshing: false }),
  useNodes: () => ({ nodes: [], isLoading: false }),
  useNamespaceStats: () => ({ stats: [], isLoading: false }),
  useDeployments: () => ({ deployments: [] }),
}))

vi.mock('../utils', () => ({
  isClusterUnreachable: () => false,
  isClusterHealthy: () => true,
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToPod: vi.fn(), drillToDeployment: vi.fn() }),
}))

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: vi.fn() }),
}))

vi.mock('../../../lib/analytics', () => ({
  emitClusterAction: vi.fn(),
}))

vi.mock('../../../lib/modals', () => ({
  BaseModal: ({ children, isOpen }: { children: ReactNode; isOpen?: boolean }) => isOpen ? <div data-testid="base-modal">{children}</div> : null,
}))

vi.mock('../../charts/Gauge', () => ({
  Gauge: () => <div data-testid="gauge" />,
}))

vi.mock('../NodeListItem', () => ({
  NodeListItem: () => null,
}))

vi.mock('../NodeDetailPanel', () => ({
  NodeDetailPanel: () => null,
}))

vi.mock('../components', () => ({
  NamespaceResources: () => null,
}))

vi.mock('../ResourceDetailModals', () => ({
  CPUDetailModal: () => null,
  MemoryDetailModal: () => null,
  StorageDetailModal: () => null,
  GPUDetailModal: () => null,
}))

vi.mock('../../ui/CloudProviderIcon', () => ({
  CloudProviderIcon: () => <div data-testid="cloud-provider-icon" />,
  detectCloudProvider: () => 'kubernetes',
  getProviderLabel: () => 'Kubernetes',
  getConsoleUrl: () => null,
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../ui/Button', () => ({
  Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
}))

vi.mock('../ClusterStatusDetails', () => ({
  ClusterStatusDetails: () => <div data-testid="cluster-status-details" />,
}))

import { ClusterDetailModal } from '../ClusterDetailModal'

describe('ClusterDetailModal', () => {
  it('exports ClusterDetailModal component', () => {
    expect(ClusterDetailModal).toBeDefined()
    expect(typeof ClusterDetailModal).toBe('function')
  })

  it('shows the server address in the header', () => {
    render(<ClusterDetailModal clusterName="prod-cluster" onClose={vi.fn()} />)

    expect(screen.getByTestId('cluster-detail-server-address')).toHaveTextContent('https://prod.example.com:6443')
    expect(screen.getByText(/clusterDetail\.akaLabel/)).toBeInTheDocument()
  })
})
