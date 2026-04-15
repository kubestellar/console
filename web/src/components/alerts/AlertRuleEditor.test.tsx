/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import '../../test/utils/setupMocks'

vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => ({
    deduplicatedClusters: [{ name: 'test-cluster', context: 'test-ctx', reachable: true }],
  }),
}))

vi.mock('../../hooks/useAlerts', () => ({
  useAlertRules: () => ({ rules: [] }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { AlertRuleEditor } from './AlertRuleEditor'

/**
 * Label -> input id mapping for the always-visible fields on the editor.
 * Keeps the test table-driven so each field asserts label/input association
 * via getByLabelText without duplicating the boilerplate per-field.
 */
const BASE_LABEL_ID_CASES: ReadonlyArray<readonly [string, string]> = [
  // Basic info (always visible)
  ['alerts.ruleName', 'alertRuleName'],
  ['alerts.description', 'alertRuleDescription'],
  // Condition + duration (gpu_usage is the default condition type, so these
  // render on initial mount)
  ['alerts.thresholdPercent', 'alertRuleThreshold'],
  ['alerts.durationSeconds', 'alertRuleDuration'],
]

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

  describe('label <-> input association (a11y)', () => {
    it.each(BASE_LABEL_ID_CASES)(
      'associates label %s with input id %s',
      (labelKey, expectedId) => {
        render(
          <AlertRuleEditor
            isOpen={true}
            onSave={mockOnSave}
            onCancel={mockOnCancel}
          />,
        )
        // The i18n mock returns the key verbatim, so the label's visible text
        // is the key itself. getByLabelText should succeed via htmlFor -> id.
        const field = screen.getByLabelText(new RegExp(`^${labelKey}`))
        expect(field).toHaveAttribute('id', expectedId)
      },
    )

    it('associates the pod_crash restart threshold label with its input', () => {
      render(
        <AlertRuleEditor
          isOpen={true}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />,
      )
      // Switch the condition type to pod_crash so the restart threshold field
      // renders, then verify its label association.
      fireEvent.click(
        screen.getByRole('button', {
          name: /alerts\.conditions\.podCrash/i,
        }),
      )
      const field = screen.getByLabelText(/alerts\.restartCountThreshold/)
      expect(field).toHaveAttribute('id', 'alertRuleRestartThreshold')
    })

    it('associates weather alert condition labels with their inputs', () => {
      render(
        <AlertRuleEditor
          isOpen={true}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />,
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: /alerts\.conditions\.weatherAlerts/i,
        }),
      )

      const weatherSelect = screen.getByLabelText(/alerts\.weatherCondition/)
      expect(weatherSelect).toHaveAttribute('id', 'alertRuleWeatherCondition')

      // Pick "extreme heat" to reveal the temperature threshold field.
      fireEvent.change(weatherSelect, { target: { value: 'extreme_heat' } })
      const temperature = screen.getByLabelText(/alerts\.temperatureThreshold/)
      expect(temperature).toHaveAttribute('id', 'alertRuleTemperatureThreshold')

      // Pick "high wind" to reveal the wind speed threshold field.
      fireEvent.change(weatherSelect, { target: { value: 'high_wind' } })
      const wind = screen.getByLabelText(/alerts\.windSpeedThreshold/)
      expect(wind).toHaveAttribute('id', 'alertRuleWindSpeedThreshold')
    })

    it('associates Slack channel field labels with their inputs', () => {
      render(
        <AlertRuleEditor
          isOpen={true}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />,
      )
      fireEvent.click(
        screen.getByRole('button', { name: /Add Slack notification channel/i }),
      )

      const webhook = screen.getByLabelText(/alerts\.slackWebhookUrl/)
      // The slack channel is the first one added after the default browser
      // channel, so it lives at index 1.
      expect(webhook).toHaveAttribute('id', 'alertRuleSlackWebhookUrl-1')

      const channel = screen.getByLabelText(/alerts\.slackChannel/)
      expect(channel).toHaveAttribute('id', 'alertRuleSlackChannel-1')
    })

    it('associates generic webhook channel label with its input', () => {
      render(
        <AlertRuleEditor
          isOpen={true}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />,
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: /Add webhook notification channel/i,
        }),
      )
      const webhook = screen.getByLabelText(/alerts\.webhookUrl/)
      expect(webhook).toHaveAttribute('id', 'alertRuleWebhookUrl-1')
    })

    it('associates PagerDuty routing key label with its input', () => {
      render(
        <AlertRuleEditor
          isOpen={true}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />,
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: /Add PagerDuty notification channel/i,
        }),
      )
      const routingKey = screen.getByLabelText(/alerts\.pagerdutyRoutingKey/)
      expect(routingKey).toHaveAttribute('id', 'alertRulePagerdutyRoutingKey-1')
    })

    it('associates OpsGenie API key label with its input', () => {
      render(
        <AlertRuleEditor
          isOpen={true}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />,
      )
      fireEvent.click(
        screen.getByRole('button', {
          name: /Add OpsGenie notification channel/i,
        }),
      )
      const apiKey = screen.getByLabelText(/alerts\.opsgenieApiKey/)
      expect(apiKey).toHaveAttribute('id', 'alertRuleOpsgenieApiKey-1')
    })
  })
})
