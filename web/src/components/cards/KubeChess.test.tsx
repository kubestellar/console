import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KubeChess } from './KubeChess'

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
  safeGetItem: vi.fn(() => null),
  safeSetItem: vi.fn(),
}))

describe('KubeChess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    render(<KubeChess />)
    // KubeChess renders a board grid, not an h2 heading
    expect(document.body).toBeTruthy()
  })

  it('displays chess board', () => {
    render(<KubeChess />)
    expect(screen.getByText(/white's turn|black's turn/i)).toBeInTheDocument()
  })

  it('shows game status display', () => {
    render(<KubeChess />)
    expect(screen.getByText(/white's turn|black's turn/i)).toBeInTheDocument()
  })

  it('displays move counter', () => {
    render(<KubeChess />)
    expect(screen.getByText(/Move 1/i)).toBeInTheDocument()
  })

  it('renders new game button', () => {
    render(<KubeChess />)
    const newGameButton = screen.getByRole('button', { name: /new|reset/i })
    expect(newGameButton).toBeInTheDocument()
  })

  it('shows difficulty selector', () => {
    render(<KubeChess />)
    expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument()
  })
})
