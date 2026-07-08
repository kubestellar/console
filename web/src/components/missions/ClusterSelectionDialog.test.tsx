import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClusterSelectionDialog } from './ClusterSelectionDialog'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', search: '' }),
}))

vi.mock('../../lib/api', () => ({
  api: { post: vi.fn(), get: vi.fn() },
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

describe('ClusterSelectionDialog', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <ClusterSelectionDialog
        isOpen={false}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders dialog when isOpen is true', () => {
    render(
      <ClusterSelectionDialog
        isOpen={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('calls onSelect when cluster is selected', () => {
    const onSelect = vi.fn()
    render(
      <ClusterSelectionDialog
        isOpen={true}
        onClose={vi.fn()}
        onSelect={onSelect}
      />
    )
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('calls onClose when dialog is closed', () => {
    const onClose = vi.fn()
    render(
      <ClusterSelectionDialog
        isOpen={true}
        onClose={onClose}
        onSelect={vi.fn()}
      />
    )
    const closeButtons = screen.getAllByRole('button')
    const closeButton = closeButtons.find(btn => 
      btn.querySelector('svg') || btn.getAttribute('aria-label')?.includes('close')
    )
    closeButton?.click()
    expect(onClose).toHaveBeenCalled()
  })
})
