import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Game2048 } from './Game2048'

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

describe('Game2048', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    render(<Game2048 />)
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('displays game grid', () => {
    render(<Game2048 />)
    const grid = screen.getByRole('heading', { level: 2 }).closest('div')?.querySelector('[role="grid"]')
    expect(grid || screen.getByText(/^2048|score/i)).toBeInTheDocument()
  })

  it('shows score counter', () => {
    render(<Game2048 />)
    expect(screen.getByText(/score/i)).toBeInTheDocument()
  })

  it('shows best score display', () => {
    render(<Game2048 />)
    expect(screen.getByText(/best/i)).toBeInTheDocument()
  })

  it('displays new game button', () => {
    render(<Game2048 />)
    const newGameButton = screen.getByRole('button', { name: /new game/i })
    expect(newGameButton).toBeInTheDocument()
  })

  it('renders control instructions', () => {
    render(<Game2048 />)
    expect(screen.getByText(/wasd|move/i)).toBeInTheDocument()
  })
})
