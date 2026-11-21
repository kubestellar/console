import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResourceTypeAccordion } from './ResourceTypeAccordion'

function renderAccordion(props: { isExpanded: boolean; disabled?: boolean; onToggle?: (k: string) => void }) {
  const onToggle = props.onToggle ?? vi.fn()
  render(
    <ResourceTypeAccordion
      typeKey="services"
      isExpanded={props.isExpanded}
      onToggle={onToggle}
      badgeColor="blue"
      badgeIcon={null}
      label="Svc"
      countLabel="(3)"
      disabled={props.disabled}
    >
      <div>child-content</div>
    </ResourceTypeAccordion>,
  )
  return { onToggle, button: screen.getByRole('button') }
}

describe('ResourceTypeAccordion', () => {
  it('renders label and count, hides children when collapsed', () => {
    renderAccordion({ isExpanded: false })
    expect(screen.getByText('Svc')).toBeInTheDocument()
    expect(screen.getByText('(3)')).toBeInTheDocument()
    expect(screen.queryByText('child-content')).not.toBeInTheDocument()
  })

  it('shows children when expanded', () => {
    renderAccordion({ isExpanded: true })
    expect(screen.getByText('child-content')).toBeInTheDocument()
  })

  it('calls onToggle with its typeKey when clicked', async () => {
    const user = userEvent.setup()
    const { onToggle, button } = renderAccordion({ isExpanded: false })
    await user.click(button)
    expect(onToggle).toHaveBeenCalledWith('services')
  })

  it('does not toggle when disabled', async () => {
    const user = userEvent.setup()
    const { onToggle, button } = renderAccordion({ isExpanded: false, disabled: true })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(onToggle).not.toHaveBeenCalled()
  })
})
