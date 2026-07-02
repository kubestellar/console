import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MissionLandingPage } from './MissionLandingPage'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({
    isDemoMode: false,
    setDemoMode: vi.fn(),
  }),
}))

describe('MissionLandingPage', () => {
  it('renders without errors', () => {
    const { container } = render(<MissionLandingPage />)
    expect(container).toBeTruthy()
  })

  it('displays landing page content', () => {
    const { container } = render(<MissionLandingPage />)
    expect(container.textContent).toBeTruthy()
  })
})
