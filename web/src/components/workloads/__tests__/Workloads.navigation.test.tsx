import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ROUTES } from '../../../config/routes'

const mockNavigate = vi.fn()
const mockSetShowImportDialog = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/' }),
  }
})

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../../../hooks/useMCP', () => ({
  useDeploymentIssues: () => ({ issues: [], isLoading: false, isRefreshing: false }),
  usePodIssues: () => ({ issues: [], isLoading: false, isRefreshing: false }),
  useClusters: () => ({ clusters: [], deduplicatedClusters: [], isLoading: false, isRefreshing: false }),
  useDeployments: () => ({ deployments: [], isLoading: false, isRefreshing: false }),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    globalSelectedClusters: [],
    isAllClustersSelected: true,
  }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToNamespace: vi.fn(),
    drillToAllNamespaces: vi.fn(),
    drillToAllDeployments: vi.fn(),
    drillToAllPods: vi.fn(),
    drillToDeployment: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ status: 'disconnected' }),
  wasAgentEverConnected: () => false,
}))

vi.mock('../../../hooks/useBackendHealth', () => ({
  isInClusterMode: () => false,
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
}))

vi.mock('../../../lib/unified/demo', () => ({
  useIsModeSwitching: () => false,
}))

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../../ui/RotatingTip', () => ({
  RotatingTip: () => null,
}))

vi.mock('../../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: ({ rightExtra, children }: { rightExtra: React.ReactNode; children: React.ReactNode }) => (
    <div>
      <div data-testid="dashboard-right-extra">{rightExtra}</div>
      <div data-testid="dashboard-children">{children}</div>
    </div>
  ),
}))

vi.mock('../../cards/WorkloadImportDialog', () => ({
  WorkloadImportDialog: () => null,
}))

vi.mock('../../../lib/modals', () => ({
  ConfirmDialog: () => null,
}))

import { Workloads } from '../Workloads'

describe('Workloads Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders "+ Add Workload" button with correct label', () => {
    render(<Workloads />)
    const addButton = screen.getByTestId('add-workload-btn')
    expect(addButton).toBeTruthy()
    expect(addButton.textContent).toContain('Add Workload')
  })

  it('clicking "+ Add Workload" button does NOT call navigate', () => {
    render(<Workloads />)
    const addButton = screen.getByTestId('add-workload-btn')
    fireEvent.click(addButton)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('clicking "+ Add Workload" button opens import dialog (not ROUTES.DEPLOY)', () => {
    const { container } = render(<Workloads />)
    const addButton = screen.getByTestId('add-workload-btn')
    fireEvent.click(addButton)
    // Should NOT navigate to ROUTES.DEPLOY
    expect(mockNavigate).not.toHaveBeenCalledWith(ROUTES.DEPLOY)
  })

  it('empty state "Create a Workload" button does NOT navigate to ROUTES.DEPLOY', () => {
    render(<Workloads />)
    // Empty state appears when no workloads exist
    const emptyStateButton = screen.queryByTestId('empty-state-deploy-workload-btn')
    if (emptyStateButton) {
      fireEvent.click(emptyStateButton)
      expect(mockNavigate).not.toHaveBeenCalledWith(ROUTES.DEPLOY)
    }
  })

  it('navigate is NOT called on component render', () => {
    render(<Workloads />)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('button label uses t() translation with fallback', () => {
    render(<Workloads />)
    const addButton = screen.getByTestId('add-workload-btn')
    // Translation key: workloads.addWorkload, fallback: 'Add Workload'
    expect(addButton.textContent).toContain('Add Workload')
  })
})
