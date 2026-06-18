import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SidebarShell } from '../SidebarShell'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback || key }),
}))

vi.mock('../../../hooks/useSidebarConfig', async () => {
  const actual = await vi.importActual('../../../hooks/useSidebarConfig')
  return {
    ...actual,
    useSidebarConfig: () => ({
      config: {
        primaryNav: [{ id: 'home', name: 'Home', href: '/', icon: 'Home', type: 'link', order: 0 }],
        secondaryNav: [],
        collapsed: false,
        isMobileOpen: false,
        width: 256,
      },
      toggleCollapsed: vi.fn(),
      setCollapsed: vi.fn(),
      reorderItems: vi.fn(),
      updateItem: vi.fn(),
      removeItem: vi.fn(),
      closeMobileSidebar: vi.fn(),
      setWidth: vi.fn(),
    }),
  }
})

vi.mock('../../../hooks/useMobile', () => ({ useMobile: () => ({ isMobile: false }) }))
vi.mock('../../../hooks/mcp/clusters', () => ({ useClusters: () => ({ deduplicatedClusters: [] }) }))
vi.mock('../../../hooks/useMissions', () => ({ useMissions: () => ({ isFullScreen: false }) }))
vi.mock('../../../hooks/useActiveUsers', () => ({ useActiveUsers: () => ({ viewerCount: 0, hasError: false, isLoading: false }) }))
vi.mock('../../../hooks/useVersionCheck', () => ({ useVersionCheck: () => ({ hasUpdate: false, channel: null, latestMainSHA: null }) }))
vi.mock('../../../hooks/useUpgradeState', () => ({ useUpgradeState: () => ({ phase: 'idle' }) }))
vi.mock('../../../hooks/useDashboardContext', () => ({ useDashboardContextOptional: () => ({ openAddCardModal: vi.fn() }) }))
vi.mock('../../../lib/modals', () => ({ useEscapeLayer: () => () => true, useModalFocusTrap: vi.fn() }))
vi.mock('../../../lib/analytics', () => ({ emitSidebarNavigated: vi.fn(), emitDashboardRenamed: vi.fn() }))
vi.mock('../../../lib/prefetchDashboard', () => ({ prefetchDashboard: vi.fn() }))
vi.mock('../../../lib/a11y/rovingFocus', () => ({ moveFocusByKey: vi.fn() }))

describe('SidebarShell', () => {
  it('renders nav items and calls add-more handler', async () => {
    const user = userEvent.setup()
    const onAddMore = vi.fn()

    render(
      <MemoryRouter>
        <SidebarShell
          navSections={[
            {
              id: 'primary',
              items: [{ id: 'home', label: 'Home', href: '/', icon: 'Home' }],
            },
          ]}
          features={{ addMore: true, collapsePin: true }}
          onAddMore={onAddMore}
        />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-collapse-toggle')).toBeInTheDocument()

    await user.click(screen.getByTestId('sidebar-customize'))
    expect(onAddMore).toHaveBeenCalledTimes(1)
  })
})
