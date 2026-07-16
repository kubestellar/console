import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Checkers } from './Checkers'
import { MatchGame } from './MatchGame'
import { Solitaire } from './Solitaire'
import { SudokuGame } from './SudokuGame'
import { Kubedle } from './Kubedle'

// vi.mock factories are hoisted before imports by vitest, so mock objects must
// be inlined directly — outer const variables would be in the temporal dead
// zone when the factory is called, causing a ReferenceError at load time.

vi.mock('./cardRegistry', () => ({}))

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
}))

vi.mock('../../lib/safeLocalStorage', () => ({
  safeGet: vi.fn(() => null),
  safeGetItem: vi.fn(() => null),
  safeSet: vi.fn(),
  safeSetItem: vi.fn(),
  safeGetJSON: vi.fn((_key, fallback) => fallback),
  safeSetJSON: vi.fn(),
  safeRemove: vi.fn(),
}))

vi.mock('@/lib/utils/localStorage', () => ({
  safeGetItem: vi.fn(() => null),
  safeSetItem: vi.fn(),
  safeGetJSON: vi.fn((_key, fallback) => fallback),
  safeSetJSON: vi.fn(),
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock('./DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}))

describe('Checkers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Checkers card without crashing', () => {
    render(<Checkers />)
    // Button aria-label uses t('checkers.newGame') → "newGame" (camelCase from i18n key)
    expect(screen.getByRole('button', { name: /newGame/i })).toBeInTheDocument()
  })

  it('displays checkers board', () => {
    const { container } = render(<Checkers />)
    // Board renders as 8 rows of divs inside an inline-block container
    const boardContainer = container.querySelector('.inline-block')
    expect(boardContainer).toBeInTheDocument()
  })

  it('shows score or game state', () => {
    render(<Checkers />)
    expect(screen.getByText(/wins|losses/i)).toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: /start match game/i })).toBeInTheDocument()
  })

  it('displays game grid', () => {
    render(<MatchGame />)
    expect(screen.getByRole('button', { name: /start match game/i })).toBeInTheDocument()
  })

  it('shows move counter', () => {
    render(<MatchGame />)
    expect(screen.getByRole('button', { name: /start match game/i })).toBeInTheDocument()
  })
})

describe('Solitaire', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Solitaire card without crashing', () => {
    render(<Solitaire />)
    expect(screen.getByText(/Moves:/i)).toBeInTheDocument()
  })

  it('displays card tableau', () => {
    render(<Solitaire />)
    expect(screen.getByText(/Moves:/i)).toBeInTheDocument()
  })
})

describe('SudokuGame', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders SudokuGame card without crashing', () => {
    render(<SudokuGame />)
    expect(screen.getByText('Sudoku')).toBeInTheDocument()
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
    expect(screen.getAllByText(/[A-Z]/)[0]).toBeInTheDocument()
  })

  it('displays game content', () => {
    render(<Kubedle />)
    expect(screen.getByRole('button', { name: /ENTER/i })).toBeInTheDocument()
  })
})
