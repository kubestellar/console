/// <reference types='@testing-library/jest-dom/vitest' />
import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardErrorFallback } from '../CardErrorFallback'

const mockUseDemoMode = vi.fn(() => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

describe('CardErrorFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('subscribes to demo mode changes', () => {
    render(
      <CardErrorFallback cardId="test-card">
        <div>child content</div>
      </CardErrorFallback>,
    )

    expect(mockUseDemoMode).toHaveBeenCalled()
    expect(screen.getByText('child content')).toBeInTheDocument()
  })
})
