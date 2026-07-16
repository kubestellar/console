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
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('displays game canvas', () => {
    render(<PodBrothers />)
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('shows score display', () => {
    render(<PodBrothers />)
    expect(screen.getByText(/score|lives/i)).toBeInTheDocument()
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
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('displays game canvas', () => {
    render(<PodCrosser />)
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('shows score or level indicator', () => {
    render(<PodCrosser />)
    expect(screen.getByText(/score|level|cross/i)).toBeInTheDocument()
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
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('displays game canvas', () => {
    render(<PodPitfall />)
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('shows game status', () => {
    render(<PodPitfall />)
    expect(screen.getByText(/score|level|pitfall/i)).toBeInTheDocument()
  })
})

describe('PodSweeper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    render(<PodSweeper />)
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('displays game grid', () => {
    render(<PodSweeper />)
    const grid = document.querySelector('[role="grid"]')
    expect(grid || screen.getByText(/sweep|mine/i)).toBeInTheDocument()
  })

  it('shows game metrics', () => {
    render(<PodSweeper />)
    expect(screen.getByText(/sweep|mine|flag/i)).toBeInTheDocument()
  })
})
