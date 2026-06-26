/**
 * ResolutionKnowledgePanel unit tests
 *
 * Covers: empty state, personal/shared resolutions, expand/collapse, and action callbacks.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResolutionKnowledgePanel } from '../ResolutionKnowledgePanel'
import type { SimilarResolution } from '../../../hooks/useResolutions'

const mockPersonalResolution: SimilarResolution = {
  id: 'res-1',
  title: 'Fix database connection',
  description: 'Restart the database service',
  similarity: 0.85,
  source: 'personal',
  resolution: {
    id: 'res-1',
    title: 'Fix database connection',
    description: 'Restart the database service',
    steps: { type: 'manual', instructions: ['Restart DB'] },
    successRate: 0.9,
    usageCount: 5,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
}

const mockSharedResolution: SimilarResolution = {
  id: 'res-2',
  title: 'Fix network timeout',
  description: 'Increase timeout settings',
  similarity: 0.75,
  source: 'shared',
  resolution: {
    id: 'res-2',
    title: 'Fix network timeout',
    description: 'Increase timeout settings',
    steps: { type: 'manual', instructions: ['Edit config'] },
    successRate: 0.8,
    usageCount: 10,
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  },
}

describe('ResolutionKnowledgePanel', () => {
  it('renders empty state when no resolutions provided', () => {
    const onApplyResolution = vi.fn()
    const onSaveNewResolution = vi.fn()

    render(
      <ResolutionKnowledgePanel
        relatedResolutions={[]}
        onApplyResolution={onApplyResolution}
        onSaveNewResolution={onSaveNewResolution}
      />
    )

    expect(screen.getByText('Related Knowledge')).toBeInTheDocument()
    expect(screen.getByText(/No similar resolutions found/)).toBeInTheDocument()
    expect(screen.getByText('Save This Resolution')).toBeInTheDocument()
  })

  it('calls onSaveNewResolution when "Save This Resolution" is clicked', async () => {
    const user = userEvent.setup()
    const onApplyResolution = vi.fn()
    const onSaveNewResolution = vi.fn()

    render(
      <ResolutionKnowledgePanel
        relatedResolutions={[]}
        onApplyResolution={onApplyResolution}
        onSaveNewResolution={onSaveNewResolution}
      />
    )

    const saveButton = screen.getByText('Save This Resolution')
    await user.click(saveButton)

    expect(onSaveNewResolution).toHaveBeenCalledTimes(1)
  })

  it('displays personal resolutions when provided', () => {
    const onApplyResolution = vi.fn()
    const onSaveNewResolution = vi.fn()

    render(
      <ResolutionKnowledgePanel
        relatedResolutions={[mockPersonalResolution]}
        onApplyResolution={onApplyResolution}
        onSaveNewResolution={onSaveNewResolution}
      />
    )

    expect(screen.getByText('Fix database connection')).toBeInTheDocument()
    expect(screen.getByText(/From Your History/)).toBeInTheDocument()
  })

  it('displays shared resolutions when provided', () => {
    const onApplyResolution = vi.fn()
    const onSaveNewResolution = vi.fn()

    render(
      <ResolutionKnowledgePanel
        relatedResolutions={[mockSharedResolution]}
        onApplyResolution={onApplyResolution}
        onSaveNewResolution={onSaveNewResolution}
      />
    )

    expect(screen.getByText('Fix network timeout')).toBeInTheDocument()
  })

  it('separates personal and shared resolutions', () => {
    const onApplyResolution = vi.fn()
    const onSaveNewResolution = vi.fn()

    render(
      <ResolutionKnowledgePanel
        relatedResolutions={[mockPersonalResolution, mockSharedResolution]}
        onApplyResolution={onApplyResolution}
        onSaveNewResolution={onSaveNewResolution}
      />
    )

    expect(screen.getByText('Fix database connection')).toBeInTheDocument()
    expect(screen.getByText('Fix network timeout')).toBeInTheDocument()
    expect(screen.getByText(/From Your History/)).toBeInTheDocument()
  })
})
