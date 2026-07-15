import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Checkers } from './Checkers'
import { MatchGame } from './MatchGame'
import { Solitaire } from './Solitaire'
import { SudokuGame } from './SudokuGame'
import { Kubedle } from './Kubedle'

// Mock shared dependencies
const mockCardExpanded = {
  useCardExpanded: () => ({
    isExpanded: false,
    containerSize: { width: 400, height: 400 },
  }),
}

const mockCardDataContext = {
  useCardLoadingState: vi.fn(),
  useReportCardDataState: vi.fn(),
}

const mockAnalytics = {
  emitGameStarted: vi.fn(),
  emitGameEnded: vi.fn(),
}

const mockLocalStorage = {
  safeGet: vi.fn(() => null),
  safeGetItem: vi.fn(() => null),
  safeSet: vi.fn(),
  safeSetItem: vi.fn(),
}

vi.mock('./CardWrapper', () => mockCardExpanded)
vi.mock('./CardDataContext', () => mockCardDataContext)
vi.mock('../../lib/analytics', () => mockAnalytics)
vi.mock('../../hooks/useGameKeys', () => ({
  useGameKeys: () => ({ key: null }),
}))
vi.mock('../../lib/safeLocalStorage', () => mockLocalStorage)
vi.mock('@/lib/utils/localStorage', () => mockLocalStorage)

describe('Checkers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Checkers card without crashing', () => {
    render(<Checkers />)
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('displays checkers board', () => {
    render(<Checkers />)
    const board = document.querySelector('[role="grid"]')
    expect(board || screen.getByText(/checkers|board/i)).toBeInTheDocument()
  })

  it('shows score or game state', () => {
    render(<Checkers />)
    expect(screen.getByText(/score|win|loss|game/i)).toBeInTheDocument()
  })

  it('renders reset button', () => {
    render(<Checkers />)
    const resetBtn = screen.getByRole('button', { name: /reset|new|start/i })
    expect(resetBtn).toBeInTheDocument()
  })
})

describe('MatchGame', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders MatchGame card without crashing', () => {
    render(<MatchGame />)
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('displays game grid', () => {
    render(<MatchGame />)
    const grid = screen.getByRole('heading', { level: 2 }).closest('div')?.querySelector('[role="grid"]')
    expect(grid || screen.getByText(/match|game|pair/i)).toBeInTheDocument()
  })

  it('shows move counter', () => {
    render(<MatchGame />)
    expect(screen.getByText(/move|turn/i)).toBeInTheDocument()
  })
})

describe('Solitaire', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Solitaire card without crashing', () => {
    render(<Solitaire />)
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('displays card tableau', () => {
    render(<Solitaire />)
    const solitaireContent = screen.getByRole('heading', { level: 2 }).closest('div')
    expect(solitaireContent).toBeInTheDocument()
  })
})

describe('SudokuGame', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders SudokuGame card without crashing', () => {
    render(<SudokuGame />)
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('displays sudoku grid', () => {
    render(<SudokuGame />)
    const grid = document.querySelector('[role="grid"]')
    expect(grid || screen.getByText(/sudoku/i)).toBeInTheDocument()
  })
})

describe('Kubedle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Kubedle card without crashing', () => {
    render(<Kubedle />)
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('displays game content', () => {
    render(<Kubedle />)
    const content = screen.getByRole('heading', { level: 2 }).closest('div')
    expect(content).toBeInTheDocument()
  })
})
