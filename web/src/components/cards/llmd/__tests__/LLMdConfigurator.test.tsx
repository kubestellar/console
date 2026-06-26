import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../CardDataContext', () => ({
  useCardDemoState: () => ({ shouldUseDemoData: null, showDemoBadge: null }),
  useCardLoadingState: () => ({ showEmptyState: false }),
}))

vi.mock('../../../../lib/llmd/mockData', () => ({
  getConfiguratorPresets: () => [{
    id: 'test-preset',
    name: 'Test Preset',
    category: 'scheduling' as const,
    description: 'A test preset',
    parameters: [
      { name: 'maxBatchSize', value: 64, min: 1, max: 256, unit: '', description: 'Max batch size' },
    ],
    expectedImpact: { ttftImprovement: 30, throughputImprovement: 20, costChange: 5 },
  }],
}))

vi.mock('../shared/PortalTooltip', () => ({
  Acronym: ({ term }: { term: string }) => term,
}))

vi.mock('../../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: Record<string, unknown>) => {
      const { whileHover, whileTap, initial, animate, exit, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}))

import LLMdConfigurator from '../LLMdConfigurator'

describe('LLMdConfigurator', () => {
  it('renders without crashing', () => {
    const { container } = render(<LLMdConfigurator />)
    expect(container).toBeTruthy()
  })

  it('displays the component title', () => {
    const { container } = render(<LLMdConfigurator />)
    expect(container.textContent).toContain('Configurator')
  })

  it('renders preset card with name', () => {
    const { container } = render(<LLMdConfigurator />)
    expect(container.textContent).toContain('Test Preset')
  })

  it('shows expected impact metrics', () => {
    const { container } = render(<LLMdConfigurator />)
    expect(container.textContent).toContain('-30%')
    expect(container.textContent).toContain('+20%')
  })
})
