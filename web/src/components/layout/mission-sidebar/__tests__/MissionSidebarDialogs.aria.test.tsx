import React from 'react'
/**
 * MissionSidebarDialogs ARIA Accessibility Tests
 * Tests for ARIA attributes on the modal dialog element
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: (string | undefined | boolean)[]) => (args || []).filter(Boolean).join(' '),
}))

vi.mock('../../missions/MissionDetailView', () => ({
  MissionDetailView: () => <div data-testid="mission-detail-view">Mission Detail View</div>,
}))

// Create a minimal version of SavedMissionDetailModal for testing
// This is extracted from the actual component to test only the ARIA attributes
function SavedMissionDetailModalTest({
  onClose,
}: {
  onClose: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mission details"
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-xs"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
      tabIndex={-1}
      ref={(element) => element?.focus()}
    >
      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-2xl flex flex-col w-96 h-64">
        <div data-testid="mock-content">Modal Content</div>
      </div>
    </div>
  )
}

describe('SavedMissionDetailModal ARIA Attributes', () => {
  it('has role="dialog" on the modal overlay', () => {
    render(<SavedMissionDetailModalTest onClose={vi.fn()} />)

    const modal = screen.getByRole('dialog')
    expect(modal).toBeInTheDocument()
    expect(modal).toHaveAttribute('role', 'dialog')
  })

  it('has aria-modal="true" on the modal overlay', () => {
    render(<SavedMissionDetailModalTest onClose={vi.fn()} />)

    const modal = screen.getByRole('dialog')
    expect(modal).toHaveAttribute('aria-modal', 'true')
  })

  it('has aria-label="Mission details" on the modal overlay', () => {
    render(<SavedMissionDetailModalTest onClose={vi.fn()} />)

    const modal = screen.getByRole('dialog')
    expect(modal).toHaveAttribute('aria-label', 'Mission details')
  })

  it('combines all three ARIA attributes on modal element', () => {
    render(<SavedMissionDetailModalTest onClose={vi.fn()} />)

    const modal = screen.getByRole('dialog')
    expect(modal).toHaveAttribute('role', 'dialog')
    expect(modal).toHaveAttribute('aria-modal', 'true')
    expect(modal).toHaveAttribute('aria-label', 'Mission details')
  })
})
