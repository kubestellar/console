import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { ArtifactHubStatus } from './index'

const mockUseArtifactHubStatus = vi.fn()

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('./useArtifactHubStatus', () => ({
  useArtifactHubStatus: () => mockUseArtifactHubStatus(),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: ({ height }: { height?: number }) => <div data-testid="skeleton" style={{ height }} />,
  SkeletonCardWithRefresh: () => <div data-testid="skeleton-card-with-refresh" />,
}))

function setup(overrides?: Record<string, unknown>) {
  mockUseArtifactHubStatus.mockReturnValue({
    data: {
      health: 'healthy',
      totalPackages: 0,
      totalPublishers: 0,
      totalRepositories: 0,
    },
    error: null,
    showSkeleton: false,
    showEmptyState: false,
    ...overrides,
  })
}

describe('ArtifactHubStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders skeleton when showSkeleton is true', () => {
    setup({ showSkeleton: true })
    render(<ArtifactHubStatus />)

    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  it('renders error state when error is present', () => {
    setup({ error: 'fetch error', showEmptyState: false })
    render(<ArtifactHubStatus />)

    expect(screen.getByText('artifactHub.fetchError')).toBeTruthy()
  })

  it('renders empty state when showEmptyState is true', () => {
    setup({ error: null, showEmptyState: true })
    render(<ArtifactHubStatus />)

    expect(screen.getByText('artifactHub.noData')).toBeTruthy()
  })
})
