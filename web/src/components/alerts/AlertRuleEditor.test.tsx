/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import '../../test/utils/setupMocks'

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

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing when open', () => {
    expect(() =>
      render(
        <AlertRuleEditor
          isOpen={true}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />,
      ),
    ).not.toThrow()
  })

  it('renders the modal title', () => {
    render(
      <AlertRuleEditor
        isOpen={true}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />,
    )
    expect(screen.getAllByText('alerts.createRule')[0]).toBeInTheDocument()
  })

  it('renders the rule name input', () => {
    render(
      <AlertRuleEditor
        isOpen={true}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />,
    )
    // Use regex to ignore the trailing ' *' or just check if it finds elements matching the pattern
    expect(screen.getAllByText(/alerts\.ruleName/i)[0]).toBeInTheDocument()
  })
})
