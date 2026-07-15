import React from 'react'
/**
 * Unit tests for ProviderHealth card component.
 *
 * Covers: loading skeleton, empty state (no providers), AI provider
 * rendering, cloud provider rendering, status colors/labels, configure
 * button, external status link, and navigation to settings.
 *
 * Part of #21100
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ProviderHealthInfo } from '../../hooks/useProviderHealth'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => String(key).split(':').pop()?.split('.').pop() ?? key,
  }),
}))

const mockUseProviderHealth = vi.fn()
vi.mock('../../hooks/useProviderHealth', () => ({
  useProviderHealth: () => mockUseProviderHealth(),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: () => ({}),
  useReportCardDataState: () => {},
}))

vi.mock('../ui/Skeleton', () => ({
  SkeletonList: ({ items }: { items: number }) => (
    <div data-testid="skeleton-list" data-items={items} />
  ),
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

vi.mock('../agent/AgentIcon', () => ({
  AgentIcon: ({ provider }: { provider: string }) => (
    <span data-testid="agent-icon" data-provider={provider} />
  ),
}))

vi.mock('../ui/CloudProviderIcon', () => ({
  CloudProviderIcon: ({ provider }: { provider: string }) => (
    <span data-testid="cloud-provider-icon" data-provider={provider} />
  ),
}))

vi.mock('../../lib/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('../../lib/utils/sanitizeUrl', () => ({
  sanitizeUrl: (url: string) => url,
}))

vi.mock('../../config/routes', () => ({
  ROUTES: { SETTINGS: '/settings' },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProvider(overrides: Partial<ProviderHealthInfo> = {}): ProviderHealthInfo {
  return {
    id: 'openai',
    name: 'OpenAI',
    category: 'ai',
    status: 'operational',
    configured: true,
    detail: undefined,
    statusUrl: undefined,
    ...overrides,
  }
}

function setupMocks(opts: {
  aiProviders?: ProviderHealthInfo[]
  cloudProviders?: ProviderHealthInfo[]
  isLoading?: boolean
  isDemoFallback?: boolean
} = {}) {
  mockUseProviderHealth.mockReturnValue({
    aiProviders: opts.aiProviders ?? [],
    cloudProviders: opts.cloudProviders ?? [],
    isLoading: opts.isLoading ?? false,
    isRefreshing: false,
    isDemoFallback: opts.isDemoFallback ?? false,
    isFailed: false,
    consecutiveFailures: 0,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProviderHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loading state', () => {
    it('renders skeleton list when loading with no data', async () => {
      setupMocks({ isLoading: true })
      const { ProviderHealth } = await import('./ProviderHealth')
      render(<ProviderHealth />)
      expect(screen.getByTestId('skeleton-list')).toBeInTheDocument()
      expect(screen.getByTestId('skeleton-list')).toHaveAttribute('data-items', '5')
    })
  })

  describe('empty state', () => {
    it('renders "no providers" message when no providers exist', async () => {
      setupMocks()
      const { ProviderHealth } = await import('./ProviderHealth')
      render(<ProviderHealth />)
      expect(screen.getByText('noProviders')).toBeInTheDocument()
    })

    it('renders "configure AI keys" link that navigates to settings', async () => {
      setupMocks()
      const { ProviderHealth } = await import('./ProviderHealth')
      render(<ProviderHealth />)
      const link = screen.getByRole('button', { name: 'configureAIKeys' })
      await userEvent.click(link)
      expect(mockNavigate).toHaveBeenCalledWith('/settings')
    })
  })

  describe('AI provider rendering', () => {
    it('renders AI provider section with agent icon and name', async () => {
      setupMocks({
        aiProviders: [makeProvider({ id: 'openai', name: 'OpenAI', category: 'ai', status: 'operational' })],
      })
      const { ProviderHealth } = await import('./ProviderHealth')
      render(<ProviderHealth />)
      expect(screen.getByText('OpenAI')).toBeInTheDocument()
      expect(screen.getByTestId('agent-icon')).toHaveAttribute('data-provider', 'openai')
    })

    it('renders "AI Providers" section heading', async () => {
      setupMocks({ aiProviders: [makeProvider()] })
      const { ProviderHealth } = await import('./ProviderHealth')
      render(<ProviderHealth />)
      expect(screen.getByText('aiProviders')).toBeInTheDocument()
    })

    it('shows configure button for unconfigured AI provider', async () => {
      setupMocks({
        aiProviders: [makeProvider({ id: 'openai', name: 'OpenAI', configured: false })],
      })
      const { ProviderHealth } = await import('./ProviderHealth')
      render(<ProviderHealth />)
      const configureBtn = screen.getByTitle('configureInSettings')
      expect(configureBtn).toBeInTheDocument()
      await userEvent.click(configureBtn)
      expect(mockNavigate).toHaveBeenCalledWith('/settings')
    })

    it('shows "no key" badge for unconfigured provider', async () => {
      setupMocks({
        aiProviders: [makeProvider({ id: 'anthropic', name: 'Anthropic', configured: false })],
      })
      const { ProviderHealth } = await import('./ProviderHealth')
      render(<ProviderHealth />)
      expect(screen.getByTestId('status-badge')).toHaveTextContent('noKey')
    })

    it('shows external status link when statusUrl is provided', async () => {
      setupMocks({
        aiProviders: [makeProvider({ name: 'OpenAI', statusUrl: 'https://status.openai.com' })],
      })
      const { ProviderHealth } = await import('./ProviderHealth')
      render(<ProviderHealth />)
      const statusLink = screen.getByTitle('viewStatusPage')
      expect(statusLink).toHaveAttribute('href', 'https://status.openai.com')
    })
  })

  describe('cloud provider rendering', () => {
    it('renders cloud provider section with cloud icon and name', async () => {
      setupMocks({
        cloudProviders: [makeProvider({ id: 'aws', name: 'Amazon Web Services', category: 'cloud', configured: true })],
      })
      const { ProviderHealth } = await import('./ProviderHealth')
      render(<ProviderHealth />)
      expect(screen.getByText('Amazon Web Services')).toBeInTheDocument()
      expect(screen.getByTestId('cloud-provider-icon')).toHaveAttribute('data-provider', 'aws')
    })

    it('renders "Cloud Providers" section heading', async () => {
      setupMocks({
        cloudProviders: [makeProvider({ id: 'gcp', name: 'Google Cloud', category: 'cloud' })],
      })
      const { ProviderHealth } = await import('./ProviderHealth')
      render(<ProviderHealth />)
      expect(screen.getByText('cloudProviders')).toBeInTheDocument()
    })

    it('renders both AI and cloud sections when both have providers', async () => {
      setupMocks({
        aiProviders: [makeProvider({ id: 'openai', name: 'OpenAI', category: 'ai' })],
        cloudProviders: [makeProvider({ id: 'aws', name: 'AWS', category: 'cloud' })],
      })
      const { ProviderHealth } = await import('./ProviderHealth')
      render(<ProviderHealth />)
      expect(screen.getByText('aiProviders')).toBeInTheDocument()
      expect(screen.getByText('cloudProviders')).toBeInTheDocument()
      expect(screen.getByText('OpenAI')).toBeInTheDocument()
      expect(screen.getByText('AWS')).toBeInTheDocument()
    })
  })

  describe('status labels', () => {
    it('shows operational status label', async () => {
      setupMocks({
        aiProviders: [makeProvider({ status: 'operational' })],
      })
      const { ProviderHealth } = await import('./ProviderHealth')
      render(<ProviderHealth />)
      expect(screen.getByText('operational')).toBeInTheDocument()
    })

    it('shows degraded status label', async () => {
      setupMocks({
        aiProviders: [makeProvider({ status: 'degraded' })],
      })
      const { ProviderHealth } = await import('./ProviderHealth')
      render(<ProviderHealth />)
      expect(screen.getByText('degraded')).toBeInTheDocument()
    })

    it('shows down status label', async () => {
      setupMocks({
        cloudProviders: [makeProvider({ id: 'aws', name: 'AWS', category: 'cloud', status: 'down' })],
      })
      const { ProviderHealth } = await import('./ProviderHealth')
      render(<ProviderHealth />)
      expect(screen.getByText('down')).toBeInTheDocument()
    })
  })

  describe('snapshot', () => {
    it('matches snapshot for mixed AI and cloud providers', async () => {
      setupMocks({
        aiProviders: [makeProvider({ id: 'openai', name: 'OpenAI', status: 'operational', configured: true })],
        cloudProviders: [makeProvider({ id: 'aws', name: 'AWS', category: 'cloud', status: 'degraded' })],
      })
      const { ProviderHealth } = await import('./ProviderHealth')
      const { container } = render(<ProviderHealth />)
      expect(container.firstChild).toMatchSnapshot()
    })
  })
})
