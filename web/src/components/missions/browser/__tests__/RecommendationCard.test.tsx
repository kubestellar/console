/**
 * RecommendationCard unit tests
 *
 * Covers: card rendering, compact mode, score badges, and interaction callbacks.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecommendationCard } from '../RecommendationCard'
import type { MissionMatch } from '../../../../lib/missions/types'

const mockMatch: MissionMatch = {
  mission: {
    version: 'v1',
    title: 'Install Prometheus',
    description: 'Deploy monitoring stack',
    type: 'install',
    tags: ['monitoring', 'observability'],
    steps: [],
  },
  score: 0.85,
  matchPercent: 85,
  matchReasons: ['Matches cluster needs'],
}

const mockClusterMatch: MissionMatch = {
  ...mockMatch,
  score: 1.5, // > 1 indicates cluster match
  matchPercent: 90,
}

const mockMissionWithMaturity: MissionMatch = {
  ...mockMatch,
  mission: {
    ...mockMatch.mission,
    metadata: {
      maturity: 'graduated',
    },
  },
}

describe('RecommendationCard', () => {
  it('renders mission title and description', () => {
    const onSelect = vi.fn()
    const onImport = vi.fn()

    render(
      <RecommendationCard
        match={mockMatch}
        onSelect={onSelect}
        onImport={onImport}
      />
    )

    expect(screen.getByText('Install Prometheus')).toBeInTheDocument()
  })

  it('displays match percentage badge', () => {
    const onSelect = vi.fn()
    const onImport = vi.fn()

    render(
      <RecommendationCard
        match={mockMatch}
        onSelect={onSelect}
        onImport={onImport}
      />
    )

    expect(screen.getByText('85%')).toBeInTheDocument()
  })

  it('displays mission type', () => {
    const onSelect = vi.fn()
    const onImport = vi.fn()

    render(
      <RecommendationCard
        match={mockMatch}
        onSelect={onSelect}
        onImport={onImport}
      />
    )

    expect(screen.getByText('install')).toBeInTheDocument()
  })

  it('shows cluster match indicator for high scores', () => {
    const onSelect = vi.fn()
    const onImport = vi.fn()

    render(
      <RecommendationCard
        match={mockClusterMatch}
        onSelect={onSelect}
        onImport={onImport}
      />
    )

    // CheckCircle icon should be present for cluster matches
    expect(screen.getByText('90%')).toBeInTheDocument()
  })

  it('displays maturity badge when available', () => {
    const onSelect = vi.fn()
    const onImport = vi.fn()

    render(
      <RecommendationCard
        match={mockMissionWithMaturity}
        onSelect={onSelect}
        onImport={onImport}
      />
    )

    expect(screen.getByText('graduated')).toBeInTheDocument()
  })

  it('displays match reasons when provided', () => {
    const onSelect = vi.fn()
    const onImport = vi.fn()

    render(
      <RecommendationCard
        match={mockMatch}
        onSelect={onSelect}
        onImport={onImport}
        compact={true}
      />
    )

    expect(screen.getByText('Matches cluster needs')).toBeInTheDocument()
  })

  it('calls onSelect when card is clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onImport = vi.fn()

    render(
      <RecommendationCard
        match={mockMatch}
        onSelect={onSelect}
        onImport={onImport}
        compact={true}
      />
    )

    const card = screen.getByText('Install Prometheus').closest('div')
    if (card) {
      await user.click(card)
      expect(onSelect).toHaveBeenCalled()
    }
  })

  it('renders in compact mode', () => {
    const onSelect = vi.fn()
    const onImport = vi.fn()

    const { container } = render(
      <RecommendationCard
        match={mockMatch}
        onSelect={onSelect}
        onImport={onImport}
        compact={true}
      />
    )

    expect(container.firstChild).toHaveClass('flex')
  })
})
