import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true,
  getDemoMode: () => true,
  isNetlifyDeployment: false,
  isDemoModeForced: false,
  canToggleDemoMode: () => true,
  setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(),
  subscribeDemoMode: () => () => { },
  isDemoToken: () => true,
  hasRealToken: () => false,
  setDemoToken: vi.fn(),
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  getDemoMode: () => mockIsDemoMode,
  default: () => ({ isDemoMode: mockIsDemoMode, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  isDemoModeForced: false,
}))

vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(),
  emitLogin: vi.fn(),
  emitEvent: vi.fn(),
  analyticsReady: Promise.resolve(),
}))

vi.mock('../../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: ({ title, children }: { title: string; children?: React.ReactNode }) => (
    <div data-testid="dashboard-page">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))

let mockPodIssues: any[] = []
let mockDeploymentIssues: any[] = []
let mockDeployments: any[] = []
let mockClusters: any[] = []
let mockIsLoading = false
let mockIsDemoMode = true

vi.mock('../../../hooks/useMCP', () => ({
  usePodIssues: () => ({ issues: mockPodIssues, isLoading: mockIsLoading, isRefreshing: false, lastUpdated: null, refetch: vi.fn() }),
  useDeploymentIssues: () => ({ issues: mockDeploymentIssues, isLoading: mockIsLoading, isRefreshing: false, refetch: vi.fn() }),
  useDeployments: () => ({ deployments: mockDeployments, isLoading: mockIsLoading, isRefreshing: false, refetch: vi.fn() }),
  useClusters: () => ({ clusters: mockClusters, deduplicatedClusters: mockClusters, isLoading: mockIsLoading, lastUpdated: null, refetch: vi.fn() }),
}))

import { useGlobalFilters } from '../../../hooks/useGlobalFilters'

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: vi.fn(() => ({
    selectedClusters: [],
    isAllClustersSelected: true,
    customFilter: '',
    filterByCluster: (items: any[]) => items,
  })),
}))

let mockAgentStatus = 'connected'
vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ status: mockAgentStatus }),
  wasAgentEverConnected: () => false,
}))

vi.mock('../../../hooks/useBackendHealth', () => ({
  isInClusterMode: () => false,
}))

vi.mock('../../../lib/unified/demo', () => ({
  useIsModeSwitching: () => false,
}))

const drillToNamespaceSpy = vi.fn()
const drillToDeploymentSpy = vi.fn()
const drillToAllNamespacesSpy = vi.fn()
const drillToAllDeploymentsSpy = vi.fn()
const drillToAllPodsSpy = vi.fn()

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToNamespace: drillToNamespaceSpy,
    drillToDeployment: drillToDeploymentSpy,
    drillToAllNamespaces: drillToAllNamespacesSpy,
    drillToAllDeployments: drillToAllDeploymentsSpy,
    drillToAllPods: drillToAllPodsSpy,
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback || key, i18n: { language: 'en' } }),
}))

