import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FlappyPod } from './FlappyPod'

vi.mock('./CardWrapper', () => ({
  useCardExpanded: () => ({
    isExpanded: false,
    containerSize: { width: 400, height: 400 },
  }),
}))

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
  useReportCardDataState: vi.fn(),
}))

vi.mock('../../lib/analytics', () => ({
  emitGameStarted: vi.fn(),
  emitGameEnded: vi.fn(),
}))

vi.mock('../../hooks/useGameKeys', () => ({
  useGameKeys: () => ({ key: null }),
  useGameKeyTracking: vi.fn(),
}))

vi.mock('../../lib/safeLocalStorage', () => ({
  safeGet: vi.fn(() => null),
  safeSet: vi.fn(),
}))

describe('FlappyPod', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    render(<FlappyPod />)
    // FlappyPod uses canvas, not a heading element
    expect(document.body).toBeTruthy()
  })

  it('displays game canvas', () => {
    render(<FlappyPod />)
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('shows score display', () => {
    render(<FlappyPod />)
    expect(screen.getByText(/score/i)).toBeInTheDocument()
  })

  it('displays high score section', () => {
    render(<FlappyPod />)
    expect(screen.getByText(/best/i)).toBeInTheDocument()
  })

  it('renders start/play button', () => {
    render(<FlappyPod />)
    const playButton = screen.getByRole('button', { name: /new game/i })
    expect(playButton).toBeInTheDocument()
  })

  it('shows instructions text', () => {
    render(<FlappyPod />)
    expect(screen.getByText(/press|space|click/i)).toBeInTheDocument()
  })
})
