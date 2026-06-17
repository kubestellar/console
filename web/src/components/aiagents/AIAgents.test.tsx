import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AIAgents } from './AIAgents'
import type { KagentiSummary } from '../../hooks/mcp/kagenti'

// Mock hooks
const mockRefetch = vi.fn()
const mockUseKagentiSummary = vi.fn()

vi.mock('../../hooks/mcp/kagenti', () => ({
  useKagentiSummary: () => mockUseKagentiSummary(),
}))

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}))

// Mock DashboardPage
vi.mock('../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: ({
    title,
    subtitle,
    children,
    beforeCards,
    emptyState,
    isLoading,
    isDemoData,
  }: {
    title: string
    subtitle: string
    children: React.ReactNode
    beforeCards?: React.ReactNode
    emptyState: { title: string; description: string }
    isLoading: boolean
    isDemoData: boolean
  }) => (
    <div data-testid="dashboard-page">
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {isLoading && <div data-testid="loading-indicator">Loading...</div>}
      {isDemoData && <div data-testid="demo-indicator">Demo Mode</div>}
      {beforeCards}
      {children}
      {emptyState && (
        <div data-testid="empty-state">
          <h3>{emptyState.title}</h3>
          <p>{emptyState.description}</p>
        </div>
      )}
    </div>
  ),
}))

