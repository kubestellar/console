import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContextualNudgeBanner } from './ContextualNudgeBanner'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

describe('ContextualNudgeBanner', () => {
  it('renders nothing for drag-hint nudge type', () => {
    const { container } = render(
      <ContextualNudgeBanner nudgeType="drag-hint" onAction={vi.fn()} onDismiss={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the customize nudge with correct title and description', () => {
    render(<ContextualNudgeBanner nudgeType="customize" onAction={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByText('Make it yours')).toBeInTheDocument()
    expect(screen.getByText('Drag cards to rearrange, click + to add new ones, or try a template.')).toBeInTheDocument()
  })

  it('renders the customize nudge action button', () => {
    render(<ContextualNudgeBanner nudgeType="customize" onAction={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByText('Add a card')).toBeInTheDocument()
  })

  it('renders the pwa-install nudge with correct content', () => {
    render(<ContextualNudgeBanner nudgeType="pwa-install" onAction={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByText('Quick access')).toBeInTheDocument()
    expect(screen.getByText('Install widget')).toBeInTheDocument()
  })

  it('calls onAction when the action button is clicked', () => {
    const onAction = vi.fn()
    render(<ContextualNudgeBanner nudgeType="customize" onAction={onAction} onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByText('Add a card'))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('calls onDismiss when the dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    render(<ContextualNudgeBanner nudgeType="customize" onAction={vi.fn()} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByTitle('Dismiss'))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