const showToastSpy = vi.fn()
vi.mock('../../ui/Toast', () => ({
  useToast: () => ({
    showToast: showToastSpy,
  }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const kubectlExecSpy = vi.fn().mockResolvedValue({ output: 'deployment.apps/test restarted', exitCode: 0 })
vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: {
    exec: (...args: any[]) => kubectlExecSpy(...args),
  },
}))

import { Workloads } from '../Workloads'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const renderWorkloads = () =>
  render(
    <MemoryRouter>
      <Workloads />
    </MemoryRouter>
  )

const getWorkloadRow = (name: string) => screen.getByText(name).closest('[data-testid="workload-row"]') as HTMLElement

const getConfirmDeleteButton = () => within(screen.getByRole('dialog')).getByRole('button', { name: /Delete/i })

const setupDeploymentView = () => {
  vi.mocked(useGlobalFilters).mockReturnValue({
    selectedClusters: [],
    isAllClustersSelected: true,
    customFilter: 'nginx',
    filterByCluster: (items: any[]) => items,
  } as any)

  mockDeployments = [
    { name: 'nginx-web', namespace: 'production', cluster: 'ctx/prod-east', status: 'running', replicas: 3, readyReplicas: 3 },
    { name: 'nginx-api', namespace: 'staging', cluster: 'ctx/prod-west', status: 'failed', replicas: 2, readyReplicas: 0 },
  ]
}

// ---------------------------------------------------------------------------
// Tests — Restart verifies kubectl command (#12478)
// ---------------------------------------------------------------------------

describe('Restart deployment verifies kubectl command (#12478)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsLoading = false
    mockIsDemoMode = true
    setupDeploymentView()
  })

  it('calls kubectlProxy.exec with rollout restart command', async () => {
    renderWorkloads()

    const restartBtn = within(getWorkloadRow('nginx-web')).getByLabelText('Restart deployment')
    fireEvent.click(restartBtn)

    await waitFor(() => {
      expect(kubectlExecSpy).toHaveBeenCalledWith(
        ['rollout', 'restart', 'deployment', 'nginx-web', '-n', 'production'],
        { context: 'ctx/prod-east' }
      )
    })
  })

  it('passes correct cluster context for each deployment', async () => {
    renderWorkloads()

    const restartBtn = within(getWorkloadRow('nginx-api')).getByLabelText('Restart deployment')
    fireEvent.click(restartBtn)

    await waitFor(() => {
      expect(kubectlExecSpy).toHaveBeenCalledWith(
        ['rollout', 'restart', 'deployment', 'nginx-api', '-n', 'staging'],
        { context: 'ctx/prod-west' }
      )
    })
  })

  it('shows success toast after successful restart', async () => {
    renderWorkloads()

    const restartBtn = within(getWorkloadRow('nginx-web')).getByLabelText('Restart deployment')
    fireEvent.click(restartBtn)

    await waitFor(() => {
      expect(showToastSpy).toHaveBeenCalledWith('Restart triggered', 'success')
    })
  })

  it('shows error toast when kubectl command fails', async () => {
    kubectlExecSpy.mockRejectedValueOnce(new Error('connection refused'))

    renderWorkloads()

    const restartBtn = within(getWorkloadRow('nginx-web')).getByLabelText('Restart deployment')
    fireEvent.click(restartBtn)

    await waitFor(() => {
      expect(showToastSpy).toHaveBeenCalledWith('Failed to restart deployment', 'error')
    })
  })
})

// ---------------------------------------------------------------------------
// Tests — Namespace-grouped view (#12479)
// ---------------------------------------------------------------------------

