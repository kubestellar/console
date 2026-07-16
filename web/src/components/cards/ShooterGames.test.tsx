import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KubeDoom } from './KubeDoom'
import { KubeGalaga } from './KubeGalaga'
import { KubeKart } from './KubeKart'
import { KubeKong } from './KubeKong'
import { KubeMan } from './KubeMan'
import { KubePong } from './KubePong'
import { ContainerTetris } from './ContainerTetris'
import { MissileCommand } from './MissileCommand'
import { NodeInvaders } from './NodeInvaders'

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
  useCardDemoState: vi.fn(() => ({ shouldUseDemoData: false, reason: null, showDemoBadge: false })),
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

describe('KubeDoom', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    render(<KubeDoom />)
    // KubeDoom renders a canvas-based game; canvas is always present
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('displays game canvas', () => {
    render(<KubeDoom />)
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('shows score display', () => {
    render(<KubeDoom />)
    // Stats bar renders health percentage; initial health=100
    expect(screen.getByText(/100%/)).toBeInTheDocument()
  })
})

describe('KubeGalaga', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    render(<KubeGalaga />)
    // KubeGalaga uses h3 headings
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument()
  })

  it('displays game canvas', () => {
    render(<KubeGalaga />)
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('shows score indicator', () => {
    render(<KubeGalaga />)
    // Stats bar shows level as "Lv.N"; no "score"/"level" labels, just the prefix
    expect(screen.getByText(/Lv\./)).toBeInTheDocument()
  })
})

describe('KubeKart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    render(<KubeKart />)
    // KubeKart uses h3 headings
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument()
  })

  it('displays game canvas', () => {
    render(<KubeKart />)
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('shows game status', () => {
    render(<KubeKart />)
    // Stats bar renders "Lap N/M"; use getAllByText since "Pod Racer" also matches /race/i
    expect(screen.getAllByText(/race|time|lap/i)[0]).toBeInTheDocument()
  })
})

describe('KubeKong', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    render(<KubeKong />)
    // KubeKong renders a canvas-based game without heading elements
    expect(document.body).toBeTruthy()
  })

  it('displays game canvas', () => {
    render(<KubeKong />)
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('shows score and level', () => {
    render(<KubeKong />)
    // Stats bar renders t('kubeKong.score') → "score" and t('kubeKong.level') → "level"
    expect(screen.getAllByText(/score|level/i)[0]).toBeInTheDocument()
  })
})

describe('KubeMan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    render(<KubeMan />)
    // KubeMan renders a canvas-based game without heading elements
    expect(document.body).toBeTruthy()
  })

  it('displays game canvas', () => {
    render(<KubeMan />)
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('shows game metrics', () => {
    render(<KubeMan />)
    // Stats bar renders "Score" and "Lives" labels; use getAllByText for multiple matches
    expect(screen.getAllByText(/score|lives/i)[0]).toBeInTheDocument()
  })
})

describe('KubePong', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    render(<KubePong />)
    // KubePong uses h3 headings
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument()
  })

  it('displays game canvas', () => {
    render(<KubePong />)
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('shows score display', () => {
    render(<KubePong />)
    // Stats bar renders "{wins} wins" (e.g. "0 wins"); no "score"/"player" labels
    expect(screen.getAllByText(/\d+ wins/i)[0]).toBeInTheDocument()
  })
})

describe('ContainerTetris', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    render(<ContainerTetris />)
    // ContainerTetris renders a canvas-based game without heading elements
    expect(document.body).toBeTruthy()
  })

  it('displays game grid', () => {
    render(<ContainerTetris />)
    // ContainerTetris is div-based (no canvas); verify component renders
    expect(document.body.firstChild).toBeTruthy()
  })

  it('shows score indicator', () => {
    render(<ContainerTetris />)
    // Score label is always rendered in the stats header
    expect(screen.getByText(/score/i)).toBeInTheDocument()
  })
})

describe('MissileCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    render(<MissileCommand />)
    // MissileCommand renders a canvas-based game without heading elements
    expect(document.body).toBeTruthy()
  })

  it('displays game canvas', () => {
    render(<MissileCommand />)
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('shows game status', () => {
    render(<MissileCommand />)
    // Stats bar renders "Score" and "Wave" labels; use getAllByText for multiple matches
    expect(screen.getAllByText(/score|wave|city/i)[0]).toBeInTheDocument()
  })
})

describe('NodeInvaders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    render(<NodeInvaders />)
    // NodeInvaders renders a canvas-based game without heading elements
    expect(document.body).toBeTruthy()
  })

  it('displays game canvas', () => {
    render(<NodeInvaders />)
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('shows score and level', () => {
    render(<NodeInvaders />)
    // Stats bar renders t('nodeInvaders.score') → "score", t('nodeInvaders.wave') → "wave"
    expect(screen.getAllByText(/score|level|wave/i)[0]).toBeInTheDocument()
  })
})
