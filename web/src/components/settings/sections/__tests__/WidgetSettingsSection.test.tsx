import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const { modalState } = vi.hoisted(() => ({
  modalState: {
    isOpen: false,
    open: vi.fn(),
    close: vi.fn(),
  },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}))

vi.mock('../../../../lib/modals', () => ({
  useModalState: () => modalState,
}))

vi.mock('../../../widgets/WidgetExportModal', () => ({
  WidgetExportModal: ({ isOpen }: { isOpen: boolean }) => (
    <div data-testid="widget-export-modal" data-open={String(isOpen)}>
      widget-modal
    </div>
  ),
}))

import { WidgetSettingsSection } from '../WidgetSettingsSection'

describe('WidgetSettingsSection', () => {
  beforeEach(() => {
    modalState.isOpen = false
    modalState.open.mockClear()
    modalState.close.mockClear()
  })

  it('renders the section and passes the closed state to the modal by default', () => {
    render(<WidgetSettingsSection />)

    expect(screen.getByText('settings.widget.title')).toBeInTheDocument()
    expect(screen.getByTestId('widget-export-modal')).toHaveAttribute('data-open', 'false')
  })

  it('opens the export modal when the button is clicked', () => {
    render(<WidgetSettingsSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Export Desktop Widget' }))

    expect(modalState.open).toHaveBeenCalledTimes(1)
  })

  it('passes the open state through to the export modal', () => {
    modalState.isOpen = true

    render(<WidgetSettingsSection />)

    expect(screen.getByTestId('widget-export-modal')).toHaveAttribute('data-open', 'true')
  })
})
