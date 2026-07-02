import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SaveResolutionDialog } from './SaveResolutionDialog'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../lib/api', () => ({
  api: {
    post: vi.fn(),
  },
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}))

describe('SaveResolutionDialog', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <SaveResolutionDialog
        isOpen={false}
        onClose={vi.fn()}
        resolution=""
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders dialog when isOpen is true', () => {
    render(
      <SaveResolutionDialog
        isOpen={true}
        onClose={vi.fn()}
        resolution="kubectl rollout restart deployment/my-app"
      />
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('displays resolution content in dialog', () => {
    const resolution = 'kubectl delete pod my-pod'
    render(
      <SaveResolutionDialog
        isOpen={true}
        onClose={vi.fn()}
        resolution={resolution}
      />
    )
    expect(screen.getByText(new RegExp(resolution))).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <SaveResolutionDialog
        isOpen={true}
        onClose={onClose}
        resolution="test resolution"
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
