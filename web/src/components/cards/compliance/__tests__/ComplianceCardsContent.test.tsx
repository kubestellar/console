import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  FalcoAlerts,
  TrivyScan,
  KubescapeScan,
  PolicyViolations,
  ComplianceScore,
} from '../ComplianceCardsContent'

// ---------------------------------------------------------------------------
// Mocks — stub each underlying card so this test only verifies that the
// thin wrapper exports forward props to the correct implementation.
// ---------------------------------------------------------------------------

vi.mock('../FalcoAlertsCard', () => ({
  FalcoAlertsCard: ({ config }: { config: Record<string, unknown> }) => (
    <div data-testid="falco-alerts-card">{JSON.stringify(config)}</div>
  ),
}))

vi.mock('../TrivyScanCard', () => ({
  TrivyScanCard: ({ config }: { config: Record<string, unknown> }) => (
    <div data-testid="trivy-scan-card">{JSON.stringify(config)}</div>
  ),
}))

vi.mock('../KubescapeScanCard', () => ({
  KubescapeScanCard: ({ config }: { config: Record<string, unknown> }) => (
    <div data-testid="kubescape-scan-card">{JSON.stringify(config)}</div>
  ),
}))

vi.mock('../PolicyViolationsCard', () => ({
  PolicyViolationsCard: ({ config }: { config: Record<string, unknown> }) => (
    <div data-testid="policy-violations-card">{JSON.stringify(config)}</div>
  ),
}))

vi.mock('../ComplianceScoreCard', () => ({
  ComplianceScoreCard: ({ config }: { config: Record<string, unknown> }) => (
    <div data-testid="compliance-score-card">{JSON.stringify(config)}</div>
  ),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComplianceCardsContent', () => {
  it('FalcoAlerts renders FalcoAlertsCard with forwarded config', () => {
    render(<FalcoAlerts config={{ foo: 'bar' }} />)
    expect(screen.getByTestId('falco-alerts-card')).toHaveTextContent('{"foo":"bar"}')
  })

  it('TrivyScan renders TrivyScanCard with forwarded config', () => {
    render(<TrivyScan config={{ foo: 'bar' }} />)
    expect(screen.getByTestId('trivy-scan-card')).toHaveTextContent('{"foo":"bar"}')
  })

  it('KubescapeScan renders KubescapeScanCard with forwarded config', () => {
    render(<KubescapeScan config={{ foo: 'bar' }} />)
    expect(screen.getByTestId('kubescape-scan-card')).toHaveTextContent('{"foo":"bar"}')
  })

  it('PolicyViolations renders PolicyViolationsCard with forwarded config', () => {
    render(<PolicyViolations config={{ foo: 'bar' }} />)
    expect(screen.getByTestId('policy-violations-card')).toHaveTextContent('{"foo":"bar"}')
  })

  it('ComplianceScore renders ComplianceScoreCard with forwarded config', () => {
    render(<ComplianceScore config={{ foo: 'bar' }} />)
    expect(screen.getByTestId('compliance-score-card')).toHaveTextContent('{"foo":"bar"}')
  })
})
