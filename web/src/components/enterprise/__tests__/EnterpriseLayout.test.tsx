import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDashboardContext = {
  openAddCardModal: vi.fn(),
  closeAddCardModal: vi.fn(),
  isAddCardModalOpen: true,
  studioInitialSection: 'dashboards',
  studioWidgetCardType: null,
}

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    Outlet: () => <div>Outlet Content</div>,
    useLocation: () => ({ pathname: '/enterprise/oidc' }),
  }
})
vi.mock('../../../lib/safeLazy', () => ({
  safeLazy: () => () => <div data-testid="lazy-panel" />,
}))
vi.mock('../../../hooks/useVersionCheck', () => ({
  VersionCheckProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('../../../hooks/useSidebarConfig', () => ({
  useSidebarConfig: () => ({ config: { collapsed: false } }),
  SIDEBAR_COLLAPSED_WIDTH_PX: 72,
  SIDEBAR_DEFAULT_WIDTH_PX: 280,
}))
vi.mock('../../../hooks/useMobile', () => ({
  useMobile: () => ({ isMobile: false }),
}))
vi.mock('../../../hooks/useDashboardContext', () => ({
  useDashboardContextOptional: () => mockDashboardContext,
}))
vi.mock('../../enterprise/EnterpriseSidebar', () => ({
  default: () => <div>Enterprise Sidebar</div>,
}))
vi.mock('../../layout/navbar/index', () => ({ Navbar: () => <div>Enterprise Navbar</div> }))
vi.mock('../../dashboard/FloatingDashboardActions', () => ({
  FloatingDashboardActions: ({ onOpenCustomizer }: { onOpenCustomizer: () => void }) => (
    <button onClick={onOpenCustomizer}>Open studio</button>
  ),
}))
vi.mock('../../dashboard/customizer/DashboardCustomizer', () => ({
  DashboardCustomizer: ({ existingCardTypes, onAddCards, isOpen }: any) => (
    <div>
      <div data-testid="customizer-open">{String(isOpen)}</div>
      <div data-testid="existing-cards">{existingCardTypes.join(',')}</div>
      <button
        onClick={() => onAddCards([{ type: 'latency-card', title: 'Latency Card', config: { threshold: 95 } }])}
      >
        Add cards
      </button>
    </div>
  ),
}))
vi.mock('../../PageErrorBoundary', () => ({
  PageErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

import EnterpriseLayout from '../EnterpriseLayout'

describe('EnterpriseLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('oidc-dashboard-cards-v2', JSON.stringify([
      {
        id: 'existing-1',
        cardType: 'provider-status',
        title: 'Provider Status',
        config: {},
        position: { x: 0, y: 0, w: 6, h: 3 },
      },
    ]))
  })

  it('renders shell components and persists added enterprise cards', async () => {
    const user = userEvent.setup()

    render(<EnterpriseLayout />)

    expect(screen.getByText('Enterprise Navbar')).toBeInTheDocument()
    expect(screen.getByText('Enterprise Sidebar')).toBeInTheDocument()
    expect(screen.getByText('Outlet Content')).toBeInTheDocument()
    expect(screen.getByTestId('existing-cards')).toHaveTextContent('provider-status')

    await user.click(screen.getByRole('button', { name: 'Open studio' }))
    expect(mockDashboardContext.openAddCardModal).toHaveBeenCalledWith()

    await user.click(screen.getByRole('button', { name: 'Add cards' }))
    const saved = JSON.parse(localStorage.getItem('oidc-dashboard-cards-v2') ?? '[]')
    expect(saved).toHaveLength(2)
    expect(saved[1].cardType).toBe('latency-card')
  })
})
