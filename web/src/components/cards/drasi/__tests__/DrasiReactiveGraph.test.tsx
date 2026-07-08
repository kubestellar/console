import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DrasiReactiveGraph } from '../DrasiReactiveGraph'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  },
}))

// ── useDrasiResources ─────────────────────────────────────────────────────────

const mockUseDrasiResources = vi.fn()
vi.mock('../../../../hooks/useDrasiResources', () => ({
  useDrasiResources: () => mockUseDrasiResources(),
}))

// ── useDrasiConnections ───────────────────────────────────────────────────────

vi.mock('../../../../hooks/useDrasiConnections', () => ({
  useDrasiConnections: () => ({
    connections: [],
    activeId: '',
    activeConnection: null,
    addConnection: vi.fn(),
    updateConnection: vi.fn(),
    removeConnection: vi.fn(),
    setActive: vi.fn(),
  }),
}))

// ── useDrasiQueryStream ───────────────────────────────────────────────────────

vi.mock('../../../../hooks/useDrasiQueryStream', () => ({
  useDrasiQueryStream: () => ({ results: [], connected: false, error: null }),
}))

// ── useModalState ─────────────────────────────────────────────────────────────

vi.mock('../../../../lib/modals', () => ({
  useModalState: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}))

// ── CardDataContext ───────────────────────────────────────────────────────────

vi.mock('../../CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
}))

// ── Demo data helpers ─────────────────────────────────────────────────────────

vi.mock('../DrasiDemoData', () => ({
  generateDemoData: () => ({ sources: [], queries: [], reactions: [], liveResults: [] }),
  demoThemeForConnection: () => 'default',
}))

// ── Flow utilities ────────────────────────────────────────────────────────────

vi.mock('../DrasiFlowUtils', () => ({
  computeFlows: () => [],
  FLOW_ID_ALL: '__all__',
}))

// ── Section sub-components (render as identifiable placeholders) ──────────────

vi.mock('../DrasiReactiveGraphSections', () => ({
  DrasiHeaderControls: () => <div data-testid="drasi-header-controls" />,
  DrasiInstallBanner: () => <div data-testid="drasi-install-banner" />,
  DrasiKpiStrip: () => <div data-testid="drasi-kpi-strip" />,
  DrasiOverlays: () => <div data-testid="drasi-overlays" />,
  DrasiPipelineCanvas: () => <div data-testid="drasi-pipeline-canvas" />,
}))

// ── Skeleton ──────────────────────────────────────────────────────────────────

vi.mock('../../../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDrasiResourcesReturn(overrides: Record<string, unknown> = {}) {
  return {
    data: null,
    isLoading: false,
    isRefreshing: false,
    isDemoData: true,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    refetch: vi.fn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DrasiReactiveGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDrasiResources.mockReturnValue(makeDrasiResourcesReturn())
  })

  // ── loading state ─────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('renders skeleton placeholders when data is loading', () => {
      mockUseDrasiResources.mockReturnValue(
        makeDrasiResourcesReturn({ isLoading: true, data: null }),
      )
      render(<DrasiReactiveGraph />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })

    it('does not render the pipeline canvas while loading', () => {
      mockUseDrasiResources.mockReturnValue(
        makeDrasiResourcesReturn({ isLoading: true, data: null }),
      )
      render(<DrasiReactiveGraph />)
      expect(screen.queryByTestId('drasi-pipeline-canvas')).toBeNull()
    })

    it('does not render header controls while loading', () => {
      mockUseDrasiResources.mockReturnValue(
        makeDrasiResourcesReturn({ isLoading: true, data: null }),
      )
      render(<DrasiReactiveGraph />)
      expect(screen.queryByTestId('drasi-header-controls')).toBeNull()
    })
  })

  // ── main render (demo mode) ───────────────────────────────────────────────

  describe('main render — demo mode', () => {
    it('renders the header controls section', () => {
      render(<DrasiReactiveGraph />)
      expect(screen.getByTestId('drasi-header-controls')).toBeInTheDocument()
    })

    it('renders the install banner section', () => {
      render(<DrasiReactiveGraph />)
      expect(screen.getByTestId('drasi-install-banner')).toBeInTheDocument()
    })

    it('renders the KPI strip section', () => {
      render(<DrasiReactiveGraph />)
      expect(screen.getByTestId('drasi-kpi-strip')).toBeInTheDocument()
    })

    it('renders the pipeline canvas section', () => {
      render(<DrasiReactiveGraph />)
      expect(screen.getByTestId('drasi-pipeline-canvas')).toBeInTheDocument()
    })

    it('renders the overlays section', () => {
      render(<DrasiReactiveGraph />)
      expect(screen.getByTestId('drasi-overlays')).toBeInTheDocument()
    })

    it('does not show loading skeletons in demo mode', () => {
      render(<DrasiReactiveGraph />)
      expect(screen.queryByTestId('skeleton')).toBeNull()
    })
  })
})
