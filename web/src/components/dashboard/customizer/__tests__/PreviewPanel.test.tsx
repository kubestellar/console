/**
 * Tests for PreviewPanel component.
 *
 * Covers:
 * - Shows "hover to preview" placeholder when no card is hovered
 * - Shows card details (title, description, visualization) when a card is hovered
 * - Renders CardPreview component for hovered card
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, d?: string) => d || k }),
}))

vi.mock('../../shared/CardPreview', () => ({
  CardPreview: ({ card }: { card: { title: string } }) => (
    <div data-testid="card-preview">{card.title}</div>
  ),
}))

vi.mock('../../shared/cardCatalog', () => ({
  visualizationIcons: {
    gauge: 'G', table: 'T', timeseries: 'TS', events: 'E',
    donut: 'D', bar: 'B', status: 'S', sparkline: 'SP',
  },
  wrapAbbreviations: (text: string) => text,
}))

import { PreviewPanel } from '../PreviewPanel'
import type { HoveredCard } from '../../shared/cardCatalog'

describe('PreviewPanel', () => {
  it('shows placeholder when no card is hovered', () => {
    render(<PreviewPanel hoveredCard={null} />)
    expect(screen.getByText('Hover over a card to see a preview')).toBeTruthy()
  })

  it('renders "Preview" header', () => {
    render(<PreviewPanel hoveredCard={null} />)
    expect(screen.getByText('Preview')).toBeTruthy()
  })

  it('shows card details when a card is hovered', () => {
    const hoveredCard: HoveredCard = {
      type: 'cluster_health',
      title: 'Cluster Health',
      description: 'Shows overall cluster health status',
      visualization: 'status',
    }

    render(<PreviewPanel hoveredCard={hoveredCard} />)

    // Title appears in both CardPreview mock and the detail section
    expect(screen.getAllByText('Cluster Health').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Shows overall cluster health status')).toBeTruthy()
  })

  it('renders CardPreview for hovered card', () => {
    const hoveredCard: HoveredCard = {
      type: 'gpu_usage',
      title: 'GPU Usage',
      description: 'GPU utilization across clusters',
      visualization: 'gauge',
    }

    render(<PreviewPanel hoveredCard={hoveredCard} />)

    expect(screen.getByTestId('card-preview')).toBeTruthy()
  })

  it('shows visualization badge', () => {
    const hoveredCard: HoveredCard = {
      type: 'pod_issues',
      title: 'Pod Issues',
      description: 'Pods with issues',
      visualization: 'table',
    }

    render(<PreviewPanel hoveredCard={hoveredCard} />)

    // Should display the visualization type
    expect(screen.getByText(/table/i)).toBeTruthy()
  })

  it('hides placeholder when card is hovered', () => {
    const hoveredCard: HoveredCard = {
      type: 'events',
      title: 'Events',
      description: 'Cluster events',
      visualization: 'events',
    }

    render(<PreviewPanel hoveredCard={hoveredCard} />)

    expect(screen.queryByText('Hover over a card to see a preview')).toBeNull()
  })
})
