import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => { },
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
}))
vi.mock('../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true, useDemoMode: () => true, isDemoModeForced: false,
}))
vi.mock('../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
}))
vi.mock('../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => ({
    clusters: [{ name: 'test-cluster', context: 'test-ctx' }],
  }),
}))

vi.mock('../../hooks/useAlerts', () => ({
  useAlertRules: () => ({ rules: [] }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { AlertRuleEditor } from './AlertRuleEditor'

describe('AlertRuleEditor Component', () => {
  const mockOnSave = vi.fn()
  const mockOnCancel = vi.fn()

  it('renders without crashing when open', () => {
    expect(() =>
      render(
        <AlertRuleEditor
          isOpen={true}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      )
    ).not.toThrow()
  })

  it('renders the modal title', () => {
    render(
      <AlertRuleEditor
        isOpen={true}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    )
    expect(screen.getAllByText('alerts.createRule').length).toBeGreaterThan(0)
  })

  it('renders the rule name input', () => {
    render(
      <AlertRuleEditor
        isOpen={true}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    )
    // Use regex to ignore the trailing " *" or just check if it finds elements matching the pattern
    expect(screen.getAllByText(/alerts\.ruleName/i).length).toBeGreaterThan(0)
  })
})
