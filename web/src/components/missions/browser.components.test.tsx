import React from 'react'
/**
 * Render tests for browser subdirectory components
 */
import { describe, it, expect, vi } from 'vitest'

const resetMissionCacheSpy = vi.fn()
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('./browser/missionCache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./browser/missionCache')>()),
  resetMissionCache: resetMissionCacheSpy,
}))

describe('DirectoryListing', () => {
  it('renders without errors', async () => {
    const { DirectoryListing } = await import('./browser/DirectoryListing')
    const { container } = render(
      <DirectoryListing
        entries={[]}
        viewMode="grid"
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

describe('MissionFetchErrorBanner', () => {
  it('shows retry loading state after retry click', async () => {
    resetMissionCacheSpy.mockClear()
    const { MissionFetchErrorBanner } = await import('./browser/EmptyState')
    const { container } = render(<MissionFetchErrorBanner message="boom" />)

    fireEvent.click(screen.getByRole('button', { name: 'missions.browser.emptyState.retry' }))

    expect(resetMissionCacheSpy).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })
})

describe('RecommendationCard', () => {
  it('renders without errors', async () => {
    const { RecommendationCard } = await import('./browser/RecommendationCard')
    const { container } = render(
      <RecommendationCard
        match={{ mission: { title: 'Test Recommendation', description: 'Test description', type: 'repair', tags: [], metadata: {} }, score: 1, matchPercent: 75, matchReasons: [] }}
        onSelect={vi.fn()}
        onImport={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })

  it('displays title and description', async () => {
    const { RecommendationCard } = await import('./browser/RecommendationCard')
    render(
      <RecommendationCard
        match={{ mission: { title: 'Install Prometheus', description: 'Monitoring solution', type: 'deploy', tags: [], metadata: {} }, score: 2, matchPercent: 90, matchReasons: ['Matched'] }}
        onSelect={vi.fn()}
        onImport={vi.fn()}
      />
    )
    expect(screen.getByText('Install Prometheus')).toBeInTheDocument()
    expect(screen.getByText('Monitoring solution')).toBeInTheDocument()
  })
})

describe('TreeNodeItem', () => {
  const mockNode = {
    id: 'test-1',
    name: 'Test Node',
    path: '/test',
    type: 'directory' as const,
    source: 'community' as const,
  }
  const defaultProps = {
    expandedNodes: new Set<string>(),
    selectedPath: null,
    nodeRefs: { current: new Map<string, HTMLButtonElement>() },
  }

  it('renders without errors', async () => {
    const { TreeNodeItem } = await import('./browser/TreeNodeItem')
    const { container } = render(
      <TreeNodeItem
        node={mockNode}
        depth={0}
        {...defaultProps}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
      />
    )
    expect(container).toBeTruthy()
  })

  it('displays the label', async () => {
    const { TreeNodeItem } = await import('./browser/TreeNodeItem')
    render(
      <TreeNodeItem
        node={{ ...mockNode, name: 'Root Node' }}
        depth={0}
        {...defaultProps}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
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
        items={[]}
        viewMode="grid"
        renderItem={() => null}
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
