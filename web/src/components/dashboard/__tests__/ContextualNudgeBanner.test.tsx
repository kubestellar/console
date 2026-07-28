import React from 'react'
/**
 * Coverage for ContextualNudgeBanner.tsx (Auto-QA #21690 — missing test file).
 *
 * Verifies per-nudge-type rendering (customize / pwa-install), the
 * drag-hint no-op case, and the action/dismiss callbacks.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContextualNudgeBanner } from '../ContextualNudgeBanner'

describe('ContextualNudgeBanner', () => {
  it('renders nothing for the drag-hint nudge type', () => {
    const { container } = render(
      <ContextualNudgeBanner nudgeType="drag-hint" onAction={vi.fn()} onDismiss={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders the customize nudge copy and action label', () => {
    render(<ContextualNudgeBanner nudgeType="customize" onAction={vi.fn()} onDismiss={vi.fn()} />)

    expect(screen.getByText('Make it yours')).toBeVisible()
    expect(screen.getByText('Add a card')).toBeVisible()
  })

  it('renders the pwa-install nudge copy and action label', () => {
    render(<ContextualNudgeBanner nudgeType="pwa-install" onAction={vi.fn()} onDismiss={vi.fn()} />)

    expect(screen.getByText('Quick access')).toBeVisible()
    expect(screen.getByText('Install widget')).toBeVisible()
  })

  it('invokes onAction when the action button is clicked', () => {
    const onAction = vi.fn()
    render(<ContextualNudgeBanner nudgeType="customize" onAction={onAction} onDismiss={vi.fn()} />)

    fireEvent.click(screen.getByText('Add a card'))

    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('invokes onDismiss when the dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    render(<ContextualNudgeBanner nudgeType="pwa-install" onAction={vi.fn()} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByTitle('Dismiss'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
