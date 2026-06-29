import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockNavigate = vi.fn()
const tSpy = vi.fn((key: string, fallback?: string) => fallback || key)

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

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

interface MockPodIssue {
  name: string
  namespace: string
  cluster: string
  reason: string
}

interface MockDeploymentIssue {
  name: string
  namespace: string
  cluster: string
  reason: string
}

interface MockDeployment {
  name: string
  namespace: string
  cluster: string
  status: string
  replicas: number
  readyReplicas: number
}

interface MockCluster {
  name: string
  [key: string]: unknown
}

let mockPodIssues: MockPodIssue[] = []
let mockDeploymentIssues: MockDeploymentIssue[] = []
let mockDeployments: MockDeployment[] = []
let mockClusters: MockCluster[] = []
let mockIsLoading = false
let mockAgentStatus: 'connected' | 'disconnected' = 'connected'
let mockIsDemoMode = true

vi.mock('../../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useDemoMode')>()),
  getDemoMode: () => mockIsDemoMode,
  default: () => mockIsDemoMode,
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode }),
  isDemoModeForced: false,
}))

vi.mock('../../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/analytics')>()),
  emitNavigate: vi.fn(),
  emitLogin: vi.fn(),
  emitEvent: vi.fn(),
  analyticsReady: Promise.resolve(),
}
))

vi.mock('../../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: ({ title, rightExtra, children }: { title: string; rightExtra?: React.ReactNode; children?: React.ReactNode }) => (
    <div data-testid="dashboard-page">
      <h1>{title}</h1>
      {rightExtra}
      {children}
    </div>
  ),
}))

vi.mock('../../../hooks/useMCP', () => ({
  usePodIssues: () => ({ issues: mockPodIssues, isLoading: mockIsLoading, isRefreshing: false, lastUpdated: null, refetch: vi.fn() }),
  useDeploymentIssues: () => ({ issues: mockDeploymentIssues, isLoading: mockIsLoading, isRefreshing: false, lastUpdated: null, refetch: vi.fn() }),
  useDeployments: () => ({ deployments: mockDeployments, isLoading: mockIsLoading, isRefreshing: false, lastUpdated: null, refetch: vi.fn() }),
  useClusters: () => ({ clusters: mockClusters, deduplicatedClusters: mockClusters, isLoading: mockIsLoading, lastUpdated: null, refetch: vi.fn() }),
}))

import { useGlobalFilters } from '../../../hooks/useGlobalFilters'

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: vi.fn(() => ({
    selectedClusters: [],
    isAllClustersSelected: true,
    customFilter: '',
    filterByCluster: <T,>(items: T[]) => items,
  })),
}))

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

const { showToastSpy, kubectlExecSpy } = vi.hoisted(() => ({
  showToastSpy: vi.fn(),
  kubectlExecSpy: vi.fn().mockResolvedValue({ output: 'success', exitCode: 0 }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToNamespace: vi.fn(),
    drillToDeployment: vi.fn(),
    drillToAllNamespaces: vi.fn(),
    drillToAllDeployments: vi.fn(),
    drillToAllPods: vi.fn(),
  }),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: tSpy, i18n: { language: 'en' } }),
}))

vi.mock('../../ui/RotatingTip', () => ({
  RotatingTip: () => null,
}))

vi.mock('../../cards/llmd/shared/PortalTooltip', () => ({
  PortalTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../../lib/modals', () => ({
  ConfirmDialog: () => null,
}))

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({
    showToast: showToastSpy,
  }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: {
    exec: kubectlExecSpy,
  },
}))

vi.mock('../../cards/WorkloadImportDialog', () => ({
  WorkloadImportDialog: ({ isOpen }: { isOpen: boolean }) => (
    isOpen ? <div data-testid="workload-import-dialog">workload-import-dialog</div> : null
  ),
}))

import { Workloads } from '../Workloads'

describe('Workloads Add Workload button', () => {
  const renderWorkloads = () =>
    render(
      <MemoryRouter>
        <Workloads />
      </MemoryRouter>
    )

  beforeEach(() => {
    mockNavigate.mockClear()
    tSpy.mockClear()
    mockPodIssues = []
    mockDeploymentIssues = []
    mockDeployments = []
    mockClusters = []
    mockIsLoading = false
    mockAgentStatus = 'connected'
    mockIsDemoMode = true
    showToastSpy.mockClear()
    kubectlExecSpy.mockClear()
    vi.mocked(useGlobalFilters).mockReturnValue({
      selectedClusters: [],
      isAllClustersSelected: true,
      customFilter: '',
      filterByCluster: <T,>(items: T[]) => items,
    })
  })

  it('renders the add workload button using the translated label', () => {
    renderWorkloads()

    const addButton = screen.getByRole('button', { name: 'Add Workload' })

    expect(addButton).toBeTruthy()
    expect(screen.getByTestId('add-workload-btn').textContent).toContain('Add Workload')
    expect(tSpy).toHaveBeenCalledWith('workloads.addWorkload', 'Add Workload')
  })

  it('does not call navigate on render', () => {
    renderWorkloads()

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows the import dialog when the add workload button is clicked', () => {
    renderWorkloads()

    expect(screen.queryByTestId('workload-import-dialog')).toBeNull()

    fireEvent.click(screen.getByTestId('add-workload-btn'))

    expect(screen.getByTestId('workload-import-dialog')).toBeTruthy()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
