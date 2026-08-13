import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConflictList } from './ConflictList'

const t = (key: string) => key

describe('ConflictList', () => {
  it('renders one input per step', () => {
    render(
      <ConflictList
        steps={['first step', 'second step']}
        isBusy={false}
        isGenerating={false}
        onStepChange={vi.fn()}
        onAddStep={vi.fn()}
        onRemoveStep={vi.fn()}
        t={t}
      />
    )

    expect(screen.getByDisplayValue('first step')).toBeInTheDocument()
    expect(screen.getByDisplayValue('second step')).toBeInTheDocument()
  })

  it('calls onStepChange with the edited index when an input changes', async () => {
    const onStepChange = vi.fn()
    const user = userEvent.setup()

    render(
      <ConflictList
        steps={['first step']}
        isBusy={false}
        isGenerating={false}
        onStepChange={onStepChange}
        onAddStep={vi.fn()}
        onRemoveStep={vi.fn()}
        t={t}
      />
    )

    await user.type(screen.getByDisplayValue('first step'), '!')
    expect(onStepChange).toHaveBeenCalledWith(0, expect.any(String))
  })

  it('calls onAddStep when the add-step button is clicked', async () => {
    const onAddStep = vi.fn()
    const user = userEvent.setup()

    render(
      <ConflictList
        steps={['first step']}
        isBusy={false}
        isGenerating={false}
        onStepChange={vi.fn()}
        onAddStep={onAddStep}
        onRemoveStep={vi.fn()}
        t={t}
      />
    )

    await user.click(screen.getByText('dashboard.missions.addStep'))
    expect(onAddStep).toHaveBeenCalledTimes(1)
  })

  it('hides the remove button when there is only one step', () => {
    render(
      <ConflictList
        steps={['only step']}
        isBusy={false}
        isGenerating={false}
        onStepChange={vi.fn()}
        onAddStep={vi.fn()}
        onRemoveStep={vi.fn()}
        t={t}
      />
    )

    // Only the add-step button should be present — no remove ("X") buttons.
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('calls onRemoveStep with the correct index when a remove button is clicked', async () => {
    const onRemoveStep = vi.fn()
    const user = userEvent.setup()

    render(
      <ConflictList
        steps={['step one', 'step two']}
        isBusy={false}
        isGenerating={false}
        onStepChange={vi.fn()}
        onAddStep={vi.fn()}
        onRemoveStep={onRemoveStep}
        t={t}
      />
    )

    const removeButtons = screen.getAllByRole('button').filter((btn) => btn.textContent === '')
    await user.click(removeButtons[1])
    expect(onRemoveStep).toHaveBeenCalledWith(1)
  })

  it('disables inputs and buttons while busy', () => {
    render(
      <ConflictList
        steps={['step one', 'step two']}
        isBusy={true}
        isGenerating={false}
        onStepChange={vi.fn()}
        onAddStep={vi.fn()}
        onRemoveStep={vi.fn()}
        t={t}
      />
    )

    expect(screen.getByDisplayValue('step one')).toBeDisabled()
    expect(screen.getByText('dashboard.missions.addStep')).toBeDisabled()
  })

  it('shows the generating placeholder on empty steps when isGenerating is true', () => {
    render(
      <ConflictList
        steps={['']}
        isBusy={false}
        isGenerating={true}
        onStepChange={vi.fn()}
        onAddStep={vi.fn()}
        onRemoveStep={vi.fn()}
        t={t}
      />
    )

    expect(screen.getByPlaceholderText('dashboard.missions.generating')).toBeInTheDocument()
  })
})
