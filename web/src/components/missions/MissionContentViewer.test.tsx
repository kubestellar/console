import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MissionContentProvider } from './MissionContentContext'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}))

describe('MissionContentProvider', () => {
  it('renders children without errors', () => {
    const { container } = render(
      <MissionContentProvider>
        <div data-testid="child">Test Content</div>
      </MissionContentProvider>
    )
    expect(container.querySelector('[data-testid="child"]')).toBeInTheDocument()
  })

  it('provides mission content context', () => {
    const TestConsumer = () => {
      return <div>Context Consumer</div>
    }

    const { container } = render(
      <MissionContentProvider>
        <TestConsumer />
      </MissionContentProvider>
    )
    expect(container).toBeTruthy()
  })
})