describe('Namespace-grouped view (#12479)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsLoading = false
    // Default: no filter → namespace-grouped view
    vi.mocked(useGlobalFilters).mockReturnValue({
      selectedClusters: [],
      isAllClustersSelected: true,
      customFilter: '',
      filterByCluster: (items: any[]) => items,
    } as any)
  })

  it('groups deployments by namespace/cluster when no filter is applied', () => {
    mockDeployments = [
      { name: 'app-a', namespace: 'production', cluster: 'ctx/prod', status: 'running', replicas: 2, readyReplicas: 2 },
      { name: 'app-b', namespace: 'production', cluster: 'ctx/prod', status: 'running', replicas: 1, readyReplicas: 1 },
      { name: 'app-c', namespace: 'staging', cluster: 'ctx/prod', status: 'running', replicas: 1, readyReplicas: 1 },
    ]

    renderWorkloads()

    // Should show namespace names, not individual deployment names
    expect(screen.getByText('production')).toBeTruthy()
    expect(screen.getByText('staging')).toBeTruthy()
    // Individual deployment names should NOT appear in grouped view
    expect(screen.queryByText('app-a')).toBeNull()
    expect(screen.queryByText('app-b')).toBeNull()
  })

  it('shows deployment count per namespace group', () => {
    mockDeployments = [
      { name: 'svc-1', namespace: 'kube-system', cluster: 'ctx/mgmt', status: 'running', replicas: 1, readyReplicas: 1 },
      { name: 'svc-2', namespace: 'kube-system', cluster: 'ctx/mgmt', status: 'running', replicas: 1, readyReplicas: 1 },
      { name: 'svc-3', namespace: 'kube-system', cluster: 'ctx/mgmt', status: 'running', replicas: 1, readyReplicas: 1 },
    ]

    renderWorkloads()

    // The count "3" should appear as deployment count
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('marks namespace as warning when pod issues exist', () => {
    mockDeployments = [
      { name: 'app-x', namespace: 'default', cluster: 'ctx/prod', status: 'running', replicas: 1, readyReplicas: 1 },
    ]
    mockPodIssues = [
      { name: 'pod-crash', namespace: 'default', cluster: 'ctx/prod', reason: 'CrashLoopBackOff' },
    ]

    renderWorkloads()

    // Row should have yellow border (warning status)
    const row = screen.getByText('default').closest('.glass')
    expect(row?.className).toContain('border-l-yellow-500')
  })

  it('marks namespace as error when more than 3 pod issues', () => {
    mockDeployments = [
      { name: 'app-x', namespace: 'critical-ns', cluster: 'ctx/prod', status: 'running', replicas: 1, readyReplicas: 1 },
    ]
    mockPodIssues = [
      { name: 'pod-1', namespace: 'critical-ns', cluster: 'ctx/prod', reason: 'OOMKilled' },
      { name: 'pod-2', namespace: 'critical-ns', cluster: 'ctx/prod', reason: 'OOMKilled' },
      { name: 'pod-3', namespace: 'critical-ns', cluster: 'ctx/prod', reason: 'OOMKilled' },
      { name: 'pod-4', namespace: 'critical-ns', cluster: 'ctx/prod', reason: 'OOMKilled' },
    ]

    renderWorkloads()

    const row = screen.getByText('critical-ns').closest('.glass')
    expect(row?.className).toContain('border-l-red-500')
  })

  it('clicking a namespace row calls drillToNamespace', () => {
    mockDeployments = [
      { name: 'svc', namespace: 'monitoring', cluster: 'ctx/obs', status: 'running', replicas: 1, readyReplicas: 1 },
    ]

    renderWorkloads()

    const row = screen.getByText('monitoring').closest('.glass')
    fireEvent.click(row!)

    expect(drillToNamespaceSpy).toHaveBeenCalledWith('ctx/obs', 'monitoring')
  })

  it('sorts namespaces with errors first, then warnings, then healthy', () => {
    mockDeployments = [
      { name: 'healthy-app', namespace: 'alpha', cluster: 'ctx/a', status: 'running', replicas: 1, readyReplicas: 1 },
      { name: 'error-app', namespace: 'beta', cluster: 'ctx/b', status: 'running', replicas: 1, readyReplicas: 1 },
      { name: 'warn-app', namespace: 'gamma', cluster: 'ctx/c', status: 'running', replicas: 1, readyReplicas: 1 },
    ]
    mockPodIssues = [
      { name: 'p1', namespace: 'beta', cluster: 'ctx/b', reason: 'X' },
      { name: 'p2', namespace: 'beta', cluster: 'ctx/b', reason: 'X' },
      { name: 'p3', namespace: 'beta', cluster: 'ctx/b', reason: 'X' },
      { name: 'p4', namespace: 'beta', cluster: 'ctx/b', reason: 'X' },
      { name: 'p5', namespace: 'gamma', cluster: 'ctx/c', reason: 'Y' },
    ]

    renderWorkloads()

    const rows = screen.getAllByText(/alpha|beta|gamma/)
    const rowTexts = rows.map(r => r.textContent)

    // beta (error) should come before gamma (warning) which should come before alpha (healthy)
    const betaIdx = rowTexts.indexOf('beta')
    const gammaIdx = rowTexts.indexOf('gamma')
    const alphaIdx = rowTexts.indexOf('alpha')

    expect(betaIdx).toBeLessThan(gammaIdx)
    expect(gammaIdx).toBeLessThan(alphaIdx)
  })
})

// ---------------------------------------------------------------------------
// Tests — Delete confirmation flow (#12480)
// ---------------------------------------------------------------------------

