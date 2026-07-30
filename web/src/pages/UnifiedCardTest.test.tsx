import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/unified/card/UnifiedCard', () => ({
  UnifiedCard: ({ config }: { config: { title?: string } }) => (
    <div data-testid="unified-card">{config?.title ?? 'UnifiedCard'}</div>
  ),
}))

vi.mock('@/components/cards/PodIssues', () => ({
  PodIssues: () => <div data-testid="pod-issues-legacy">PodIssues (legacy)</div>,
}))

vi.mock('@/config/cards/pod-issues', () => ({
  podIssuesConfig: { title: 'Pod Issues', type: 'pod_issues' },
}))

import { UnifiedCardTest } from './UnifiedCardTest'

describe('UnifiedCardTest', () => {
  it('renders the page heading', () => {
    render(<UnifiedCardTest />)
    expect(screen.getByText('UnifiedCard Framework Test')).toBeInTheDocument()
  })

  it('renders the side-by-side comparison description', () => {
    render(<UnifiedCardTest />)
    expect(screen.getByText(/Side-by-side comparison/)).toBeInTheDocument()
  })

  it('renders the UnifiedCard column heading', () => {
    render(<UnifiedCardTest />)
    expect(screen.getByText('UnifiedCard (from config)')).toBeInTheDocument()
  })

  it('renders the legacy component column heading', () => {
    render(<UnifiedCardTest />)
    expect(screen.getByText(/Legacy PodIssues/)).toBeInTheDocument()
  })

  it('renders the UnifiedCard stub', () => {
    render(<UnifiedCardTest />)
    expect(screen.getByTestId('unified-card')).toBeInTheDocument()
  })

  it('renders the legacy PodIssues stub', () => {
    render(<UnifiedCardTest />)
    expect(screen.getByTestId('pod-issues-legacy')).toBeInTheDocument()
  })

  it('renders the diff analysis section', () => {
    render(<UnifiedCardTest />)
    expect(screen.getByText('Remaining Minor Gaps')).toBeInTheDocument()
  })
})
