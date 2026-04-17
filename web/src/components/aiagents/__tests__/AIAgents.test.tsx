import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AIAgents } from '../AIAgents'

/* ---------- Mocks ---------- */

const mockRefetch = vi.fn()

vi.mock('../../../hooks/mcp/kagenti', () => ({
  useKagentiSummary: () => ({
    summary: {
      agentCount: 5,
      readyAgents: 3,
      toolCount: 12,
      buildCount: 2,
      activeBuilds: 1,
      clusterBreakdown: [{ name: 'cluster-1' }],
      spiffeTotal: 10,
      spiffeBound: 8,
    },
    isLoading: false,
    isDemoData: false,
    error: null,
    refetch: mockRefetch,
  }),
}))

vi.mock('../../../hooks/useUniversalStats', () => ({
  useUniversalStats: () => ({
    getStatValue: () => ({ value: '-' }),
  }),
  createMergedStatValueGetter: (primary: (id: string) => unknown) => primary,
}))

vi.mock('../../../config/dashboards/ai-agents', () => ({
  aiAgentsDashboardConfig: {
    id: 'ai-agents',
    tabs: [
      {
        id: 'kagenti',
        label: 'Kagenti',
        icon: 'kagenti',
        disabled: false,
        cards: [{ cardType: 'KagentiAgents', title: 'Agents', position: { w: 4, h: 2 } }],
      },
      {
        id: 'kagent',
        label: 'Kagent',
        icon: 'kagent',
        disabled: true,
        installUrl: 'https://example.com/install',
        cards: [],
      },
    ],
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

// Mock DashboardPage to render children and expose props
vi.mock('../../../lib/dashboards', () => ({
  DashboardPage: ({ children, beforeCards, title, isDemoData, isLoading }: Record<string, unknown>) => (
    <div data-testid="dashboard-page" data-title={title as string} data-demo={String(isDemoData)} data-loading={String(isLoading)}>
      {beforeCards as React.ReactNode}
      {children as React.ReactNode}
    </div>
  ),
}))

vi.mock('../../ui/RotatingTip', () => ({
  RotatingTip: () => <div data-testid="rotating-tip" />,
}))

vi.mock('../../agent/AgentIcon', () => ({
  AgentIcon: ({ provider }: { provider: string }) => <span data-testid={`agent-icon-${provider}`} />,
}))

/* ---------- Tests ---------- */

describe('AIAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the DashboardPage with correct title', () => {
    render(<AIAgents />)

    const page = screen.getByTestId('dashboard-page')
    expect(page).toHaveAttribute('data-title', 'aiAgents.title')
  })

  it('renders tab bar with kagenti and kagent tabs', () => {
    render(<AIAgents />)

    expect(screen.getByText('Kagenti')).toBeInTheDocument()
    expect(screen.getByText('Kagent')).toBeInTheDocument()
  })

  it('marks the first tab as selected by default', () => {
    render(<AIAgents />)

    const tabs = screen.getAllByRole('tab')
    // First tab (Kagenti) should be selected
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
  })

  it('disables the kagent tab and shows install link', () => {
    render(<AIAgents />)

    const tabs = screen.getAllByRole('tab')
    // Second tab (Kagent) should be disabled
    expect(tabs[1]).toBeDisabled()

    const installLink = screen.getByText('Install')
    expect(installLink.closest('a')).toHaveAttribute('href', 'https://example.com/install')
  })

  it('does not switch to disabled tab on click', () => {
    render(<AIAgents />)

    const tabs = screen.getAllByRole('tab')
    // Kagenti is active initially
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')

    // Kagent is disabled so clicking it should not change active tab
    fireEvent.click(tabs[1])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('sets isDemoData=false when summary has data', () => {
    render(<AIAgents />)

    const page = screen.getByTestId('dashboard-page')
    expect(page).toHaveAttribute('data-demo', 'false')
  })

  it('sets isLoading from the hook', () => {
    render(<AIAgents />)

    const page = screen.getByTestId('dashboard-page')
    expect(page).toHaveAttribute('data-loading', 'false')
  })
})

describe('AIAgents — error state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders error message when hook returns an error', async () => {
    const kagentiModule = await import('../../../hooks/mcp/kagenti')
    vi.spyOn(kagentiModule, 'useKagentiSummary').mockReturnValue({
      summary: null,
      isLoading: false,
      isDemoData: false,
      error: 'Failed to fetch kagenti data',
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof kagentiModule.useKagentiSummary>)

    render(<AIAgents />)

    expect(screen.getByText('aiAgents.errorLoading')).toBeInTheDocument()
    expect(screen.getByText('Failed to fetch kagenti data')).toBeInTheDocument()
  })
})
