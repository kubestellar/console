import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProactiveNudge } from './ProactiveNudge'
import type { StellarObservation } from '../../types/stellar'

const baseNudge: StellarObservation = {
  id: 'nudge-1',
  summary: 'CPU usage is high on prod-cluster',
}

describe('ProactiveNudge', () => {
  it('renders the nudge summary', () => {
    render(
      <ProactiveNudge
        nudge={baseNudge}
        onDismiss={() => {}}
        onApplySuggestion={() => {}}
      />
    )
    expect(screen.getByText('CPU usage is high on prod-cluster')).toBeInTheDocument()
  })

  it('renders suggestion button when suggest is provided', () => {
    const nudge: StellarObservation = { ...baseNudge, suggest: 'Scale up the deployment' }
    render(
      <ProactiveNudge
        nudge={nudge}
        onDismiss={() => {}}
        onApplySuggestion={() => {}}
      />
    )
    expect(screen.getByText('\u2192 Scale up the deployment')).toBeInTheDocument()
  })

  it('does not render suggestion button when suggest is absent', () => {
    render(
      <ProactiveNudge
        nudge={baseNudge}
        onDismiss={() => {}}
        onApplySuggestion={() => {}}
      />
    )
    expect(screen.queryByRole('button', { name: /scale/i })).not.toBeInTheDocument()
  })

  it('calls onApplySuggestion with suggest text when clicked', () => {
    const onApply = vi.fn()
    const nudge: StellarObservation = { ...baseNudge, suggest: 'Scale up the deployment' }
    render(
      <ProactiveNudge
        nudge={nudge}
        onDismiss={() => {}}
        onApplySuggestion={onApply}
      />
    )
    fireEvent.click(screen.getByText('\u2192 Scale up the deployment'))
    expect(onApply).toHaveBeenCalledWith('Scale up the deployment')
  })

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    render(
      <ProactiveNudge
        nudge={baseNudge}
        onDismiss={onDismiss}
        onApplySuggestion={() => {}}
      />
    )
    fireEvent.click(screen.getByLabelText('Dismiss nudge'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('renders reasoning in a details element when provided', () => {
    const nudge: StellarObservation = { ...baseNudge, reasoning: 'High request rate observed' }
    render(
      <ProactiveNudge
        nudge={nudge}
        onDismiss={() => {}}
        onApplySuggestion={() => {}}
      />
    )
    expect(screen.getByText('High request rate observed')).toBeInTheDocument()
  })
})
