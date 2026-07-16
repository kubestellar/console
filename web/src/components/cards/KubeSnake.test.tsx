import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KubeSnake } from './KubeSnake'

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

vi.mock('@/lib/utils/localStorage', () => ({
  safeGetItem: vi.fn(() => null),
  safeSetItem: vi.fn(),
}))

describe('KubeSnake', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    render(<KubeSnake />)
    // KubeSnake uses h3 headings
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument()
  })

  it('displays game canvas element', () => {
    render(<KubeSnake />)
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('shows play button initially', () => {
    render(<KubeSnake />)
    const playButton = screen.getByRole('button', { name: /start game/i })
    expect(playButton).toBeInTheDocument()
  })

  it('displays score display', () => {
    render(<KubeSnake />)
    expect(screen.getAllByText('0')[0]).toBeInTheDocument()
  })

  it('renders high score section', () => {
    render(<KubeSnake />)
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
  })
})
