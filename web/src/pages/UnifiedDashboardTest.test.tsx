import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/lib/unified/dashboard/UnifiedDashboard', () => ({
  UnifiedDashboard: ({ config }: { config: { cards: unknown[] } }) => (
    <div data-testid="unified-dashboard">UnifiedDashboard ({config?.cards?.length ?? 0} cards)</div>
  ),
}))

vi.mock('@/lib/unified/card/UnifiedCard', () => ({
  UnifiedCard: () => <div data-testid="unified-card">UnifiedCard</div>,
}))

vi.mock('@/lib/unified/card/UnifiedCardAdapter', () => ({
  UNIFIED_READY_CARDS: new Set(['pod_issues']),
  UNIFIED_EXCLUDED_CARDS: new Set(['dynamic_card']),
  UnifiedCardAdapter: () => <div data-testid="unified-card-adapter">UnifiedCardAdapter</div>,
  hasValidUnifiedConfig: vi.fn(() => false),
  getCardMigrationStatus: vi.fn(() => ({ status: 'legacy', reason: 'No config' })),
}))

vi.mock('@/config/cards', () => ({
  CARD_CONFIGS: { pod_issues: {}, node_status: {}, dynamic_card: {} },
  getCardConfig: vi.fn(() => null),
}))

vi.mock('@/config/dashboards/arcade', () => ({
  arcadeDashboardConfig: { id: 'arcade', cards: [{ type: 'pod_issues' }, { type: 'node_status' }] },
}))

vi.mock('@/components/cards/CardWrapper', () => ({
  CardWrapper: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-wrapper">{children}</div>
  ),
}))

import { UnifiedDashboardTest } from './UnifiedDashboardTest'

describe('UnifiedDashboardTest', () => {
  it('renders the page heading', () => {
    render(<UnifiedDashboardTest />)
    expect(screen.getByText('Unified Framework Test')).toBeInTheDocument()
  })

  it('renders migration stats grid with four stat boxes', () => {
    render(<UnifiedDashboardTest />)
    expect(screen.getByText('Total Cards')).toBeInTheDocument()
    expect(screen.getByText('Config Ready')).toBeInTheDocument()
    expect(screen.getByText('Using UnifiedCard')).toBeInTheDocument()
    expect(screen.getByText('Excluded')).toBeInTheDocument()
  })

  it('shows total card count from CARD_CONFIGS', () => {
    render(<UnifiedDashboardTest />)
    // CARD_CONFIGS has 3 entries
    const totalCards = screen.getByText('Total Cards').parentElement!
    expect(within(totalCards).getByText('3')).toBeInTheDocument()
  })

  it('renders the card selector dropdown', () => {
    render(<UnifiedDashboardTest />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByText('Select card:')).toBeInTheDocument()
  })

  it('renders the UnifiedCard comparison test section', () => {
    render(<UnifiedDashboardTest />)
    expect(screen.getByText('UnifiedCard Comparison Test')).toBeInTheDocument()
  })

  it('renders the UnifiedDashboard stub', () => {
    render(<UnifiedDashboardTest />)
    expect(screen.getByTestId('unified-dashboard')).toBeInTheDocument()
    expect(screen.getByText('UnifiedDashboard (2 cards)')).toBeInTheDocument()
  })

  it('renders the framework status checklist', () => {
    render(<UnifiedDashboardTest />)
    expect(screen.getByText('Framework Status')).toBeInTheDocument()
  })

  it('updates selected card when dropdown changes', async () => {
    render(<UnifiedDashboardTest />)
    const user = userEvent.setup()
    const select = screen.getByRole('combobox')
    // Initial selection is 'pod_issues'
    expect(select).toHaveValue('pod_issues')

    await user.selectOptions(select, 'node_status')
    expect(select).toHaveValue('node_status')
  })
})
