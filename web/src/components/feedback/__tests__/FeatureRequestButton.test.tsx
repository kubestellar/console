import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

const { useFeatureRequestsMock } = vi.hoisted(() => ({
  useFeatureRequestsMock: vi.fn(() => ({ summaries: [], isLoading: false, error: null })),
}))

// issue #10681 — FeatureRequestButton now only uses useFeatureRequests
// (with countOnly) for the badge count synced with "Your Requests".
vi.mock('../../../hooks/useFeatureRequests', () => ({
  useFeatureRequests: useFeatureRequestsMock,
}))

vi.mock('../../../lib/modals', () => ({
  useModalState: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}))

import { FeatureRequestButton } from '../FeatureRequestButton'

describe('FeatureRequestButton', () => {
  beforeEach(() => {
    useFeatureRequestsMock.mockReturnValue({ summaries: [], isLoading: false, error: null })
  })

  it('renders without crashing', () => {
    const { container } = render(<FeatureRequestButton />)
    expect(container).toBeTruthy()
  })

  it('shows the exact request count above 99', () => {
    useFeatureRequestsMock.mockReturnValue({
      summaries: Array.from({ length: 123 }, (_, index) => ({ id: `req-${index}` })),
      isLoading: false,
      error: null,
    })

    render(<FeatureRequestButton />)

    expect(screen.getByText('123')).toBeInTheDocument()
    expect(screen.queryByText('99+')).not.toBeInTheDocument()
  })

  it('shows the exact request count for very large totals', () => {
    useFeatureRequestsMock.mockReturnValue({
      summaries: Array.from({ length: 1200 }, (_, index) => ({ id: `req-${index}` })),
      isLoading: false,
      error: null,
    })

    render(<FeatureRequestButton />)

    expect(screen.getByText('1200')).toBeInTheDocument()
    expect(screen.queryByText('99+')).not.toBeInTheDocument()
    expect(screen.queryByText('1.2K')).not.toBeInTheDocument()
  })
})
