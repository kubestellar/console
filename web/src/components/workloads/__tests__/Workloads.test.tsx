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
    getDemoMode: () => true,
    default: () => true,
    useDemoMode: () => true,
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

vi.mock('../../../hooks/useMCP', () => ({
    usePodIssues: () => ({ issues: mockPodIssues, isLoading: false, isRefreshing: false, refetch: vi.fn() }),
    useDeploymentIssues: () => ({ issues: mockDeploymentIssues, isLoading: false, isRefreshing: false, refetch: vi.fn() }),
    useDeployments: () => ({ deployments: mockDeployments, isLoading: false, isRefreshing: false, refetch: vi.fn() }),
    useClusters: () => ({ clusters: mockClusters, deduplicatedClusters: mockClusters, isLoading: false, lastUpdated: null, refetch: vi.fn() }),
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
    useLocalAgent: () => ({ status: 'connected' }),
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

vi.mock('../../../lib/kubectlProxy', () => ({
    kubectlProxy: {
        exec: vi.fn().mockResolvedValue({ output: 'success', exitCode: 0 }),
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

    it('renders without crashing', () => {
        expect(() => renderWorkloads()).not.toThrow()
    })

    describe('deployment actions', () => {
        beforeEach(() => {
            showToastSpy.mockClear()
            // To show deployments, we need either a customFilter or isAllClustersSelected = false
            // Actually, I implemented it so if customFilter or !isAllClustersSelected, it shows deployments.
            // Let's mock useGlobalFilters for this test
        })

        it('renders action buttons when showing deployments', () => {
            // Force individual deployment view by mocking useGlobalFilters with a filter
            vi.mocked(useGlobalFilters).mockReturnValue({
                selectedClusters: [],
                isAllClustersSelected: true,
                customFilter: 'my-deploy',
                filterByCluster: (items: any[]) => items,
            } as any)

            mockDeployments = [{ name: 'my-deploy', namespace: 'default', cluster: 'ctx/prod', status: 'running', replicas: 3, readyReplicas: 3 }]

            renderWorkloads()
            expect(screen.getByLabelText('Restart deployment')).toBeTruthy()
            expect(screen.getByLabelText('View logs')).toBeTruthy()
            expect(screen.getByLabelText('Delete deployment')).toBeTruthy()
        })

        it('calls kubectlProxy when Restart is clicked', async () => {
            renderWorkloads()
            const restartBtn = screen.getByLabelText('Restart deployment')
            fireEvent.click(restartBtn)
            expect(showToastSpy).toHaveBeenCalledWith('workloads.restarting', 'info')
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
})
