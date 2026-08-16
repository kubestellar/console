import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { DeleteUserConfirmModal } from '../UserManagementModal'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

vi.mock('../../lib/modals', () => ({
  ConfirmDialog: ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
    onCancel: () => void
  }) =>
    isOpen ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <span>{message}</span>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}))

describe('DeleteUserConfirmModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders nothing when userId is null', () => {
    const { container } = render(
      <DeleteUserConfirmModal userId={null} onClose={vi.fn()} onConfirm={vi.fn()} />
    )
    expect(container.querySelector('[data-testid="confirm-dialog"]')).toBeNull()
  })

  it('renders dialog when userId is provided', () => {
    const { getByTestId } = render(
      <DeleteUserConfirmModal userId="user-123" onClose={vi.fn()} onConfirm={vi.fn()} />
    )
    expect(getByTestId('confirm-dialog')).toBeInTheDocument()
  })
})
