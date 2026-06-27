import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from '../Sidebar'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mockNavigate = vi.fn()
const mockOpenAddCardModal = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/' }),
  }
})

vi.mock('../../../hooks/useSidebarConfig', () => ({
  useSidebarConfig: () => ({
    config: {
      primaryNav: [
        { id: 'home', name: 'Home', href: '/', icon: 'Home', isCustom: false },
        { id: 'workloads', name: 'Workloads', href: '/workloads', icon: 'Box', isCustom: false },
      ],
      secondaryNav: [
        { id: 'settings', name: 'Settings', href: '/settings', icon: 'Settings', isCustom: false },
      ],
      showClusterStatus: true,
    },
  }),
}))

vi.mock('../../../hooks/useDashboardContext', () => ({
  useDashboardContextOptional: () => ({
    openAddCardModal: mockOpenAddCardModal,
    setPendingOpenAddCardModal: vi.fn(),
  }),
}))

vi.mock('../SidebarShell', () => ({
  SidebarShell: ({ navSections, features, onAddCard }: any) => (
    <div data-testid="sidebar-shell">
      <div data-testid="nav-sections">{JSON.stringify(navSections)}</div>
      <div data-testid="features">{JSON.stringify(features)}</div>
      <button onClick={onAddCard} data-testid="add-card-btn">Add Card</button>
    </div>
  ),
}))

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders SidebarShell with correct nav sections', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )

    const navSections = screen.getByTestId('nav-sections')
    const sections = JSON.parse(navSections.textContent || '[]')

    expect(sections).toHaveLength(2)
    expect(sections[0].id).toBe('primary')
    expect(sections[0].items).toHaveLength(2)
  })

  it('enables expected features', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )

    const features = screen.getByTestId('features')
    const featuresObj = JSON.parse(features.textContent || '{}')

    expect(featuresObj.addCard).toBe(true)
    expect(featuresObj.clusterStatus).toBe(true)
  })

  it('opens add card modal when on home dashboard', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
      </MemoryRouter>
    )

    await user.click(screen.getByTestId('add-card-btn'))
    expect(mockOpenAddCardModal).toHaveBeenCalledTimes(1)
  })
})
