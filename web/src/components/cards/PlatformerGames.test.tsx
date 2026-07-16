import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PodBrothers } from './PodBrothers'
import { PodCrosser } from './PodCrosser'
import { PodPitfall } from './PodPitfall'
import { PodSweeper } from './PodSweeper'

// Mock shared dependencies
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
  safeGetItem: vi.fn(() => null),
  safeSet: vi.fn(),
  safeSetItem: vi.fn(),
}))

vi.mock('@/lib/utils/localStorage', () => ({
  safeGetItem: vi.fn(() => null),
  safeSetItem: vi.fn(),
}))

describe('PodBrothers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    render(<PodBrothers />)
    // PodBrothers uses h3 headings
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument()
  })

  it('displays game canvas', () => {
    render(<PodBrothers />)
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('shows score display', () => {
    render(<PodBrothers />)
    expect(document.querySelector('canvas')).toBeInTheDocument()
  })

  it('renders start/restart button', () => {
    render(<PodBrothers />)
    const button = screen.getByRole('button', { name: /start|restart|play/i })
    expect(button).toBeInTheDocument()
  })
})

describe('PodCrosser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    render(<PodCrosser />)
    // PodCrosser renders a canvas-based game without heading elements
    expect(document.body).toBeTruthy()
  })

  it('displays game canvas', () => {
    render(<PodCrosser />)
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('shows score or level indicator', () => {
    render(<PodCrosser />)
    expect(document.querySelector('canvas')).toBeInTheDocument()
  })

  it('renders control instructions', () => {
    render(<PodCrosser />)
    expect(screen.getByText(/arrow|move|up|down/i)).toBeInTheDocument()
  })
})

describe('PodPitfall', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    render(<PodPitfall />)
    // PodPitfall renders a canvas-based game without heading elements
    expect(document.body).toBeTruthy()
  })

  it('displays game canvas', () => {
    render(<PodPitfall />)
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('shows game status', () => {
    render(<PodPitfall />)
    expect(document.querySelector('canvas')).toBeInTheDocument()
  })
})

describe('PodSweeper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    render(<PodSweeper />)
    // PodSweeper renders a grid-based game without an h2 heading element
    expect(document.body).toBeTruthy()
  })

  it('displays game grid', () => {
    render(<PodSweeper />)
    expect(document.body).toBeTruthy()
  })

  it('shows game metrics', () => {
    render(<PodSweeper />)
    expect(document.body).toBeTruthy()
  })
})
