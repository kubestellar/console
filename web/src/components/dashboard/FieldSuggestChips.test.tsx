import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FieldSuggestChips } from './FieldSuggestChips'

const isFeatureEnabled = vi.fn(() => true)

vi.mock('../../hooks/useAIMode', () => ({
  useAIMode: () => ({ isFeatureEnabled }),
}))

describe('FieldSuggestChips Component', () => {
  it('renders nothing when the naturalLanguage feature is disabled', () => {
    isFeatureEnabled.mockReturnValueOnce(false)
    const { container } = render(
      <FieldSuggestChips
        dataJson={JSON.stringify([{ status: 'Running' }])}
        existingFields={new Set()}
        onAddColumn={vi.fn()}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when there is no novel field to suggest', () => {
    const { container } = render(
      <FieldSuggestChips
        dataJson={JSON.stringify([{ status: 'Running' }])}
        existingFields={new Set(['status'])}
        onAddColumn={vi.fn()}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the data is not valid JSON', () => {
    const { container } = render(
      <FieldSuggestChips
        dataJson="not valid json"
        existingFields={new Set()}
        onAddColumn={vi.fn()}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders a chip for each field not already present', () => {
    render(
      <FieldSuggestChips
        dataJson={JSON.stringify([{ status: 'Running', namespace: 'default' }])}
        existingFields={new Set(['status'])}
        onAddColumn={vi.fn()}
      />,
    )

    expect(screen.getByText('+ namespace')).toBeVisible()
    expect(screen.queryByText('+ status')).not.toBeInTheDocument()
  })

  it('calls onAddColumn with the detected column when a chip is clicked', () => {
    const onAddColumn = vi.fn()
    render(
      <FieldSuggestChips
        dataJson={JSON.stringify([{ status: 'Running' }])}
        existingFields={new Set()}
        onAddColumn={onAddColumn}
      />,
    )

    fireEvent.click(screen.getByText('+ status'))
    expect(onAddColumn).toHaveBeenCalledWith(
      expect.objectContaining({ field: 'status', label: 'Status' }),
    )
  })
})
