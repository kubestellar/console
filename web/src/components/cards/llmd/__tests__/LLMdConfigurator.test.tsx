import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
  useCardLoadingState: vi.fn(),
}))

vi.mock('../../../../hooks/useStackDiscovery', () => ({
  useStackDiscovery: () => ({ stacks: [], selectedStack: null, setSelectedStack: vi.fn() }),
}))

vi.mock('../../../../hooks/useLLMdConfigData', () => ({
  useLLMdConfigData: () => ({ configs: [], isLoading: false }),
}))

import LLMdConfigurator from '../LLMdConfigurator'

describe('LLMdConfigurator', () => {
  it('renders without crashing', () => {
    const { container } = render(<LLMdConfigurator />)
    expect(container).toBeTruthy()
  })
})
