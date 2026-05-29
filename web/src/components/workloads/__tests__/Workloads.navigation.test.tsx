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
    useDemoMode: () => ({ isDemoMode: true }),
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

vi.mock('../../../hooks/useMCP', () => ({
    usePodIssues: () => ({ issues: [], isLoading: false, isRefreshing: false, lastUpdated: null, refetch: vi.fn() }),
    useDeploymentIssues: () => ({ issues: [], isLoading: false, isRefreshing: false, lastUpdated: null, refetch: vi.fn() }),
    useDeployments: () => ({ deployments: [], isLoading: false, isRefreshing: false, lastUpdated: null, refetch: vi.fn() }),
    useClusters: () => ({ clusters: [], deduplicatedClusters: [], isLoading: false, lastUpdated: null, refetch: vi.fn() }),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
    useGlobalFilters: () => ({
        selectedClusters: [],
        isAllClustersSelected: true,
        customFilter: '',
        filterByCluster: (items: any[]) => items,
    }),
}))

vi.mock('../../../hooks/useLocalAgent', () => ({
    useLocalAgent: () => ({ status: 'connected' }),
    wasAgentEverConnected: () => false,
}))

vi.mock('../../../hooks/useBackendHealth', () => ({
    isInClusterMode: () => false,
}))

vi.mock('../../../lib/unified/demo', () => ({
    useIsModeSwitching: () => false,
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
    useTranslation: () => ({ t: (key: string, fallback?: string) => fallback || key, i18n: { language: 'en' } }),
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
    useToast: () => ({ showToast: vi.fn() }),
    ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../../lib/kubectlProxy', () => ({
    kubectlProxy: { exec: vi.fn() },
}))

vi.mock('../../cards/WorkloadImportDialog', () => ({
    WorkloadImportDialog: ({ isOpen }: { isOpen: boolean }) => (
        isOpen ? <div data-testid="workload-import-dialog">workload-import-dialog</div> : null
    ),
}))

import { Workloads } from '../Workloads'

describe('Workloads navigation - Add Workload button', () => {
    const renderWorkloads = () =>
        render(
            <MemoryRouter>
                <Workloads />
            </MemoryRouter>
        )

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('opens the import dialog when "+ Add Workload" button is clicked', () => {
        renderWorkloads()

        const addBtn = screen.getByTestId('add-workload-btn')
        expect(addBtn).toBeTruthy()

        // Before click — dialog should not be visible
        expect(screen.queryByTestId('workload-import-dialog')).toBeNull()

        fireEvent.click(addBtn)

        // After click — dialog should be visible (not navigation)
        expect(screen.getByTestId('workload-import-dialog')).toBeTruthy()
    })

    it('does not navigate away from the workloads page on button click', () => {
        const { container } = renderWorkloads()

        fireEvent.click(screen.getByTestId('add-workload-btn'))

        // The dashboard-page wrapper should still be rendered
        expect(screen.getByTestId('dashboard-page')).toBeTruthy()
        // The import dialog should appear in place
        expect(screen.getByTestId('workload-import-dialog')).toBeTruthy()
    })

    it('renders the button with the correct label', () => {
        renderWorkloads()

        const addBtn = screen.getByTestId('add-workload-btn')
        expect(addBtn.textContent).toContain('Add Workload')
    })
})
