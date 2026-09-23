import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DashboardModals } from './DashboardModals'

vi.mock('../../lib/safeLazy', () => ({
  safeLazy: (_importFn: () => Promise<unknown>, exportName: string) => {
    const Comp = (props: Record<string, unknown>) =>
      props.isOpen ? <div data-testid={`lazy-${exportName}`} /> : null
    return Comp
  },
}))

vi.mock('../widgets/WidgetExportModal', () => ({
  WidgetExportModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="widget-export-modal" /> : null),
}))

vi.mock('../deploy/DeployConfirmDialog', () => ({
  DeployConfirmDialog: ({ isOpen, workloadName }: { isOpen: boolean; workloadName: string }) =>
    isOpen ? <div data-testid="deploy-confirm-dialog">{workloadName}</div> : null,
}))

const baseProps = {
  addCardSearch: '',
  canRedo: false,
  canUndo: false,
  dashboard: null,
  handleAddCards: vi.fn(),
  handleApplyTemplate: vi.fn(),
  handleCardConfigured: vi.fn(),
  handleCloseConfigureCard: vi.fn(),
  handleCloseCustomizer: vi.fn(),
  handleCloseWidgetExport: vi.fn(),
  handleConfirmDeploy: vi.fn(),
  handleCreateCardFromAI: vi.fn(),
  handleExportDashboard: vi.fn(),
  handleSetPendingDeploy: vi.fn(),
  isAddCardModalOpen: false,
  isConfigureCardOpen: false,
  isCustomized: false,
  isWidgetExportOpen: false,
  localCards: [],
  pendingDeploy: null,
  redo: vi.fn(),
  reset: vi.fn(),
  selectedCard: null,
  studioInitialSection: undefined,
  studioWidgetCardType: undefined,
  undo: vi.fn(),
}

describe('DashboardModals Component', () => {
  it('exports DashboardModals component', () => {
    expect(DashboardModals).toBeDefined()
    expect(typeof DashboardModals).toBe('function')
  })

  it('does not render any modal content when all are closed', () => {
    render(<DashboardModals {...baseProps} />)

    expect(screen.queryByTestId('lazy-DashboardCustomizer')).not.toBeInTheDocument()
    expect(screen.queryByTestId('lazy-ConfigureCardModal')).not.toBeInTheDocument()
    expect(screen.queryByTestId('widget-export-modal')).not.toBeInTheDocument()
    expect(screen.queryByTestId('deploy-confirm-dialog')).not.toBeInTheDocument()
  })

  it('renders the customizer modal when isAddCardModalOpen is true', () => {
    render(<DashboardModals {...baseProps} isAddCardModalOpen />)

    expect(screen.getByTestId('lazy-DashboardCustomizer')).toBeVisible()
  })

  it('renders the configure card modal when isConfigureCardOpen is true', () => {
    render(<DashboardModals {...baseProps} isConfigureCardOpen />)

    expect(screen.getByTestId('lazy-ConfigureCardModal')).toBeVisible()
  })

  it('renders the widget export modal when isWidgetExportOpen is true', () => {
    render(<DashboardModals {...baseProps} isWidgetExportOpen />)

    expect(screen.getByTestId('widget-export-modal')).toBeVisible()
  })

  it('renders the deploy confirm dialog when pendingDeploy is set', () => {
    render(
      <DashboardModals
        {...baseProps}
        pendingDeploy={{
          workloadName: 'my-workload',
          namespace: 'default',
          sourceCluster: 'cluster-a',
          targetClusters: ['cluster-b'],
        }}
      />,
    )

    expect(screen.getByTestId('deploy-confirm-dialog')).toHaveTextContent('my-workload')
  })
})