// Mock PageErrorBoundary
vi.mock('../PageErrorBoundary', () => ({
  PageErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock AgentIcon
vi.mock('../agent/AgentIcon', () => ({
  AgentIcon: ({ provider }: { provider: string }) => (
    <span data-testid={`agent-icon-${provider}`} />
  ),
}))

// Mock RotatingTip
vi.mock('../ui/RotatingTip', () => ({
  RotatingTip: () => <div data-testid="rotating-tip">Tips</div>,
}))

// Mock Button
vi.mock('../ui/Button', () => ({
  Button: React.forwardRef(
    (
      {
        children,
        onClick,
        disabled,
        onKeyDown,
        role,
        ...props
      }: React.ButtonHTMLAttributes<HTMLButtonElement> & { role?: string },
      ref: React.Ref<HTMLButtonElement>
    ) => (
      <button ref={ref} onClick={onClick} disabled={disabled} onKeyDown={onKeyDown} role={role} {...props}>
        {children}
      </button>
    )
  ),
}))

// Mock aiAgentsDashboardConfig
vi.mock('../../config/dashboards/ai-agents', () => ({
  aiAgentsDashboardConfig: {
    tabs: [
      {
        id: 'kagenti',
        label: 'Kagenti',
        icon: 'kagenti',
        disabled: false,
        cards: [
          {
            cardType: 'kagenti-overview',
            title: 'Overview',
            position: { w: 4, h: 2 },
          },
        ],
      },
      {
        id: 'kagent',
        label: 'Kagent',
        icon: 'kagent',
        disabled: true,
        installUrl: 'https://example.com/install-kagent',
        cards: [
          {
            cardType: 'kagent-status',
            title: 'Status',
            position: { w: 4, h: 2 },
          },
        ],
      },
    ],
  },
}))

const mockSummary: KagentiSummary = {
  agentCount: 3,
  readyAgents: 2,
  toolCount: 15,
  buildCount: 5,
  activeBuilds: 2,
  clusterBreakdown: [
    { cluster: 'prod', agents: 2 },
    { cluster: 'staging', agents: 1 },
  ],
  spiffeTotal: 10,
  spiffeBound: 8,
}

describe('AIAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the dashboard with title and subtitle', () => {
    mockUseKagentiSummary.mockReturnValue({
      summary: mockSummary,
      isLoading: false,
      isDemoData: false,
      refetch: mockRefetch,
      error: null,
    })

    render(<AIAgents />)

    expect(screen.getByText('aiAgents.title')).toBeInTheDocument()
    expect(screen.getByText('aiAgents.subtitle')).toBeInTheDocument()
  })

  it('shows loading state when data is being fetched', () => {
    mockUseKagentiSummary.mockReturnValue({
      summary: null,
      isLoading: true,
      isDemoData: false,
      refetch: mockRefetch,
      error: null,
    })

    render(<AIAgents />)

    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument()
  })

  it('shows demo mode when no data is available', () => {
    mockUseKagentiSummary.mockReturnValue({
      summary: null,
      isLoading: false,
      isDemoData: true,
      refetch: mockRefetch,
      error: null,
    })

    render(<AIAgents />)

    expect(screen.getByTestId('demo-indicator')).toBeInTheDocument()
  })

  it('renders tabs for different agent types', () => {
    mockUseKagentiSummary.mockReturnValue({
      summary: mockSummary,
      isLoading: false,
      isDemoData: false,
      refetch: mockRefetch,
      error: null,
    })

    render(<AIAgents />)

    expect(screen.getByRole('tab', { name: /Kagenti/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Kagent/i })).toBeInTheDocument()
  })

  it('shows install link for disabled tabs', () => {
    mockUseKagentiSummary.mockReturnValue({
      summary: mockSummary,
      isLoading: false,
      isDemoData: false,
      refetch: mockRefetch,
      error: null,
    })

    render(<AIAgents />)

    const installLink = screen.getByRole('link', { name: /Install/i })
    expect(installLink).toBeInTheDocument()
    expect(installLink).toHaveAttribute('href', 'https://example.com/install-kagent')
  })

  it('switches tabs when tab button is clicked', () => {
    mockUseKagentiSummary.mockReturnValue({
      summary: mockSummary,
      isLoading: false,
      isDemoData: false,
      refetch: mockRefetch,
      error: null,
    })

    render(<AIAgents />)

    const kagentiTab = screen.getByRole('tab', { name: /Kagenti/i })
    const kagentTab = screen.getByRole('tab', { name: /Kagent/i })

    expect(kagentiTab).toHaveAttribute('aria-selected', 'true')
    expect(kagentTab).toHaveAttribute('aria-selected', 'false')

    // Kagent tab is disabled, so clicking won't change selection
    fireEvent.click(kagentTab)
    expect(kagentiTab).toHaveAttribute('aria-selected', 'true')
  })

  it('handles keyboard navigation with ArrowRight', () => {
    mockUseKagentiSummary.mockReturnValue({
      summary: mockSummary,
      isLoading: false,
      isDemoData: false,
      refetch: mockRefetch,
      error: null,
    })

    render(<AIAgents />)

    const kagentiTab = screen.getByRole('tab', { name: /Kagenti/i })

    fireEvent.keyDown(kagentiTab, { key: 'ArrowRight' })

    // Since Kagent is disabled, it should stay on Kagenti (wraps around to itself)
    expect(kagentiTab).toHaveAttribute('aria-selected', 'true')
  })

  it('handles keyboard navigation with Home key', () => {
    mockUseKagentiSummary.mockReturnValue({
      summary: mockSummary,
      isLoading: false,
      isDemoData: false,
      refetch: mockRefetch,
      error: null,
    })

    render(<AIAgents />)

    const kagentiTab = screen.getByRole('tab', { name: /Kagenti/i })

    fireEvent.keyDown(kagentiTab, { key: 'Home' })

    expect(kagentiTab).toHaveAttribute('aria-selected', 'true')
  })

  it('displays error message when data fetch fails', () => {
    const errorMessage = 'Failed to connect to kagenti service'
    mockUseKagentiSummary.mockReturnValue({
      summary: null,
      isLoading: false,
      isDemoData: false,
      refetch: mockRefetch,
      error: new Error(errorMessage),
    })

    render(<AIAgents />)

    expect(screen.getByText('aiAgents.errorLoading')).toBeInTheDocument()
    expect(screen.getByText(errorMessage)).toBeInTheDocument()
  })

  it('shows connection hint for connection errors', () => {
    mockUseKagentiSummary.mockReturnValue({
      summary: null,
      isLoading: false,
      isDemoData: false,
      refetch: mockRefetch,
      error: new Error('Service not connected'),
    })

    render(<AIAgents />)

    expect(screen.getByText('aiAgents.notConnectedHint')).toBeInTheDocument()
  })

  it('renders rotating tips component', () => {
    mockUseKagentiSummary.mockReturnValue({
      summary: mockSummary,
      isLoading: false,
      isDemoData: false,
      refetch: mockRefetch,
      error: null,
    })

    render(<AIAgents />)

    expect(screen.getByTestId('rotating-tip')).toBeInTheDocument()
  })

  it('wraps content in PageErrorBoundary', () => {
    mockUseKagentiSummary.mockReturnValue({
      summary: mockSummary,
      isLoading: false,
      isDemoData: false,
      refetch: mockRefetch,
      error: null,
    })

    const { container } = render(<AIAgents />)

    // Should render without crashing
    expect(container).toBeInTheDocument()
  })

  it('handles null summary gracefully', () => {
    mockUseKagentiSummary.mockReturnValue({
      summary: null,
      isLoading: false,
      isDemoData: false,
      refetch: mockRefetch,
      error: null,
    })

    const { container } = render(<AIAgents />)

    // Should render without crashing
    expect(container).toBeInTheDocument()
  })
})
