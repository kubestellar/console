import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ClusterInfo, Deployment, DeploymentIssue, PodIssue } from '../../../hooks/mcp/types'

const mockUseGlobalFilters = vi.hoisted(() => vi.fn())

type MockGlobalFilters = {
    selectedClusters: string[]
    isAllClustersSelected: boolean
    customFilter: string
    filterByCluster: <T extends { cluster?: string }>(items: T[]) => T[]
}

const identityClusterFilter: MockGlobalFilters['filterByCluster'] = <T extends { cluster?: string }>(items: T[]) => items

function createGlobalFiltersMock(overrides: Partial<Omit<MockGlobalFilters, 'filterByCluster'>> = {}): MockGlobalFilters {
    return {
        selectedClusters: [],
        isAllClustersSelected: true,
        customFilter: '',
        filterByCluster: identityClusterFilter,
        ...overrides,
    }
}

function createCluster(overrides: Partial<ClusterInfo> = {}): ClusterInfo {
    return { name: 'demo-cluster', context: 'demo-cluster', ...overrides }
}

function createDeployment(overrides: Partial<Deployment> = {}): Deployment {
    return {
        name: 'demo-deploy',
        namespace: 'default',
        status: 'running',
        replicas: 1,
        readyReplicas: 1,
        updatedReplicas: 1,
        availableReplicas: 1,
        progress: 100,
        ...overrides,
    }
}

function createPodIssue(overrides: Partial<PodIssue> = {}): PodIssue {
    return { name: 'demo-pod', namespace: 'default', status: 'Running', issues: [], restarts: 0, ...overrides }
}

function createDeploymentIssue(overrides: Partial<DeploymentIssue> = {}): DeploymentIssue {
    return { name: 'demo-deploy', namespace: 'default', replicas: 1, readyReplicas: 1, ...overrides }
}

// Mock modules
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
    default: () => mockIsDemoMode,
    useDemoMode: () => ({ isDemoMode: mockIsDemoMode }),
    isDemoModeForced: false,
}))

vi.mock('../../../lib/analytics', () => ({
    emitNavigate: vi.fn(),
    emitLogin: vi.fn(),
    emitEvent: vi.fn(),
    analyticsReady: Promise.resolve(),
}))

vi.mock('../../../lib/dashboards/DashboardPage', () => ({
    DashboardPage: ({ title, rightExtra, children }: { title: string; rightExtra?: React.ReactNode; children?: React.ReactNode }) => (
        <div data-testid="dashboard-page">
            <h1>{title}</h1>
            {rightExtra}
            {children}
        </div>
    ),
}))

let mockPodIssues: PodIssue[] = []
let mockDeploymentIssues: DeploymentIssue[] = []
let mockDeployments: Deployment[] = []
let mockClusters: ClusterInfo[] = []
let mockIsLoading = false
let mockAgentStatus: 'connected' | 'disconnected' = 'connected'
let mockIsDemoMode = true

