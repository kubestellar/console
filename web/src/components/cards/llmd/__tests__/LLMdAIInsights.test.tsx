import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

const mockShowToast = vi.fn()

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

vi.mock('../../../../lib/constants/network', () => ({
  PROGRESS_SIMULATION_MS: 1,
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('../../CardDataContext', () => ({
  useCardDemoState: () => ({ shouldUseDemoData: true, showDemoBadge: true, reason: null }),
  useReportCardDataState: () => {},
}))

vi.mock('../../../../lib/llmd/mockData', () => ({
  generateAIInsights: vi.fn(() => []),
}))

vi.mock('../../../../contexts/StackContext', () => ({
  useOptionalStack: () => null,
}))

vi.mock('../../CardWrapper', () => ({
  useCardExpanded: () => ({ isExpanded: false }),
}))

vi.mock('../../../ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

import LLMdAIInsights from '../LLMdAIInsights'

describe('LLMdAIInsights', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockShowToast.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders without crashing', () => {
    const { container } = render(<LLMdAIInsights />)
    expect(container).toBeTruthy()
  })

  it('shows a success toast after submitting a chat question', async () => {
    const { container } = render(<LLMdAIInsights />)

    fireEvent.change(screen.getByPlaceholderText('llmdAIInsights.scalePlaceholder'), {
      target: { value: 'How should I scale this stack?' },
    })

    const submitButton = container.querySelector('button[type="submit"]')
    expect(submitButton).toBeTruthy()
    fireEvent.click(submitButton as HTMLButtonElement)

    await act(async () => {
      vi.advanceTimersByTime(1)
    })

    expect(mockShowToast).toHaveBeenCalledWith('cards:llmdAIInsights.chatSubmitted', 'success')
  })
})
