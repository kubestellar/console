/**
 * Tests for CardPreview component.
 *
 * Covers:
 * - Renders card title in the header
 * - Renders correct visualization for each type (gauge, donut, bar, timeseries, table, events, status)
 * - Falls back to status visualization for unknown types
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, d?: string) => d || k,
  }),
}))

import { CardPreview } from '../CardPreview'
import type { HoveredCard } from '../cardCatalog'

function makeCard(visualization: string): HoveredCard {
  return {
    type: `test_${visualization}`,
    title: `Test ${visualization} Card`,
    description: `Description for ${visualization}`,
    visualization,
  }
}

describe('CardPreview', () => {
  it('renders card title in the header', () => {
    render(<CardPreview card={makeCard('status')} />)
    expect(screen.getByText('Test status Card')).toBeTruthy()
  })

  it('renders gauge visualization', () => {
    const { container } = render(<CardPreview card={makeCard('gauge')} />)
    // Gauge uses SVG circles
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBeGreaterThan(0)
  })

  it('renders donut visualization', () => {
    const { container } = render(<CardPreview card={makeCard('donut')} />)
    // Donut uses SVG circles and legend items
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBeGreaterThan(0)
  })

  it('renders bar visualization', () => {
    const { container } = render(<CardPreview card={makeCard('bar')} />)
    // Bar uses colored divs with bg-purple-400
    const bars = container.querySelectorAll('.bg-purple-400')
    expect(bars.length).toBeGreaterThan(0)
  })

  it('renders timeseries visualization', () => {
    const { container } = render(<CardPreview card={makeCard('timeseries')} />)
    // Timeseries uses SVG path
    const paths = container.querySelectorAll('path')
    expect(paths.length).toBeGreaterThan(0)
  })

  it('renders sparkline visualization (same as timeseries)', () => {
    const { container } = render(<CardPreview card={makeCard('sparkline')} />)
    const paths = container.querySelectorAll('path')
    expect(paths.length).toBeGreaterThan(0)
  })

  it('renders table visualization', () => {
    const { container } = render(<CardPreview card={makeCard('table')} />)
    // Table has header row and data rows with colored indicators
    const roundedDivs = container.querySelectorAll('.rounded')
    expect(roundedDivs.length).toBeGreaterThan(0)
  })

  it('renders events visualization', () => {
    render(<CardPreview card={makeCard('events')} />)
    // Events show time labels
    expect(screen.getByText('2m ago')).toBeTruthy()
    expect(screen.getByText('5m ago')).toBeTruthy()
  })

  it('renders status visualization (default)', () => {
    render(<CardPreview card={makeCard('status')} />)
    // Status shows cluster names
    expect(screen.getByText('gke-prod')).toBeTruthy()
    expect(screen.getByText('eks-dev')).toBeTruthy()
  })

  it('falls back to status for unknown visualization type', () => {
    render(<CardPreview card={makeCard('unknown_type')} />)
    // Should render status (default case)
    expect(screen.getByText('gke-prod')).toBeTruthy()
  })

  it('renders the card container with correct structure', () => {
    const { container } = render(<CardPreview card={makeCard('gauge')} />)
    // Card should have border, rounded corners, and height
    const card = container.querySelector('.bg-card')
    expect(card).toBeTruthy()
    expect(card?.className).toContain('rounded-lg')
  })
})