vi.mock('../../../hooks/useMCP', () => ({
    usePodIssues: () => ({ issues: mockPodIssues, isLoading: mockIsLoading, isRefreshing: false, lastUpdated: null, refetch: vi.fn() }),
    useDeploymentIssues: () => ({ issues: mockDeploymentIssues, isLoading: mockIsLoading, isRefreshing: false, lastUpdated: null, refetch: vi.fn() }),
    useDeployments: () => ({ deployments: mockDeployments, isLoading: mockIsLoading, isRefreshing: false, lastUpdated: null, refetch: vi.fn() }),
    useClusters: () => ({ clusters: mockClusters, deduplicatedClusters: mockClusters, isLoading: mockIsLoading, lastUpdated: null, refetch: vi.fn() }),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
    useGlobalFilters: () => mockUseGlobalFilters(),
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

const { drillToNamespaceSpy, drillToDeploymentSpy, showToastSpy, kubectlExecSpy } = vi.hoisted(() => ({
    drillToNamespaceSpy: vi.fn(),
    drillToDeploymentSpy: vi.fn(),
    showToastSpy: vi.fn(),
    kubectlExecSpy: vi.fn().mockResolvedValue({ output: 'success', exitCode: 0 }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
    useDrillDownActions: () => ({
        drillToNamespace: drillToNamespaceSpy,
        drillToDeployment: drillToDeploymentSpy,
        drillToAllNamespaces: vi.fn(),
        drillToAllDeployments: vi.fn(),
        drillToAllPods: vi.fn(),
    }),
}))

vi.mock('react-i18next', () => ({
    initReactI18next: { type: '3rdParty', init: () => {} },
    useTranslation: () => ({ t: (key: string, fallback?: string) => fallback || key, i18n: { language: 'en' } }),
}))

vi.mock('../../ui/RotatingTip', () => ({
    RotatingTip: () => null,
}))

vi.mock('../../cards/llmd/shared/PortalTooltip', () => ({
    PortalTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../../lib/modals', () => ({
    ConfirmDialog: ({
        isOpen,
        onClose,
        onConfirm,
        title,
        message,
        confirmLabel = 'Confirm',
        cancelLabel = 'Cancel',
    }: {
        isOpen: boolean
        onClose: () => void
        onConfirm: () => void
        title: string
        message: string
        confirmLabel?: string
        cancelLabel?: string
    }) => isOpen ? (
        <div role="dialog">
            <span>{title}</span>
            <span>{message}</span>
            <button onClick={onClose}>{cancelLabel}</button>
            <button onClick={onConfirm}>{confirmLabel}</button>
        </div>
    ) : null,
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

describe('Workloads Component', () => {
    const renderWorkloads = () =>
        render(
            <MemoryRouter>
                <Workloads />
            </MemoryRouter>
        )

    beforeEach(() => {
        // Reset all mocks to default state before each test
        mockPodIssues = []
        mockDeploymentIssues = []
        mockDeployments = []
        mockClusters = [createCluster()]
        mockIsLoading = false
        mockAgentStatus = 'connected'
        mockIsDemoMode = true
        showToastSpy.mockClear()
        kubectlExecSpy.mockClear()
        mockUseGlobalFilters.mockReturnValue(createGlobalFiltersMock())
    })

    it('renders without crashing', () => {
        expect(() => renderWorkloads()).not.toThrow()
    })

    describe('deployment actions', () => {
        beforeEach(() => {
            // Force individual deployment view by mocking useGlobalFilters with a filter
            mockUseGlobalFilters.mockReturnValue(createGlobalFiltersMock({ customFilter: 'my-deploy' }))

            mockDeployments = [createDeployment({ name: 'my-deploy', cluster: 'ctx/prod', replicas: 3, readyReplicas: 3, updatedReplicas: 3, availableReplicas: 3 })]
        })

        it('renders action buttons when showing deployments', () => {
            renderWorkloads()
            expect(screen.getByLabelText('Restart deployment')).toBeTruthy()
            expect(screen.getByLabelText('View logs')).toBeTruthy()
            expect(screen.getByLabelText('Delete deployment')).toBeTruthy()
        })

        it('calls kubectlProxy with correct args when Restart is clicked', async () => {
            renderWorkloads()
            const restartBtn = screen.getByLabelText('Restart deployment')
            fireEvent.click(restartBtn)
            
            expect(showToastSpy).toHaveBeenCalledWith('Restarting deployment...', 'info')
            expect(kubectlExecSpy).toHaveBeenCalledWith(
                ['rollout', 'restart', 'deployment', 'my-deploy', '-n', 'default'],
                { context: 'ctx/prod' }
            )
        })

        it('shows delete confirmation dialog when Delete is clicked', () => {
            renderWorkloads()
            const deleteBtn = screen.getByLabelText('Delete deployment')
            fireEvent.click(deleteBtn)
            
            expect(screen.getByText('Delete Deployment')).toBeTruthy()
            expect(screen.getByText(/my-deploy/)).toBeTruthy()
        })

        it('calls kubectlProxy with delete args when delete is confirmed', async () => {
            renderWorkloads()
            const deleteBtn = screen.getByLabelText('Delete deployment')
            fireEvent.click(deleteBtn)
            
            // Find and click the confirm button in the dialog
            const confirmBtn = screen.getByText('Delete')
            fireEvent.click(confirmBtn)
            
            expect(showToastSpy).toHaveBeenCalledWith('Deleting deployment...', 'info')
            expect(kubectlExecSpy).toHaveBeenCalledWith(
                ['delete', 'deployment', 'my-deploy', '-n', 'default'],
                { context: 'ctx/prod' }
            )
        })

        it('does not call kubectlProxy when delete is cancelled', () => {
            renderWorkloads()
            const deleteBtn = screen.getByLabelText('Delete deployment')
            fireEvent.click(deleteBtn)
            
            // Find and click the cancel/close button in the dialog
            const cancelBtn = screen.getByRole('button', { name: /close|cancel/i })
            fireEvent.click(cancelBtn)
            
            expect(kubectlExecSpy).not.toHaveBeenCalled()
        })
    })

    describe('add workload actions', () => {
        it('opens the import dialog from the header add button', () => {
            renderWorkloads()

            fireEvent.click(screen.getByTestId('add-workload-btn'))

            expect(screen.getByTestId('workload-import-dialog')).toBeTruthy()
        })

        it('opens the import dialog from the empty state button', () => {
            renderWorkloads()

            fireEvent.click(screen.getByTestId('empty-state-deploy-workload-btn'))

            expect(screen.getByTestId('workload-import-dialog')).toBeTruthy()
        })
    })

    describe('status color rendering', () => {
        beforeEach(() => {
            mockUseGlobalFilters.mockReturnValue(createGlobalFiltersMock({ customFilter: 'deploy' }))
        })

        it('uses red border for failed deployment', () => {
            mockDeployments = [createDeployment({ name: 'fail-deploy', cluster: 'ctx/prod', status: 'failed', replicas: 3, readyReplicas: 1, updatedReplicas: 2, availableReplicas: 1, progress: 33 })]
            renderWorkloads()
            const card = screen.getByText('fail-deploy').closest('.glass')
            expect(card?.className).toContain('border-l-red-500')
        })

        it('uses yellow border for deploying', () => {
            mockDeployments = [createDeployment({ name: 'prog-deploy', cluster: 'ctx/prod', status: 'deploying', replicas: 3, readyReplicas: 2, updatedReplicas: 2, availableReplicas: 2, progress: 67 })]
            renderWorkloads()
            const card = screen.getByText('prog-deploy').closest('.glass')
            expect(card?.className).toContain('border-l-yellow-500')
        })

        it('uses green border for healthy', () => {
            mockDeployments = [createDeployment({ name: 'ok-deploy', cluster: 'ctx/prod', replicas: 3, readyReplicas: 3, updatedReplicas: 3, availableReplicas: 3 })]
            renderWorkloads()
            const card = screen.getByText('ok-deploy').closest('.glass')
            expect(card?.className).toContain('border-l-green-500')
        })
    })

    describe('namespace-grouped view', () => {
        beforeEach(() => {
            // No custom filter and all clusters selected = namespace grouping
            mockUseGlobalFilters.mockReturnValue(createGlobalFiltersMock())
        })

        it('renders namespace cards when no filter is active', () => {
            mockDeployments = [
                createDeployment({ name: 'web-frontend', namespace: 'production', cluster: 'ctx/prod', replicas: 3, readyReplicas: 3, updatedReplicas: 3, availableReplicas: 3 }),
                createDeployment({ name: 'api-backend', namespace: 'production', cluster: 'ctx/prod', replicas: 2, readyReplicas: 2, updatedReplicas: 2, availableReplicas: 2 }),
            ]
            
            renderWorkloads()
            
            // Should show namespace card, not individual deployments
            expect(screen.getByText('production')).toBeTruthy()
            expect(screen.queryByText('web-frontend')).toBeFalsy()
            expect(screen.queryByText('api-backend')).toBeFalsy()
        })

        it('shows deployment count in namespace card', () => {
            mockDeployments = [
                createDeployment({ name: 'svc1', namespace: 'dev', cluster: 'ctx/dev' }),
                createDeployment({ name: 'svc2', namespace: 'dev', cluster: 'ctx/dev' }),
                createDeployment({ name: 'svc3', namespace: 'dev', cluster: 'ctx/dev' }),
            ]
            
            renderWorkloads()
            
            // Namespace card should show deployment count
            const namespaceCard = screen.getByRole('heading', { name: 'dev' }).closest('.glass')
            expect(namespaceCard?.textContent).toContain('3')
            expect(namespaceCard?.textContent).toMatch(/common\.deployments/i)
        })

        it('shows pod issues in namespace card', () => {
            mockDeployments = [createDeployment({ name: 'app', namespace: 'staging', cluster: 'ctx/staging', replicas: 2, readyReplicas: 2, updatedReplicas: 2, availableReplicas: 2 })]
            mockPodIssues = [
                createPodIssue({ name: 'pod-1', namespace: 'staging', cluster: 'ctx/staging', reason: 'CrashLoopBackOff' }),
                createPodIssue({ name: 'pod-2', namespace: 'staging', cluster: 'ctx/staging', reason: 'ImagePullBackOff' }),
            ]
            
            renderWorkloads()
            
            const namespaceCard = screen.getByRole('heading', { name: 'staging' }).closest('.glass')
            expect(namespaceCard?.textContent).toContain('2')
        })

        it('shows deployment issues in namespace card', () => {
            mockDeployments = [createDeployment({ name: 'app', namespace: 'qa', cluster: 'ctx/qa' })]
            mockDeploymentIssues = [
                createDeploymentIssue({ name: 'broken-deploy', namespace: 'qa', cluster: 'ctx/qa', reason: 'ProgressDeadlineExceeded' }),
            ]
            
            renderWorkloads()
            
            const namespaceCard = screen.getByRole('heading', { name: 'qa' }).closest('.glass')
            expect(namespaceCard?.textContent).toContain('1')
        })
    })

    describe('loading and offline states', () => {
        it('shows loading skeleton when data is loading', () => {
            // Set loading state
            mockIsLoading = true
            
            renderWorkloads()
            
            // Should show skeleton elements
            const dashboardPage = screen.getByTestId('dashboard-page')
            expect(dashboardPage.innerHTML).toContain('animate-pulse')
        })

        it('shows skeleton when agent is offline in non-demo mode', () => {
            // Set agent offline and non-demo mode
            mockAgentStatus = 'disconnected'
            mockIsDemoMode = false
            
            renderWorkloads()
            
            // Should show skeletons when agent is offline and not in demo mode
            const dashboardPage = screen.getByTestId('dashboard-page')
            expect(dashboardPage.innerHTML).toContain('animate-pulse')
        })
    })
})
