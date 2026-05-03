import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { FlatcarStatus } from './index'

const mockUseFlatcarStatus = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: (ns: string) => ({
    t: (key: string) => key,
  }),
}))

vi.mock('./useFlatcarStatus', () => ({
  useFlatcarStatus: () => mockUseFlatcarStatus(),
}))

vi.mock('./versionUtils', () => ({
  compareFlatcarVersions: vi.fn(),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: ({ height }: { height: number }) => <div data-testid="skeleton" style={{ height }} />,
}))

function setup(overrides?: Record<string, unknown>) {
  mockUseFlatcarStatus.mockReturnValue({
    data: null,
    error: null,
    isRefreshing: false,
    showSkeleton: false,
    showEmptyState: false,
    ...overrides,
  })
}

describe('FlatcarStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders skeleton when showSkeleton is true', () => {
    setup({ showSkeleton: true })
    render(<FlatcarStatus />)

    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  it('renders error state when error is present', () => {
    setup({ error: 'fetch error', showEmptyState: false })
    render(<FlatcarStatus />)

    expect(screen.getByText('flatcar.fetchError')).toBeTruthy()
  })

  it('renders empty state when no Flatcar nodes found', () => {
    setup({ error: null, showEmptyState: true })
    render(<FlatcarStatus />)

    expect(screen.getByText('flatcar.noFlatcarNodes')).toBeTruthy()
  })
})
