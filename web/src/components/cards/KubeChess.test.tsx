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
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('displays chess board', () => {
    render(<KubeChess />)
    const board = document.querySelector('[role="grid"]')
    expect(board || screen.getByText(/chess|board/i)).toBeInTheDocument()
  })

  it('shows game status display', () => {
    render(<KubeChess />)
    expect(screen.getByText(/status|turn|move/i)).toBeInTheDocument()
  })

  it('displays move counter', () => {
    render(<KubeChess />)
    expect(screen.getByText(/move|turn/i)).toBeInTheDocument()
  })

  it('renders new game button', () => {
    render(<KubeChess />)
    const newGameButton = screen.getByRole('button', { name: /new|reset/i })
    expect(newGameButton).toBeInTheDocument()
  })

  it('shows difficulty selector', () => {
    render(<KubeChess />)
    const difficultyText = screen.queryByText(/difficulty|level|easy|medium|hard/i)
    expect(difficultyText).toBeTruthy()
  })
})
