import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

vi.mock('../../../../lib/modals/ConfirmDialog', () => ({
  ConfirmDialog: ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel,
  }: {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    title: string
    message: string
    confirmLabel?: string
  }) => isOpen ? (
    <div data-testid="confirm-dialog">
      <span>{title}</span>
      <span>{message}</span>
      <button onClick={onClose}>cancel</button>
      <button onClick={onConfirm}>{confirmLabel ?? 'Confirm'}</button>
    </div>
  ) : null,
}))

import { TokenUsageSection } from '../TokenUsageSection'

const baseUsage = {
  used: 250,
  limit: 1000,
  warningThreshold: 0.8,
  criticalThreshold: 0.95,
  resetDate: '2026-05-31T00:00:00.000Z',
}

describe('TokenUsageSection', () => {
  it('requires confirmation before saving a zero token limit', () => {
    const updateSettings = vi.fn()
    render(
      <TokenUsageSection
        usage={baseUsage}
        updateSettings={updateSettings}
        resetUsage={vi.fn()}
        isDemoData={false}
      />,
    )

    fireEvent.change(screen.getByLabelText('settings.tokens.monthlyLimit'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'settings.tokens.saveSettings' }))

    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('saves zero token limit only after confirmation', () => {
    const updateSettings = vi.fn()
    render(
      <TokenUsageSection
        usage={baseUsage}
        updateSettings={updateSettings}
        resetUsage={vi.fn()}
        isDemoData={false}
      />,
    )

    fireEvent.change(screen.getByLabelText('settings.tokens.monthlyLimit'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'settings.tokens.saveSettings' }))
    fireEvent.click(screen.getByRole('button', { name: 'settings.tokens.validation.limitZeroConfirmLabel' }))

    expect(updateSettings).toHaveBeenCalledWith({
      limit: 0,
      warningThreshold: 0.8,
      criticalThreshold: 0.95,
    })
  })

  it('leaves settings unchanged when the zero-limit dialog is cancelled', () => {
    const updateSettings = vi.fn()
    render(
      <TokenUsageSection
        usage={baseUsage}
        updateSettings={updateSettings}
        resetUsage={vi.fn()}
        isDemoData={false}
      />,
    )

    fireEvent.change(screen.getByLabelText('settings.tokens.monthlyLimit'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'settings.tokens.saveSettings' }))
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))

    expect(updateSettings).not.toHaveBeenCalled()
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
  })
})
