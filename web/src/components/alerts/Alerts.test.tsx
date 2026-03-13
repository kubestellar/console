/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import '../../test/utils/setupMocks'

vi.mock('../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: ({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) => (
    <div data-testid='dashboard-page' data-title={title} data-subtitle={subtitle}>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {children}
    </div>
  ),
}))

vi.mock('../../hooks/useAlerts', () => ({
  useAlerts: () => ({
    stats: { firing: 0, resolved: 0, pending: 0 },
    evaluateConditions: vi.fn(),
  }),
  useAlertRules: () => ({ rules: [] }),
}))

vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => ({
    isRefreshing: false, refetch: vi.fn(), error: null,
  }),
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToAlert: vi.fn(),
  }),
}))

vi.mock('../../hooks/useUniversalStats', () => ({
  useUniversalStats: () => ({ getStatValue: () => ({ value: 0 }) }),
  createMergedStatValueGetter: () => () => ({ value: 0 }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { Alerts } from './Alerts'

describe('Alerts Component', () => {
  const renderAlerts = () =>
    render(
      <MemoryRouter>
        <Alerts />
      </MemoryRouter>
    )

  it('renders without crashing', () => {
    expect(() => renderAlerts()).not.toThrow()
  })

  it('renders the DashboardPage with correct title', () => {
    renderAlerts()
    expect(screen.getByTestId('dashboard-page')).toBeInTheDocument()
    expect(screen.getByText('alerts.title')).toBeInTheDocument()
  })

  it('passes a subtitle to DashboardPage', () => {
    renderAlerts()
    const page = screen.getByTestId('dashboard-page')
    expect(page).toHaveAttribute('data-subtitle')
  })
})
