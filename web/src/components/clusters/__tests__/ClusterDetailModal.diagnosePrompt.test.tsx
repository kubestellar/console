/**
 * Tests for diagnose/repair prompt builder — deployment replica counts
 * Ensures replica values are never "undefined" in AI prompts (fixes #15899)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { ClusterHealth, ClusterInfo, DeploymentIssue } from '../../../hooks/mcp/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) => {
      if (key === 'cluster.andMoreClusters') return `+${options?.count || 0} more`
      return key
    },
  }),
}))

const clusterInfo: ClusterInfo = {
  name: 'test-cluster',
  server: 'https://test.example.com:6443',
  healthy: true,
  aliases: [],
  namespaces: [],
}

const health: ClusterHealth = {
  cluster: 'test-cluster',
  healthy: true,
  apiServer: 'https://test.example.com:6443',
  nodeCount: 2,
  readyNodes: 2,
  podCount: 8,
  cpuCores: 4,
  memoryGB: 8,
}

const mockStartMission = vi.fn()
let mockDeploymentIssues: DeploymentIssue[] = []

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => ({ deduplicatedClusters: [clusterInfo], clusters: [clusterInfo] }),
  useClusterHealth: () => ({ health, isLoading: false, error: null }),
  usePodIssues: () => ({ issues: [] }),
  useDeploymentIssues: () => ({ issues: mockDeploymentIssues }),
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
  useMissions: () => ({ startMission: mockStartMission }),
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

/**
 * Helper: triggers diagnose action and returns the prompt passed to startMission
 */
function getDiagnosePrompt(): string {
  render(<ClusterDetailModal clusterName="test-cluster" onClose={vi.fn()} />)
  fireEvent.click(screen.getByText('clusterDetail.diagnose'))
  const call = mockStartMission.mock.calls[0]?.[0]
  return call?.initialPrompt ?? ''
}

/**
 * Helper: triggers repair action and returns the prompt passed to startMission
 */
function getRepairPrompt(): string {
  render(<ClusterDetailModal clusterName="test-cluster" onClose={vi.fn()} />)
  fireEvent.click(screen.getByText('clusterDetail.repair'))
  const call = mockStartMission.mock.calls[0]?.[0]
  return call?.initialPrompt ?? ''
}

describe('Diagnose prompt — deployment replica counts', () => {
  beforeEach(() => {
    mockStartMission.mockClear()
    mockDeploymentIssues = []
  })

  it('renders normal replica counts correctly in diagnose prompt', () => {
    mockDeploymentIssues = [{
      name: 'nginx',
      namespace: 'default',
      cluster: 'test-cluster',
      replicas: 3,
      readyReplicas: 1,
    }]

    const prompt = getDiagnosePrompt()
    expect(prompt).toContain('1/3 ready')
    expect(prompt).not.toContain('undefined')
  })

  it('renders normal replica counts correctly in repair prompt', () => {
    mockDeploymentIssues = [{
      name: 'nginx',
      namespace: 'default',
      cluster: 'test-cluster',
      replicas: 3,
      readyReplicas: 1,
      reason: 'CrashLoopBackOff',
    }]

    const prompt = getRepairPrompt()
    expect(prompt).toContain('1/3 ready')
    expect(prompt).not.toContain('undefined')
  })

  it('never shows "undefined/undefined" when replicas are undefined', () => {
    // Simulate runtime case where data hasn't loaded — types say number but runtime is undefined
    mockDeploymentIssues = [{
      name: 'api-server',
      namespace: 'production',
      cluster: 'test-cluster',
      replicas: undefined as unknown as number,
      readyReplicas: undefined as unknown as number,
    }]

    const prompt = getDiagnosePrompt()
    expect(prompt).not.toContain('undefined')
    expect(prompt).toContain('0/0 ready')
  })

  it('never shows "undefined" when only readyReplicas is undefined', () => {
    mockDeploymentIssues = [{
      name: 'worker',
      namespace: 'jobs',
      cluster: 'test-cluster',
      replicas: 5,
      readyReplicas: undefined as unknown as number,
    }]

    const prompt = getDiagnosePrompt()
    expect(prompt).not.toContain('undefined')
    expect(prompt).toContain('0/5 ready')
  })

  it('never shows "undefined" when only replicas is undefined', () => {
    mockDeploymentIssues = [{
      name: 'worker',
      namespace: 'jobs',
      cluster: 'test-cluster',
      replicas: undefined as unknown as number,
      readyReplicas: 2,
    }]

    const prompt = getDiagnosePrompt()
    expect(prompt).not.toContain('undefined')
    expect(prompt).toContain('2/0 ready')
  })

  it('never shows "null/null" when replicas are null', () => {
    mockDeploymentIssues = [{
      name: 'cache',
      namespace: 'infra',
      cluster: 'test-cluster',
      replicas: null as unknown as number,
      readyReplicas: null as unknown as number,
    }]

    const prompt = getDiagnosePrompt()
    expect(prompt).not.toContain('null')
    expect(prompt).toContain('0/0 ready')
  })

  it('handles zero replicas correctly (healthy zero state)', () => {
    mockDeploymentIssues = [{
      name: 'scaled-down',
      namespace: 'staging',
      cluster: 'test-cluster',
      replicas: 0,
      readyReplicas: 0,
    }]

    const prompt = getDiagnosePrompt()
    expect(prompt).toContain('0/0 ready')
    expect(prompt).not.toContain('undefined')
  })

  it('handles large replica counts', () => {
    mockDeploymentIssues = [{
      name: 'web-frontend',
      namespace: 'production',
      cluster: 'test-cluster',
      replicas: 100,
      readyReplicas: 100,
    }]

    const prompt = getDiagnosePrompt()
    expect(prompt).toContain('100/100 ready')
  })

  it('handles empty deployment issues array without crashing', () => {
    mockDeploymentIssues = []

    const prompt = getDiagnosePrompt()
    expect(prompt).toContain('No known issues')
    expect(prompt).not.toContain('undefined')
  })

  it('repair prompt guards against undefined replicas', () => {
    mockDeploymentIssues = [{
      name: 'broken-deploy',
      namespace: 'default',
      cluster: 'test-cluster',
      replicas: undefined as unknown as number,
      readyReplicas: undefined as unknown as number,
      reason: 'ImagePullBackOff',
    }]

    const prompt = getRepairPrompt()
    expect(prompt).not.toContain('undefined/undefined')
    expect(prompt).toContain('0/0 ready')
    expect(prompt).toContain('ImagePullBackOff')
  })
})