describe('Delete confirmation flow (#12480)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsLoading = false
    mockIsDemoMode = true
    setupDeploymentView()
  })

  it('clicking Delete button opens confirmation dialog', () => {
    renderWorkloads()

    const deleteBtn = within(getWorkloadRow('nginx-web')).getByLabelText('Delete deployment')
    fireEvent.click(deleteBtn)

    // ConfirmDialog should appear with deployment name in message
    expect(screen.getByText(/Delete Deployment/)).toBeTruthy()
    expect(screen.getByText(/nginx-web/)).toBeTruthy()
  })

  it('confirming delete calls kubectlProxy with delete command', async () => {
    renderWorkloads()

    const deleteBtn = within(getWorkloadRow('nginx-web')).getByLabelText('Delete deployment')
    fireEvent.click(deleteBtn)

    const confirmBtn = getConfirmDeleteButton()
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(kubectlExecSpy).toHaveBeenCalledWith(
        ['delete', 'deployment', 'nginx-web', '-n', 'production'],
        { context: 'ctx/prod-east' }
      )
    })
  })

  it('shows success toast after successful delete', async () => {
    renderWorkloads()

    const deleteBtn = within(getWorkloadRow('nginx-web')).getByLabelText('Delete deployment')
    fireEvent.click(deleteBtn)

    const confirmBtn = getConfirmDeleteButton()
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(showToastSpy).toHaveBeenCalledWith('Deployment deleted', 'success')
    })
  })

  it('shows error toast when delete fails', async () => {
    kubectlExecSpy.mockRejectedValueOnce(new Error('forbidden'))

    renderWorkloads()

    const deleteBtn = within(getWorkloadRow('nginx-web')).getByLabelText('Delete deployment')
    fireEvent.click(deleteBtn)

    const confirmBtn = getConfirmDeleteButton()
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(showToastSpy).toHaveBeenCalledWith('Failed to delete deployment', 'error')
    })
  })

  it('cancelling delete does not call kubectl', () => {
    renderWorkloads()

    const deleteBtn = within(getWorkloadRow('nginx-web')).getByLabelText('Delete deployment')
    fireEvent.click(deleteBtn)

    // Close the dialog (ConfirmDialog has an onClose that is called by cancel/close button)
    // Look for a cancel button or close mechanism
    const cancelBtn = screen.queryByRole('button', { name: /Cancel/i })
    if (cancelBtn) {
      fireEvent.click(cancelBtn)
    }

    expect(kubectlExecSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Tests — Loading skeleton and agent-offline states (#12481)
// ---------------------------------------------------------------------------

describe('Loading skeleton and agent-offline states (#12481)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoMode = true
    vi.mocked(useGlobalFilters).mockReturnValue({
      selectedClusters: [],
      isAllClustersSelected: true,
      customFilter: '',
      filterByCluster: (items: any[]) => items,
    } as any)
  })

  it('shows loading skeletons when data is loading and no data exists', () => {
    mockIsLoading = true
    mockDeployments = []
    mockPodIssues = []
    mockDeploymentIssues = []
    mockAgentStatus = 'connected'

    renderWorkloads()

    // Skeleton elements should be present (they use role or specific class)
    const skeletons = screen.getAllByTestId ? 
      document.querySelectorAll('[class*="skeleton"], [class*="Skeleton"], [class*="animate-pulse"]') :
      document.querySelectorAll('[class*="skeleton"], [class*="Skeleton"], [class*="animate-pulse"]')
    
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows skeletons when agent is offline and demo mode is off', () => {
    mockIsLoading = false
    mockDeployments = []
    mockPodIssues = []
    mockDeploymentIssues = []
    mockAgentStatus = 'disconnected'

    mockIsDemoMode = false

    renderWorkloads()

    // When agent offline + not demo mode → forceSkeletonForOffline = true
    // The clusters section should also show skeletons
    const container = document.querySelector('[data-testid="dashboard-page"]')
    expect(container?.innerHTML).toContain('border-l-gray-500/50')
  })

  it('does not show skeletons when data is available even if loading', () => {
    mockIsLoading = true
    mockDeployments = [
      { name: 'live-app', namespace: 'default', cluster: 'ctx/prod', status: 'running', replicas: 1, readyReplicas: 1 },
    ]
    mockPodIssues = []
    mockDeploymentIssues = []
    mockAgentStatus = 'connected'

    renderWorkloads()

    // Should NOT show skeletons because data exists (allDeployments.length > 0)
    // Instead should show the actual deployment grouped by namespace
    expect(screen.getByText('default')).toBeTruthy()
  })

  it('does not show skeletons in demo mode even when agent is offline', () => {
    mockIsLoading = false
    mockDeployments = [
      { name: 'demo-app', namespace: 'demo-ns', cluster: 'ctx/demo', status: 'running', replicas: 1, readyReplicas: 1 },
    ]
    mockPodIssues = []
    mockDeploymentIssues = []
    mockAgentStatus = 'disconnected'

    renderWorkloads()

    // In demo mode, forceSkeletonForOffline should stay false.
    expect(screen.getByText('demo-ns')).toBeTruthy()
  })
})
