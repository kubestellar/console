import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

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
let mockAgentStatus: 'connected' | 'disconnected' = 'connected'
let mockIsDemoMode = true

vi.mock('../../../hooks/useMCP', () => ({
    usePodIssues: () => ({ issues: mockPodIssues, isLoading: mockIsLoading, isRefreshing: false, refetch: vi.fn() }),
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

vi.mock('../../../hooks/useLocalAgent', () => ({
    useLocalAgent: () => ({ status: mockAgentStatus }),
}))

vi.mock('../../../hooks/useBackendHealth', () => ({
    isInClusterMode: () => false,
}))

vi.mock('../../../lib/unified/demo', () => ({
    useIsModeSwitching: () => false,
}))

const drillToNamespaceSpy = vi.fn()
const drillToDeploymentSpy = vi.fn()

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
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

const showToastSpy = vi.fn()
vi.mock('../../ui/Toast', () => ({
    useToast: () => ({
        showToast: showToastSpy,
    }),
    ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const kubectlExecSpy = vi.fn().mockResolvedValue({ output: 'success', exitCode: 0 })
vi.mock('../../../lib/kubectlProxy', () => ({
    kubectlProxy: {
        exec: kubectlExecSpy,
    },
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
            filterByCluster: (items: any[]) => items,
        } as any)
    })

    it('renders without crashing', () => {
        expect(() => renderWorkloads()).not.toThrow()
    })

    describe('deployment actions', () => {
        beforeEach(() => {
            // Force individual deployment view by mocking useGlobalFilters with a filter
            vi.mocked(useGlobalFilters).mockReturnValue({
                selectedClusters: [],
                isAllClustersSelected: true,
                customFilter: 'my-deploy',
                filterByCluster: (items: any[]) => items,
            } as any)

            mockDeployments = [{ name: 'my-deploy', namespace: 'default', cluster: 'ctx/prod', status: 'running', replicas: 3, readyReplicas: 3 }]
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
            
            expect(showToastSpy).toHaveBeenCalledWith('workloads.restarting', 'info')
            expect(kubectlExecSpy).toHaveBeenCalledWith(
                ['rollout', 'restart', 'deployment', 'my-deploy', '-n', 'default'],
                { context: 'ctx/prod' }
            )
        })

        it('shows delete confirmation dialog when Delete is clicked', () => {
            renderWorkloads()
            const deleteBtn = screen.getByLabelText('Delete deployment')
            fireEvent.click(deleteBtn)
            
            expect(screen.getByText('workloads.deleteDeployment')).toBeTruthy()
            expect(screen.getByText(/workloads.confirmDelete/)).toBeTruthy()
        })

        it('calls kubectlProxy with delete args when delete is confirmed', async () => {
            renderWorkloads()
            const deleteBtn = screen.getByLabelText('Delete deployment')
            fireEvent.click(deleteBtn)
            
            // Find and click the confirm button in the dialog
            const confirmBtn = screen.getByText('common:actions.delete')
            fireEvent.click(confirmBtn)
            
            expect(showToastSpy).toHaveBeenCalledWith('workloads.deleting', 'info')
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

    describe('status color rendering', () => {
        beforeEach(() => {
            vi.mocked(useGlobalFilters).mockReturnValue({
                selectedClusters: [],
                isAllClustersSelected: true,
                customFilter: 'deploy',
                filterByCluster: (items: any[]) => items,
            } as any)
        })

        it('uses red border for failed deployment', () => {
            mockDeployments = [{ name: 'fail-deploy', namespace: 'default', cluster: 'ctx/prod', status: 'failed', replicas: 3, readyReplicas: 1 }]
            renderWorkloads()
            const card = screen.getByText('fail-deploy').closest('.glass')
            expect(card?.className).toContain('border-l-red-500')
        })

        it('uses yellow border for deploying', () => {
            mockDeployments = [{ name: 'prog-deploy', namespace: 'default', cluster: 'ctx/prod', status: 'deploying', replicas: 3, readyReplicas: 2 }]
            renderWorkloads()
            const card = screen.getByText('prog-deploy').closest('.glass')
            expect(card?.className).toContain('border-l-yellow-500')
        })

        it('uses green border for healthy', () => {
            mockDeployments = [{ name: 'ok-deploy', namespace: 'default', cluster: 'ctx/prod', status: 'running', replicas: 3, readyReplicas: 3 }]
            renderWorkloads()
            const card = screen.getByText('ok-deploy').closest('.glass')
            expect(card?.className).toContain('border-l-green-500')
        })
    })

    describe('namespace-grouped view', () => {
        beforeEach(() => {
            // No custom filter and all clusters selected = namespace grouping
            vi.mocked(useGlobalFilters).mockReturnValue({
                selectedClusters: [],
                isAllClustersSelected: true,
                customFilter: '',
                filterByCluster: (items: any[]) => items,
            } as any)
        })

        it('renders namespace cards when no filter is active', () => {
            mockDeployments = [
                { name: 'web-frontend', namespace: 'production', cluster: 'ctx/prod', status: 'running', replicas: 3, readyReplicas: 3 },
                { name: 'api-backend', namespace: 'production', cluster: 'ctx/prod', status: 'running', replicas: 2, readyReplicas: 2 },
            ]
            
            renderWorkloads()
            
            // Should show namespace card, not individual deployments
            expect(screen.getByText('production')).toBeTruthy()
            expect(screen.queryByText('web-frontend')).toBeFalsy()
            expect(screen.queryByText('api-backend')).toBeFalsy()
        })

        it('shows deployment count in namespace card', () => {
            mockDeployments = [
                { name: 'svc1', namespace: 'dev', cluster: 'ctx/dev', status: 'running', replicas: 1, readyReplicas: 1 },
                { name: 'svc2', namespace: 'dev', cluster: 'ctx/dev', status: 'running', replicas: 1, readyReplicas: 1 },
                { name: 'svc3', namespace: 'dev', cluster: 'ctx/dev', status: 'running', replicas: 1, readyReplicas: 1 },
            ]
            
            renderWorkloads()
            
            // Namespace card should show deployment count
            const namespaceCard = screen.getByText('dev').closest('.glass')
            expect(namespaceCard?.textContent).toContain('3')
            expect(namespaceCard?.textContent).toMatch(/common\.deployments/i)
        })

        it('shows pod issues in namespace card', () => {
            mockDeployments = [{ name: 'app', namespace: 'staging', cluster: 'ctx/staging', status: 'running', replicas: 2, readyReplicas: 2 }]
            mockPodIssues = [
                { name: 'pod-1', namespace: 'staging', cluster: 'ctx/staging', reason: 'CrashLoopBackOff' },
                { name: 'pod-2', namespace: 'staging', cluster: 'ctx/staging', reason: 'ImagePullBackOff' },
            ]
            
            renderWorkloads()
            
            const namespaceCard = screen.getByText('staging').closest('.glass')
            expect(namespaceCard?.textContent).toContain('2')
        })

        it('shows deployment issues in namespace card', () => {
            mockDeployments = [{ name: 'app', namespace: 'qa', cluster: 'ctx/qa', status: 'running', replicas: 1, readyReplicas: 1 }]
            mockDeploymentIssues = [
                { name: 'broken-deploy', namespace: 'qa', cluster: 'ctx/qa', reason: 'ProgressDeadlineExceeded' },
            ]
            
            renderWorkloads()
            
            const namespaceCard = screen.getByText('qa').closest('.glass')
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
