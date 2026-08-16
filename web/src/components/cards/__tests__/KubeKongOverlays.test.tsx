import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KubeKongHud, KubeKongOverlays } from '../KubeKongOverlays'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

const hudProps = {
  score: 100,
  lives: 3,
  level: 2,
  highScore: 500,
  isPlaying: true,
  gameOver: false,
  isPaused: false,
  onTogglePause: vi.fn(),
  onStartGame: vi.fn(),
}

const overlayProps = {
  score: 0,
  isPlaying: false,
  gameOver: false,
  isPaused: false,
  won: false,
  onTogglePause: vi.fn(),
  onStartGame: vi.fn(),
}

describe('KubeKongHud', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders without crashing', () => {
    render(<KubeKongHud {...hudProps} />)
    expect(document.body).toBeTruthy()
  })

  it('renders score', () => {
    render(<KubeKongHud {...hudProps} />)
    expect(screen.getByText('100')).toBeInTheDocument()
  })
})

describe('KubeKongOverlays', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders without crashing (idle state)', () => {
    render(<KubeKongOverlays {...overlayProps} />)
    expect(document.body).toBeTruthy()
  })

  it('renders game-over state', () => {
    render(<KubeKongOverlays {...overlayProps} gameOver={true} />)
    expect(document.body).toBeTruthy()
  })
})
