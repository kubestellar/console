/**
 * Render tests for browser subdirectory components
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('DirectoryListing', () => {
  it('renders without errors', async () => {
    const { DirectoryListing } = await import('./browser/DirectoryListing')
    const { container } = render(
      <DirectoryListing
        items={[]}
        onSelect={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('EmptyState', () => {
  it('renders without errors', async () => {
    const { EmptyState } = await import('./browser/EmptyState')
    const { container } = render(
      <EmptyState
        message="No items found"
      />
    )
    expect(container).toBeTruthy()
  })

  it('displays the message', async () => {
    const { EmptyState } = await import('./browser/EmptyState')
    render(
      <EmptyState
        message="No results"
      />
    )
    expect(screen.getByText('No results')).toBeInTheDocument()
  })
})

describe('RecommendationCard', () => {
  it('renders without errors', async () => {
    const { RecommendationCard } = await import('./browser/RecommendationCard')
    const { container } = render(
      <RecommendationCard
        title="Test Recommendation"
        description="Test description"
        onClick={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })

  it('displays title and description', async () => {
    const { RecommendationCard } = await import('./browser/RecommendationCard')
    render(
      <RecommendationCard
        title="Install Prometheus"
        description="Monitoring solution"
        onClick={vi.fn()}
      />
    )
    expect(screen.getByText('Install Prometheus')).toBeInTheDocument()
    expect(screen.getByText('Monitoring solution')).toBeInTheDocument()
  })
})

describe('TreeNodeItem', () => {
  it('renders without errors', async () => {
    const { TreeNodeItem } = await import('./browser/TreeNodeItem')
    const { container } = render(
      <TreeNodeItem
        label="Test Node"
        onClick={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })

  it('displays the label', async () => {
    const { TreeNodeItem } = await import('./browser/TreeNodeItem')
    render(
      <TreeNodeItem
        label="Root Node"
        onClick={vi.fn()}
      />
    )
    expect(screen.getByText('Root Node')).toBeInTheDocument()
  })
})

describe('VirtualizedMissionGrid', () => {
  it('renders without errors', async () => {
    const { VirtualizedMissionGrid } = await import('./browser/VirtualizedMissionGrid')
    const { container } = render(
      <VirtualizedMissionGrid
        missions={[]}
        onSelect={vi.fn()}
        onImport={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })
})

describe('browser helpers', () => {
  it('exports helper functions', async () => {
    const module = await import('./browser/helpers')
    expect(module).toBeDefined()
  })
})

describe('missionCache', () => {
  it('exports cache utilities', async () => {
    const module = await import('./browser/missionCache')
    expect(module).toBeDefined()
  })
})

describe('treeFetchers', () => {
  it('exports fetcher functions', async () => {
    const module = await import('./browser/treeFetchers')
    expect(module).toBeDefined()
  })
})
